"""PolishAgent — text rewrites on a single focus block. No structural ops."""
from __future__ import annotations

from services.ai.tools import write_tools

_SYSTEM = """\
You are PolishAgent. You rewrite the TEXT of ONE block at a time. You cannot
add, delete, or move blocks. Your job:
  - Given the focus block and the user's brief, call the appropriate
    update_* tool ONCE to propose the rewrite.
  - For bullets, call `update_bullet` with TipTap JSON content.
  - For text fields (entry.title / entry.meta / section.heading / header.name),
    call the matching `update_*` tool with a plain string.
  - Do not call multiple tools in one turn unless absolutely necessary.
"""


def _tool_schemas() -> list:
    return [
        {"name": "update_bullet",
         "description": "Replace a bullet's TipTap content. content is a TipTap doc JSON.",
         "input_schema": {"type": "object", "properties": {
             "block_id": {"type": "string"},
             "content": {"type": "object"}}, "required": ["block_id", "content"]}},
        {"name": "update_entry_title",
         "description": "Replace an entry's title (plain string).",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["entry_id", "value"]}},
        {"name": "update_entry_meta",
         "description": "Replace an entry's meta (date · location, plain string).",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["entry_id", "value"]}},
        {"name": "update_section_heading",
         "description": "Replace a section's heading (plain string).",
         "input_schema": {"type": "object", "properties": {
             "section_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["section_id", "value"]}},
        {"name": "update_header_name",
         "description": "Replace the header's name (plain string).",
         "input_schema": {"type": "object", "properties": {
             "value": {"type": "string"}}, "required": ["value"]}},
    ]


def _execute_tool(tc, ctx):
    name, args = tc["name"], tc["args"]
    if name == "update_bullet":
        return write_tools.update_bullet(args["block_id"], args["content"], ctx=ctx)
    if name == "update_entry_title":
        return write_tools.update_entry_title(args["entry_id"], args["value"], ctx=ctx)
    if name == "update_entry_meta":
        return write_tools.update_entry_meta(args["entry_id"], args["value"], ctx=ctx)
    if name == "update_section_heading":
        return write_tools.update_section_heading(args["section_id"], args["value"], ctx=ctx)
    if name == "update_header_name":
        return write_tools.update_header_name(args["value"], ctx=ctx)
    return None


def run(state: dict, llm_client) -> dict:
    """Run PolishAgent on the focus block. Returns {"applied_suggestion_ids": [...]}.

    Each tool call emits a Suggestion via write_tools, accumulating ids."""
    ctx = {"resumeId": state["resume_id"], "agentId": "PolishAgent",
           "runId": state["run_id"]}
    user_msg = {"role": "user", "content":
                f"Focus block:\n{state['focus_block']}\n\nBrief:\n{state['brief']}"}
    out = llm_client.invoke(system=_SYSTEM, messages=[user_msg], tools=_tool_schemas())

    applied = []
    for tc in out["tool_calls"]:
        try:
            sid = _execute_tool(tc, ctx)
            if sid:
                applied.append(sid)
        except Exception as exc:
            # ToolError or other validation failure — swallow + log; orchestrator
            # surfaces as agent.narration (Task 10).
            applied.append({"error": str(exc)})
    return {"applied_suggestion_ids": [a for a in applied if isinstance(a, str)]}
