"""ExperienceAgent — full write toolset, runtime-scoped to section.role==experience."""
from __future__ import annotations
import json
from pathlib import Path

from services.ai.tools import write_tools

_SYSTEM = """\
You are ExperienceAgent. You modify ONE experience section at a time. You can:
  - Update bullet content (TipTap JSON)
  - Update entry titles + meta + section heading (plain strings)
  - Insert / delete / move bullets within or across entries IN THE SAME SECTION
  - Insert / delete / move entries WITHIN THE SAME SECTION

You CANNOT:
  - Touch the header
  - Touch any non-experience section (skills / projects / education / …)

The user's focus is the section id (state.focus). Stay scoped.
"""


def _tool_schemas() -> list:
    return [
        {"name": "update_bullet",
         "description": "Replace a bullet's TipTap content.",
         "input_schema": {"type": "object", "properties": {
             "block_id": {"type": "string"}, "content": {"type": "object"}},
             "required": ["block_id", "content"]}},
        {"name": "update_entry_title",
         "description": "Replace an entry's title (plain string).",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["entry_id", "value"]}},
        {"name": "update_entry_meta",
         "description": "Replace an entry's meta (plain string).",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["entry_id", "value"]}},
        {"name": "update_section_heading",
         "description": "Replace a section's heading (plain string).",
         "input_schema": {"type": "object", "properties": {
             "section_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["section_id", "value"]}},
        {"name": "insert_bullet",
         "description": "Insert a new bullet into an entry at the given index.",
         "input_schema": {"type": "object", "properties": {
             "parent_entry_id": {"type": "string"},
             "at_index": {"type": "integer"},
             "content": {"type": "object"}},
             "required": ["parent_entry_id", "at_index", "content"]}},
        {"name": "delete_bullet",
         "description": "Delete a bullet by id.",
         "input_schema": {"type": "object", "properties": {
             "block_id": {"type": "string"}}, "required": ["block_id"]}},
        {"name": "move_bullet",
         "description": "Move a bullet to a different entry/index.",
         "input_schema": {"type": "object", "properties": {
             "block_id": {"type": "string"},
             "to_parent_id": {"type": "string"},
             "to_index": {"type": "integer"}},
             "required": ["block_id", "to_parent_id", "to_index"]}},
        {"name": "insert_entry",
         "description": "Insert a new entry into a section. payload has title/meta/bullets[].",
         "input_schema": {"type": "object", "properties": {
             "section_id": {"type": "string"},
             "at_index": {"type": "integer"},
             "payload": {"type": "object", "properties": {
                 "title": {"type": "string"}, "meta": {"type": "string"},
                 "bullets": {"type": "array", "items": {"type": "object"}}},
                 "required": ["title", "meta", "bullets"]}},
             "required": ["section_id", "at_index", "payload"]}},
        {"name": "delete_entry",
         "description": "Delete an entry by id.",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"}}, "required": ["entry_id"]}},
        {"name": "move_entry",
         "description": "Move an entry to a different section/index (within experience).",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"},
             "to_section_id": {"type": "string"},
             "to_index": {"type": "integer"}},
             "required": ["entry_id", "to_section_id", "to_index"]}},
    ]


def _is_experience_target(resume_id: str, target_block_id: str) -> bool:
    """True iff target_block_id is in (or is) a section with role=='experience'.
    Reads resume from disk fresh — guard runs at tool-call time, not turn start."""
    p = write_tools.RESUMES_DIR / f"{resume_id}.json"
    if not p.exists():
        return False
    r = json.loads(p.read_text())
    for s in r.get("sections", []):
        if s.get("role") != "experience":
            continue
        if s["id"] == target_block_id:
            return True
        for e in s.get("entries", []):
            if e["id"] == target_block_id:
                return True
            for b in e.get("bullets", []):
                if b["id"] == target_block_id:
                    return True
    return False


def _execute_tool(tc: dict, ctx: dict):
    """Run one tool call. Scope-guard FIRST: any target must resolve to an
    experience-scoped block. Out-of-scope calls are silently no-op'd (we'd ideally
    surface as a tool-call ToolError, but spec § 4.1 keeps v0 simple)."""
    name, args = tc["name"], tc["args"]

    # Header tool is unconditionally rejected (not in our schema, but defensive):
    if name == "update_header_name":
        return None

    # Locate the "primary target id" for scope check:
    primary = (
        args.get("block_id")
        or args.get("entry_id")
        or args.get("section_id")
        or args.get("parent_entry_id")
    )
    if primary and not _is_experience_target(ctx["resumeId"], primary):
        return None

    # All-good: dispatch to the matching write tool. Returns suggestion id.
    if name == "update_bullet":
        return write_tools.update_bullet(args["block_id"], args["content"], ctx=ctx)
    if name == "update_entry_title":
        return write_tools.update_entry_title(args["entry_id"], args["value"], ctx=ctx)
    if name == "update_entry_meta":
        return write_tools.update_entry_meta(args["entry_id"], args["value"], ctx=ctx)
    if name == "update_section_heading":
        return write_tools.update_section_heading(args["section_id"], args["value"], ctx=ctx)
    if name == "insert_bullet":
        return write_tools.insert_bullet(args["parent_entry_id"], args["at_index"], args["content"], ctx=ctx)
    if name == "delete_bullet":
        return write_tools.delete_bullet(args["block_id"], ctx=ctx)
    if name == "move_bullet":
        return write_tools.move_bullet(args["block_id"], args["to_parent_id"], args["at_index"] if "at_index" in args else args["to_index"], ctx=ctx)
    if name == "insert_entry":
        return write_tools.insert_entry(args["section_id"], args["at_index"], args["payload"], ctx=ctx)
    if name == "delete_entry":
        return write_tools.delete_entry(args["entry_id"], ctx=ctx)
    if name == "move_entry":
        return write_tools.move_entry(args["entry_id"], args["to_section_id"], args["to_index"], ctx=ctx)
    return None


def run(state: dict, llm_client) -> dict:
    ctx = {"resumeId": state["resume_id"], "agentId": "ExperienceAgent",
           "runId": state["run_id"]}
    user_msg = {"role": "user", "content":
                f"Focus section: {state['focus']}\nBrief: {state['brief']}\n\n"
                f"Section detail:\n{state['section']}"}
    out = llm_client.invoke(system=_SYSTEM, messages=[user_msg], tools=_tool_schemas())
    applied = []
    for tc in out["tool_calls"]:
        try:
            sid = _execute_tool(tc, ctx)
            if sid:
                applied.append(sid)
        except Exception:
            pass
    return {"applied_suggestion_ids": applied}
