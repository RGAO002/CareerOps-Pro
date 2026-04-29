"""Write tools — emit Suggestion records, NEVER mutate the resume.

Spec § 3.3. Each tool:
  1. Loads current resume from disk (fresh read).
  2. Validates target exists; raises ToolError if not.
  3. Captures `before` / `beforeChildIds` from current state.
  4. Mints stable UUIDs for inserts (entry id + per-bullet id).
  5. Persists Suggestion via `services.ai.suggestions.append`.
  6. Returns the suggestion id.

`ctx` is `{resumeId, agentId, runId}` injected by the orchestrator.
"""
from __future__ import annotations
import time
import uuid
from typing import Optional

from api.services import resume_store
from services.ai import suggestions
from services.ai.types import (
    Suggestion, UpdateSuggestion, InsertSuggestion,
    DeleteSuggestion, MoveSuggestion, EditableField,
)

RESUMES_DIR = resume_store.RESUMES_DIR


class ToolError(Exception):
    """Raised when a tool call references a non-existent block or violates scope.
    Surfaced to the LLM as a tool-call error so the agent can recover or skip."""


def _load(resume_id: str) -> dict:
    original_dir = resume_store.RESUMES_DIR
    resume_store.RESUMES_DIR = RESUMES_DIR
    try:
        return resume_store.load_dict(resume_id)
    except FileNotFoundError:
        raise ToolError(f"resume {resume_id} not found")
    except ValueError as exc:
        raise ToolError(str(exc))
    finally:
        resume_store.RESUMES_DIR = original_dir


def _new_sid() -> str:
    return f"sug_{uuid.uuid4().hex[:12]}"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _base(ctx: dict) -> dict:
    sid = _new_sid()
    return {
        "id": sid,
        "runId": ctx["runId"],
        "agentId": ctx["agentId"],
        "resumeId": ctx["resumeId"],
        "status": "streaming",
        "createdAt": _now_ms(),
        "source": {"kind": "agent", "agentId": ctx["agentId"], "runId": ctx["runId"]},
    }


def _find_block(resume: dict, block_id: str):
    """Returns (block, parent_block_or_None, parent_kind, parent_children_list)
    where parent_children_list is the live list reference (for beforeChildIds).
    None if not found."""
    if resume["header"]["id"] == block_id:
        return resume["header"], None, "header", None
    for s in resume["sections"]:
        if s["id"] == block_id:
            return s, resume, "doc", resume["sections"]
        for e in s["entries"]:
            if e["id"] == block_id:
                return e, s, "section", s["entries"]
            for b in e["bullets"]:
                if b["id"] == block_id:
                    return b, e, "entry", e["bullets"]
    return None


def _entry_of_bullet(resume: dict, bullet_id: str):
    for s in resume["sections"]:
        for e in s["entries"]:
            for b in e["bullets"]:
                if b["id"] == bullet_id:
                    return e
    return None


def _section_of_entry(resume: dict, entry_id: str):
    for s in resume["sections"]:
        for e in s["entries"]:
            if e["id"] == entry_id:
                return s
    return None


# ---- update_* ------------------------------------------------------------

def update_bullet(block_id: str, content: dict, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, block_id)
    if not found or found[2] != "entry":
        raise ToolError(f"bullet {block_id} not found")
    bullet = found[0]
    s: UpdateSuggestion = {
        **_base(ctx),
        "op": "update",
        "field": {"kind": "bullet.content", "id": block_id},
        "before": bullet["content"],
        "after": content,
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


def _update_string_field(field: EditableField, value: str, before: str, ctx: dict) -> str:
    s: UpdateSuggestion = {
        **_base(ctx),
        "op": "update",
        "field": field,
        "before": before,
        "after": value,
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


def update_entry_title(entry_id: str, value: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, entry_id)
    if not found or found[2] != "section":
        raise ToolError(f"entry {entry_id} not found")
    return _update_string_field({"kind": "entry.title", "id": entry_id},
                                 value, found[0].get("title", ""), ctx)


def update_entry_meta(entry_id: str, value: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, entry_id)
    if not found or found[2] != "section":
        raise ToolError(f"entry {entry_id} not found")
    return _update_string_field({"kind": "entry.meta", "id": entry_id},
                                 value, found[0].get("meta", ""), ctx)


def update_section_heading(section_id: str, value: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, section_id)
    if not found or found[2] != "doc":
        raise ToolError(f"section {section_id} not found")
    return _update_string_field({"kind": "section.heading", "id": section_id},
                                 value, found[0].get("heading", ""), ctx)


def update_header_name(value: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    return _update_string_field({"kind": "header.name"},
                                 value, r["header"].get("name", ""), ctx)


# ---- insert_* ------------------------------------------------------------

def insert_bullet(parent_entry_id: str, at_index: int, content: dict, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, parent_entry_id)
    if not found or found[2] != "section":
        raise ToolError(f"entry {parent_entry_id} not found")
    entry = found[0]
    new_id = uuid.uuid4().hex
    s: InsertSuggestion = {
        **_base(ctx),
        "op": "insert",
        "parentId": parent_entry_id,
        "atIndex": at_index,
        "beforeChildIds": [b["id"] for b in entry["bullets"]],
        "insertedBlock": {"kind": "bullet", "id": new_id, "content": content},
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


def insert_entry(section_id: str, at_index: int, payload: dict, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, section_id)
    if not found or found[2] != "doc":
        raise ToolError(f"section {section_id} not found")
    section = found[0]
    if not payload.get("bullets"):
        raise ToolError("insert_entry payload.bullets must contain ≥1 entry")
    entry_id = uuid.uuid4().hex
    bullets = [
        {"kind": "bullet", "id": uuid.uuid4().hex, "content": c}
        for c in payload["bullets"]
    ]
    s: InsertSuggestion = {
        **_base(ctx),
        "op": "insert",
        "parentId": section_id,
        "atIndex": at_index,
        "beforeChildIds": [e["id"] for e in section["entries"]],
        "insertedBlock": {
            "kind": "entry", "id": entry_id,
            "title": payload.get("title", ""),
            "meta": payload.get("meta", ""),
            "bullets": bullets,
        },
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


# ---- delete_* ------------------------------------------------------------

def delete_bullet(block_id: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, block_id)
    if not found or found[2] != "entry":
        raise ToolError(f"bullet {block_id} not found")
    bullet, entry = found[0], found[1]
    s: DeleteSuggestion = {
        **_base(ctx),
        "op": "delete",
        "parentId": entry["id"],
        "blockId": block_id,
        "beforeChildIds": [b["id"] for b in entry["bullets"]],
        "deletedBlock": {"kind": "bullet", "id": block_id, "content": bullet["content"]},
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


def delete_entry(entry_id: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, entry_id)
    if not found or found[2] != "section":
        raise ToolError(f"entry {entry_id} not found")
    entry, section = found[0], found[1]
    s: DeleteSuggestion = {
        **_base(ctx),
        "op": "delete",
        "parentId": section["id"],
        "blockId": entry_id,
        "beforeChildIds": [e["id"] for e in section["entries"]],
        "deletedBlock": {
            "kind": "entry", "id": entry_id,
            "title": entry.get("title", ""),
            "meta": entry.get("meta", ""),
            "bullets": [{"kind": "bullet", "id": b["id"], "content": b["content"]} for b in entry["bullets"]],
        },
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


# delete_section is part of the spec's write tool table for ExperienceAgent
# scope but not exercised by v0 ACs. Keep the helper here for future use.


# ---- move_* --------------------------------------------------------------

def move_bullet(block_id: str, to_parent_id: str, to_index: int, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    src = _find_block(r, block_id)
    if not src or src[2] != "entry":
        raise ToolError(f"bullet {block_id} not found")
    src_entry = src[1]
    src_index = next(i for i, b in enumerate(src_entry["bullets"]) if b["id"] == block_id)
    dst = _find_block(r, to_parent_id)
    if not dst or dst[2] != "section":
        raise ToolError(f"target entry {to_parent_id} not found")
    dst_entry = dst[0]
    s: MoveSuggestion = {
        **_base(ctx),
        "op": "move",
        "blockId": block_id,
        "fromParentId": src_entry["id"],
        "fromIndex": src_index,
        "fromBeforeChildIds": [b["id"] for b in src_entry["bullets"]],
        "toParentId": to_parent_id,
        "toIndex": to_index,
        "toBeforeChildIds": [b["id"] for b in dst_entry["bullets"]],
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


def move_entry(entry_id: str, to_section_id: str, to_index: int, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    src = _find_block(r, entry_id)
    if not src or src[2] != "section":
        raise ToolError(f"entry {entry_id} not found")
    src_section = src[1]
    src_index = next(i for i, e in enumerate(src_section["entries"]) if e["id"] == entry_id)
    dst = _find_block(r, to_section_id)
    if not dst or dst[2] != "doc":
        raise ToolError(f"target section {to_section_id} not found")
    dst_section = dst[0]
    s: MoveSuggestion = {
        **_base(ctx),
        "op": "move",
        "blockId": entry_id,
        "fromParentId": src_section["id"],
        "fromIndex": src_index,
        "fromBeforeChildIds": [e["id"] for e in src_section["entries"]],
        "toParentId": to_section_id,
        "toIndex": to_index,
        "toBeforeChildIds": [e["id"] for e in dst_section["entries"]],
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]
