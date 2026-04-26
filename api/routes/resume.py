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


@router.get("/")
async def list_resumes() -> dict:
    """List the current user's resumes (summary view, no doc)."""
    resumes = resume_store.list_all()
    return {
        "resumes": [
            {
                "id": r.id,
                "title": r.title,
                "parent_id": r.parent_id,
                "is_base": r.is_base,
                "target_company": r.target_company,
                "target_role": r.target_role,
                "updated_at": r.updated_at,
            }
            for r in resumes
        ],
    }


@router.get("/{resume_id}")
async def get_resume(resume_id: str) -> Resume:
    """Get one resume in full (meta + doc)."""
    _ensure_valid_id(resume_id)
    r = resume_store.get(resume_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return r


@router.put("/{resume_id}")
async def upsert_resume(resume_id: str, payload: Resume) -> Resume:
    """Create or replace a resume. URL id always wins."""
    _ensure_valid_id(resume_id)
    payload.id = resume_id
    payload.updated_at = max(payload.updated_at, _now_ms())
    resume_store.save(payload)
    return payload


def _now_ms() -> int:
    import time
    return int(time.time() * 1000)


@router.post("/")
async def create_blank_resume(body: CreateResumeRequest) -> Resume:
    """Create a new blank resume."""
    rid = str(uuid.uuid4())
    now = _now_ms()
    blank_doc = {
        "type": "doc",
        "content": [
            {"type": "resumeHeader", "attrs": {"contacts": []}, "content": []},
            {
                "type": "resumeSection",
                "attrs": {"heading": "Experience"},
                "content": [
                    {
                        "type": "entry",
                        "attrs": {"title": "", "meta": ""},
                        "content": [{"type": "bullet", "content": []}],
                    }
                ],
            },
        ],
    }
    r = Resume(id=rid, title=body.title, created_at=now, updated_at=now, doc=blank_doc)
    resume_store.save(r)
    return r


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
async def parse_pdf(file: UploadFile = File(...)) -> Resume:
    """Upload a PDF, parse it, persist as a new Resume."""
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

    legacy = result.get("data") or {}
    if not isinstance(legacy, dict) or not legacy:
        raise HTTPException(status_code=500, detail="Parser returned no data")

    doc = legacy_json_to_tiptap_doc(legacy)
    rid = str(uuid.uuid4())
    now = _now_ms()
    title = (legacy.get("name") or file.filename or "Imported resume").strip()
    if title.lower().endswith(".pdf"):
        title = title[:-4]

    r = Resume(id=rid, title=title or "Imported resume", created_at=now, updated_at=now, doc=doc)
    resume_store.save(r)
    return r


class SnapshotRequest(BaseModel):
    trigger: SnapshotTrigger = "manual_save"
    label: Optional[str] = None
    diff_summary: Optional[str] = None
    ai_message_id: Optional[str] = None


@router.post("/{resume_id}/snapshot")
async def create_snapshot(resume_id: str, body: SnapshotRequest) -> ResumeSnapshot:
    _ensure_valid_id(resume_id)
    r = resume_store.get(resume_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    snap = ResumeSnapshot(
        id=str(uuid.uuid4()),
        resume_id=resume_id,
        created_at=_now_ms(),
        trigger=body.trigger,
        label=body.label,
        diff_summary=body.diff_summary,
        ai_message_id=body.ai_message_id,
        doc=r.doc,
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
async def restore_snapshot(resume_id: str, body: RestoreRequest) -> Resume:
    _ensure_valid_id(resume_id)
    _ensure_valid_id(body.snapshot_id)
    snap = snapshot_store.get(body.snapshot_id)
    if snap is None or snap.resume_id != resume_id:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    # Re-read the resume right before mutating so an autosave that landed
    # between request arrival and now is captured by the pre-restore checkpoint.
    r = resume_store.get(resume_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Resume not found")

    pre = ResumeSnapshot(
        id=str(uuid.uuid4()),
        resume_id=resume_id,
        created_at=_now_ms(),
        trigger="checkpoint",  # was "auto" — preserve forever so users can recover
        label=f"Pre-restore (snap {body.snapshot_id[:8]})",
        diff_summary=f"Pre-restore checkpoint (restored to {body.snapshot_id})",
        doc=r.doc,
    )
    snapshot_store.save(pre)

    r.doc = snap.doc
    r.updated_at = _now_ms()
    resume_store.save(r)
    snapshot_store.enforce_retention(resume_id)
    return r


class VariantRequest(BaseModel):
    title: str
    target_company: Optional[str] = None
    target_company_domain: Optional[str] = None
    target_role: Optional[str] = None


@router.post("/{resume_id}/variant")
async def create_variant(resume_id: str, body: VariantRequest) -> Resume:
    _ensure_valid_id(resume_id)
    parent = resume_store.get(resume_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="Parent resume not found")

    new_id = str(uuid.uuid4())
    now = _now_ms()
    variant = Resume(
        id=new_id,
        user_id=parent.user_id,
        parent_id=parent.id,
        is_base=False,
        title=body.title,
        schema_version=parent.schema_version,
        created_at=now,
        updated_at=now,
        target_company=body.target_company,
        target_company_domain=body.target_company_domain,
        target_role=body.target_role,
        doc=copy.deepcopy(parent.doc),
    )
    resume_store.save(variant)
    return variant


@router.get("/{resume_id}/pdf")
async def export_pdf(resume_id: str):
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
    r = resume_store.get(resume_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Resume not found")

    # The frontend URL Playwright will load. CAREEROPS_FRONTEND_BASE lets
    # production override the dev default.
    frontend_base = os.environ.get("CAREEROPS_FRONTEND_BASE", "http://localhost:3000")
    print_url = f"{frontend_base}/resume/{resume_id}/print"

    pdf_bytes = await url_to_pdf_chrome(print_url)
    if pdf_bytes is None:
        raise HTTPException(status_code=500, detail="PDF generation failed")

    from fastapi import Response

    # Use the resume title as the download filename, sanitized.
    safe = "".join(c if c.isalnum() or c in (" ", "-", "_") else "_" for c in r.title).strip()
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
