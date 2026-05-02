# api/routes/resume.py
"""Resume Editor v1 API.

Endpoints:
  GET    /                  list user's resumes (summary)
  GET    /:id              full resume
  PUT    /:id              update doc + meta
  POST   /                 create blank resume
  POST   /parse            upload PDF, parse, return new resume
  POST   /:id/variant      fork variant
  POST   /:id/snapshot     create explicit snapshot
  GET    /:id/snapshots    list snapshots
  POST   /:id/restore      restore from snapshot id
  POST   /:id/ai/rewrite-bullet   AI tool dispatch
"""
import copy
import os
import re
import uuid
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from api.converters.resume import legacy_json_to_tiptap_doc
from api.models.resume import Resume, ResumeSnapshot, SnapshotTrigger
from api.services import resume_store, snapshot_store
from api.services.resume_store import _validate_id as _validate_resume_id
from services.resume_parser import is_scanned_pdf, parse_resume, parse_resume_from_image
from utils.chrome_pdf import url_to_pdf_chrome


router = APIRouter()


def _ensure_valid_id(value: str) -> None:
    """Boundary check: 400 on invalid id (rather than the 500 a ValueError yields)."""
    try:
        _validate_resume_id(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")


class CreateResumeRequest(BaseModel):
    title: str = "Untitled resume"
    id: Optional[str] = None


@router.get("/")
async def list_resumes() -> dict:
    """List the current user's resumes (summary view, no doc/sections).

    Uses ``list_all_dict`` so v1 files (auto-migrated on read) and freshly-
    saved v2 files both appear. Previously called ``list_all`` which silently
    dropped v2 files.
    """
    resumes = resume_store.list_all_dict()
    out = []
    for r in resumes:
        meta = r.get("metadata") or {}
        out.append({
            "id": r.get("id"),
            "title": r.get("title"),
            "parent_id": meta.get("parent_id"),
            # v2 dropped is_base from the schema; default to True so the field
            # remains in the API contract for the frontend list view.
            "is_base": meta.get("parent_id") is None,
            "target_company": meta.get("target_company"),
            "target_role": meta.get("target_role"),
            "updated_at": meta.get("updated_at"),
        })
    return {"resumes": out}


@router.get("/{resume_id}")
async def get_resume(resume_id: str) -> dict:
    """Get one resume in full, v3-shaped.

    Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 4.

    Files on disk MUST be schema_version: 3 (migration runs offline before
    deployment — see § 7). Older formats are rejected with 500 to surface
    the inconsistency rather than silently auto-migrate.
    """
    _ensure_valid_id(resume_id)
    try:
        raw = resume_store.load_v3_dict(resume_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Resume not found")
    return raw


@router.put("/{resume_id}")
async def upsert_resume(resume_id: str, payload: dict) -> dict:
    """Create or replace a resume with a v3-shaped doc. URL id always wins.

    Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 4 + § 7.3.

    The body must declare schema_version: 3. v2 payloads are rejected — the
    frontend writes v3 directly after Phase 3.
    """
    _ensure_valid_id(resume_id)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")
    if payload.get("schema_version") != 3:
        raise HTTPException(
            status_code=400,
            detail="Only v3 resumes accepted (schema_version must be 3)",
        )
    payload["id"] = resume_id
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="metadata is required")
    # Pydantic validate the full doc.
    from api.models.resume_v3 import ResumeV3
    try:
        ResumeV3.model_validate(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"v3 validation failed: {e}")
    # Refresh updated_at server-side.
    from datetime import datetime, timezone
    metadata["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    resume_store.save_v3_dict(payload)
    return payload


def _now_ms() -> int:
    import time
    return int(time.time() * 1000)


@router.post("/")
async def create_blank_resume(body: CreateResumeRequest) -> dict:
    """Create a new blank v3 resume.

    Writes a v3-shaped doc via ``save_v3_dict`` (which auto-creates a rolling
    backup on subsequent writes). Validates via ResumeV3 before persisting.
    """
    from datetime import datetime, timezone
    from api.models.resume_v3 import ResumeV3

    rid = body.id or str(uuid.uuid4())
    _ensure_valid_id(rid)
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    doc = {
        "schema_version": 3,
        "id": rid,
        "title": body.title or "Untitled Resume",
        "template_id": "minimal-single-column",
        "rows": [],
        "groups": [],
        "metadata": {
            "created_at": now_iso,
            "updated_at": now_iso,
        },
    }
    ResumeV3.model_validate(doc)
    resume_store.save_v3_dict(doc)
    return doc


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes via pypdf. Returns empty string on failure."""
    import io
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        chunks = []
        for page in reader.pages:
            text = page.extract_text() or ""
            chunks.append(text)
        return "\n".join(chunks)
    except Exception:
        return ""


@router.post("/parse")
async def parse_pdf(file: UploadFile = File(...)) -> dict:
    """Upload a PDF, parse it, persist as a new v3 Resume.

    ⚠ Known technical debt: parse path keeps a v2-shape intermediate
    (parser output → _python_v2_to_v3 → v3). Documented as follow-up.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be a PDF")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF too large (max 10 MB)")

    text = _extract_pdf_text(pdf_bytes)
    text_model = os.environ.get("CAREEROPS_MODEL", "gpt-4o-mini")
    vision_model = os.environ.get("CAREEROPS_VISION_MODEL", "gpt-4o")
    api_key = os.environ.get("OPENAI_API_KEY", "")

    # Default to vision: text extraction from fancy resume PDFs (Canva,
    # two-column templates) is unreliable. Vision sees the rendered layout
    # and produces much more accurate structured output.
    # Set CAREEROPS_PARSE_MODE=text to force the cheaper text-only path.
    parse_mode = os.environ.get("CAREEROPS_PARSE_MODE", "vision").lower()
    use_vision = parse_mode == "vision" or (not text) or is_scanned_pdf(text)

    try:
        if use_vision:
            result = parse_resume_from_image(pdf_bytes, api_key, vision_model)
            # Fall back to text if vision failed AND we have text
            if not result.get("success") and text and not is_scanned_pdf(text):
                result = parse_resume(text, text_model, api_key)
        else:
            result = parse_resume(text, text_model, api_key)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}") from exc

    if not isinstance(result, dict) or not result.get("success"):
        err = (result or {}).get("error", "unknown") if isinstance(result, dict) else "invalid shape"
        raise HTTPException(status_code=500, detail=f"Parse failed: {err}")

    v2_dict = result.get("data") or {}
    if not isinstance(v2_dict, dict) or not v2_dict:
        raise HTTPException(status_code=500, detail="Parser returned no data")

    # Derive title from parser output / filename before conversion.
    raw_title = (v2_dict.get("name") or v2_dict.get("title") or file.filename or "Imported resume").strip()
    if raw_title.lower().endswith(".pdf"):
        raw_title = raw_title[:-4]
    v2_dict.setdefault("title", raw_title or "Imported resume")

    rid = str(uuid.uuid4())
    from api.services.parse_v2_to_v3 import _python_v2_to_v3
    from api.models.resume_v3 import ResumeV3
    v3_dict = _python_v2_to_v3(v2_dict, resume_id=rid)
    # Override title with the cleaned-up name.
    v3_dict["title"] = raw_title or "Imported resume"
    try:
        ResumeV3.model_validate(v3_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"v3 validation after parse failed: {e}") from e
    resume_store.save_v3_dict(v3_dict)
    return v3_dict


class SnapshotRequest(BaseModel):
    trigger: SnapshotTrigger = "manual_save"
    label: Optional[str] = None
    diff_summary: Optional[str] = None
    ai_message_id: Optional[str] = None


@router.post("/{resume_id}/snapshot")
async def create_snapshot(resume_id: str, body: SnapshotRequest) -> ResumeSnapshot:
    _ensure_valid_id(resume_id)
    try:
        r = resume_store.load_v3_dict(resume_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Resume not found")
    # Snapshot ``doc`` field carries the entire v3 resume dict so restore can
    # round-trip it back through save_v3_dict.
    snap = ResumeSnapshot(
        id=str(uuid.uuid4()),
        resume_id=resume_id,
        created_at=_now_ms(),
        trigger=body.trigger,
        label=body.label,
        diff_summary=body.diff_summary,
        ai_message_id=body.ai_message_id,
        doc=r,
    )
    snapshot_store.save(snap)
    snapshot_store.enforce_retention(resume_id)
    return snap


@router.get("/{resume_id}/snapshots")
async def list_snapshots(resume_id: str) -> dict:
    _ensure_valid_id(resume_id)
    snaps = snapshot_store.list_for_resume(resume_id)
    return {"snapshots": [s.model_dump(exclude_none=True) for s in snaps]}


class RestoreRequest(BaseModel):
    snapshot_id: str


@router.post("/{resume_id}/restore")
async def restore_snapshot(resume_id: str, body: RestoreRequest) -> dict:
    _ensure_valid_id(resume_id)
    _ensure_valid_id(body.snapshot_id)
    snap = snapshot_store.get(body.snapshot_id)
    if snap is None or snap.resume_id != resume_id:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    # Re-read the resume right before mutating so an autosave that landed
    # between request arrival and now is captured by the pre-restore checkpoint.
    try:
        current = resume_store.load_v3_dict(resume_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Resume not found")

    pre = ResumeSnapshot(
        id=str(uuid.uuid4()),
        resume_id=resume_id,
        created_at=_now_ms(),
        trigger="checkpoint",  # preserve forever so users can recover
        label=f"Pre-restore (snap {body.snapshot_id[:8]})",
        diff_summary=f"Pre-restore checkpoint (restored to {body.snapshot_id})",
        doc=current,
    )
    snapshot_store.save(pre)

    # snap.doc must be a v3-shaped dict. Snapshots created after this task
    # always store v3. Legacy v1/v2 snapshots are not supported on the v3
    # restore path — reject gracefully rather than silently corrupt.
    snap_doc = snap.doc or {}
    if snap_doc.get("schema_version") != 3:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Snapshot {body.snapshot_id} has schema_version="
                f"{snap_doc.get('schema_version')} — only v3 snapshots "
                "can be restored after the v3 migration."
            ),
        )

    # URL id always wins.
    restored = dict(snap_doc)
    restored["id"] = resume_id
    meta = restored.setdefault("metadata", {})
    from datetime import datetime, timezone
    meta["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    from api.models.resume_v3 import ResumeV3
    try:
        ResumeV3.model_validate(restored)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Snapshot v3 validation failed: {e}") from e

    resume_store.save_v3_dict(restored)
    snapshot_store.enforce_retention(resume_id)
    return restored


class VariantRequest(BaseModel):
    title: str
    target_company: Optional[str] = None
    target_company_domain: Optional[str] = None
    target_role: Optional[str] = None


@router.post("/{resume_id}/variant")
async def create_variant(resume_id: str, body: VariantRequest) -> dict:
    _ensure_valid_id(resume_id)
    try:
        parent = resume_store.load_v3_dict(resume_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Parent resume not found")

    new_id = str(uuid.uuid4())
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    variant = copy.deepcopy(parent)
    variant["id"] = new_id
    variant["title"] = body.title
    meta = variant.setdefault("metadata", {})
    meta["parent_id"] = parent["id"]
    meta["created_at"] = now_iso
    meta["updated_at"] = now_iso
    if body.target_company is not None:
        meta["target_company"] = body.target_company
    if body.target_role is not None:
        meta["target_role"] = body.target_role
    if body.target_company_domain is not None:
        meta["target_company_domain"] = body.target_company_domain

    from api.models.resume_v3 import ResumeV3
    try:
        ResumeV3.model_validate(variant)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"v3 validation failed: {e}") from e

    resume_store.save_v3_dict(variant)
    return variant


@router.get("/{resume_id}/pdf")
async def export_pdf(resume_id: str, frontend_base: Optional[str] = None):
    """Render the resume to PDF (headless Chromium) and stream it back as a
    download.

    Architecture: Playwright loads the frontend's /resume/:id/print route
    in headless Chromium and prints THAT to PDF. This guarantees the PDF
    is bit-for-bit identical to what the editor canvas shows — same React
    components, same TipTap, same CSS, same Inter font. Single source of
    truth for rendering.

    GET so the frontend can use a plain <a href download> for one-click
    download — no JS, no preview window, no print dialog.
    """
    _ensure_valid_id(resume_id)
    try:
        r = resume_store.load_v3_dict(resume_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Resolution order for the frontend URL Playwright loads:
    # 1. Explicit ?frontend_base= query param (frontend tells us its origin —
    #    handles Next dev auto-bumping the port to 3001/3002).
    # 2. CAREEROPS_FRONTEND_BASE env var (production override).
    # 3. Default localhost:3000.
    # Validate the param to allow only http(s)://localhost or 127.0.0.1 — never
    # let a caller point Playwright at an arbitrary host.
    base = frontend_base or os.environ.get("CAREEROPS_FRONTEND_BASE", "http://localhost:3000")
    if not re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", base):
        base = os.environ.get("CAREEROPS_FRONTEND_BASE", "http://localhost:3000")
    print_url = f"{base}/resume/{resume_id}/print"

    pdf_bytes = await url_to_pdf_chrome(print_url)
    if pdf_bytes is None:
        raise HTTPException(status_code=500, detail="PDF generation failed")

    from fastapi import Response

    # Use the resume title as the download filename, sanitized.
    title = r.get("title") or "resume"
    safe = "".join(c if c.isalnum() or c in (" ", "-", "_") else "_" for c in title).strip()
    filename = (safe or "resume") + ".pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


from api.models.resume import ToolCall


class RewriteBulletRequest(BaseModel):
    bullet_text: str
    preset: str = "default"
    custom_instructions: Optional[str] = None  # use Optional for Python 3.9 compat


@router.post("/{resume_id}/ai/rewrite-bullet")
async def rewrite_bullet(resume_id: str, body: RewriteBulletRequest) -> dict:
    _ensure_valid_id(resume_id)
    from api.services import ai_orchestrator

    results = ai_orchestrator.execute_tool_calls(
        resume_id=resume_id,
        calls=[ToolCall(
            name="rewrite_bullet",
            arguments={
                "bullet_text": body.bullet_text,
                "preset": body.preset,
                "custom_instructions": body.custom_instructions,
            },
        )],
    )
    res = results[0]
    if not res.success:
        raise HTTPException(status_code=422, detail=res.error or "rewrite failed")
    return res.data or {}
