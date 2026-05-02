# api/services/parse_v2_to_v3.py
"""Convert a parser-output v2-shaped dict to a v3 resume dict.

Handles ONLY the specific output shape produced by services/resume_parser.py:
  - header.name, header.contact_lines (list of ContactItem-like dicts)
  - sections[].role, sections[].heading, sections[].entries[]
  - entries[].title, entries[].meta, entries[].bullets[]
  - bullets[].content (ProseMirror doc)

Parser output is always clean:
  - All entries have a title (no orphan bullets)
  - All bullets have content (no empty plains)
  - No alignment fields

This helper intentionally does NOT handle: orphan rows, plain-bullet
flipping, alignment migration, or any non-parser doc shapes.

⚠ Known technical debt: parse path keeps a v2 intermediate.
   Tracked as follow-up in docs/superpowers/specs/.
"""
import uuid
from datetime import datetime, timezone
from typing import Any


def _new_id() -> str:
    return str(uuid.uuid4())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _plain_text_content(text: str) -> dict[str, Any]:
    """Build a ProseMirror doc that wraps plain text in a paragraph node."""
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text}] if text else [],
            }
        ],
    }


def _python_v2_to_v3(v2: dict, *, resume_id: str | None = None) -> dict:
    """Convert a parser-output v2 dict to a v3 resume dict.

    Args:
        v2: v2-shaped resume dict from the resume parser.
        resume_id: id to use for the resulting doc; a fresh UUID is used when
                   omitted.

    Returns:
        A v3-shaped dict ready for ResumeV3.model_validate() and save_v3_dict().
    """
    rid = resume_id or _new_id()
    now = _now_iso()

    rows: list[dict] = []
    groups: list[dict] = []

    # ── Header ────────────────────────────────────────────────────────────────
    header = v2.get("header") or {}
    name = (header.get("name") or "").strip()
    if name:
        rows.append({
            "id": _new_id(),
            "kind": "header.name",
            "content": {"text": name},
        })

    for item in header.get("contact_lines") or []:
        if isinstance(item, dict):
            # item may be {"type": "text", "value": "..."} or
            # {"type": "link", "label": "...", "url": "..."}
            rows.append({
                "id": _new_id(),
                "kind": "header.contact",
                "content": item,
            })

    # ── Sections ──────────────────────────────────────────────────────────────
    for section in v2.get("sections") or []:
        sec_gid = _new_id()
        role = section.get("role") or "custom"
        heading = (section.get("heading") or "").strip()

        # Register the section group.
        groups.append({
            "id": sec_gid,
            "kind": "section",
            "role": role,
            "label": heading or None,
        })

        # Section heading row.
        if heading:
            rows.append({
                "id": _new_id(),
                "kind": "section.heading",
                "content": {"text": heading},
                "semanticGroupId": sec_gid,
            })

        # ── Entries ───────────────────────────────────────────────────────────
        for entry in section.get("entries") or []:
            entry_gid = _new_id()

            groups.append({
                "id": entry_gid,
                "kind": "entry",
                "parentSectionGroupId": sec_gid,
            })

            title = (entry.get("title") or "").strip()
            if title:
                rows.append({
                    "id": _new_id(),
                    "kind": "entry.title",
                    "content": {"text": title},
                    "semanticGroupId": entry_gid,
                })

            meta = (entry.get("meta") or "").strip()
            if meta:
                rows.append({
                    "id": _new_id(),
                    "kind": "entry.meta",
                    "content": {"text": meta},
                    "semanticGroupId": entry_gid,
                })

            # ── Bullets ───────────────────────────────────────────────────────
            for bullet in entry.get("bullets") or []:
                # bullet.content is a ProseMirror doc dict from the parser.
                content = bullet.get("content")
                if not content:
                    continue
                rows.append({
                    "id": _new_id(),
                    "kind": "bullet",
                    "content": content,
                    "semanticGroupId": entry_gid,
                })

    # ── Metadata ──────────────────────────────────────────────────────────────
    v2_meta = v2.get("metadata") or {}
    metadata: dict[str, Any] = {
        "created_at": v2_meta.get("created_at") or now,
        "updated_at": now,
    }
    for k in ("target_company", "target_role", "parent_id"):
        val = v2_meta.get(k)
        if val is not None:
            metadata[k] = val

    return {
        "schema_version": 3,
        "id": rid,
        "title": (v2.get("title") or "Imported resume").strip() or "Imported resume",
        "template_id": v2.get("template_id") or "minimal-single-column",
        "rows": rows,
        "groups": groups,
        "metadata": metadata,
    }
