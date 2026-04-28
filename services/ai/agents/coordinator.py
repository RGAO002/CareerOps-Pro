"""Coordinator — intent routing.

Has read-only tools (full inventory in services.ai.tools.read_tools) plus a
single `dispatch_to` tool that selects a subagent + focus + brief. If the LLM
calls `dispatch_to`, we return a dispatch decision; if it just replies in
text, we return an answer decision (Coordinator is "answering, no dispatch").
"""
from __future__ import annotations
from typing import Optional

_SYSTEM = """\
You are the Coordinator of a multi-agent resume editing assistant.

You have read-only access to the user's resumes and job application history via
your tools. You can answer questions about them directly.

When the user asks for a CHANGE to the resume, dispatch to a subagent:
  - PolishAgent — single-block text rewrites (shorten/quantify/rephrase a bullet,
    a title, a section heading, the user's name). Use when the change is scoped
    to ONE block or the user has selected a single block.
  - ExperienceAgent — structural + textual changes within a single experience
    section (add/delete/reorder bullets, rewrite multiple bullets, edit entry
    titles + meta within experience). Use for "tailor my experience to this JD"
    or similar multi-block requests scoped to experience.

If you dispatch, call the `dispatch_to` tool with:
  - agent: "PolishAgent" or "ExperienceAgent"
  - focus: a block id (the selection's first block, or your inferred target;
    for ExperienceAgent, this is a section id)
  - brief: a one-sentence summary of what the subagent should do

Otherwise, just reply in text and we'll show your message in chat.
"""


def _read_tool_schemas() -> list:
    """Tool schemas in the langchain function-calling format. Read tools live in
    services.ai.tools.read_tools but their schema is declared here so the
    Coordinator's prompt is self-contained."""
    return [
        {"name": "get_current_resume",
         "description": "Return the full current resume document.",
         "input_schema": {"type": "object", "properties": {}, "required": []}},
        {"name": "get_resume_block",
         "description": "Return a single block (header / section / entry / bullet) by id.",
         "input_schema": {"type": "object", "properties": {
             "block_id": {"type": "string"}}, "required": ["block_id"]}},
        {"name": "list_user_resumes",
         "description": "List all resumes the user has — id, title, updated_at, target_company, target_role.",
         "input_schema": {"type": "object", "properties": {}, "required": []}},
        {"name": "get_resume_by_id",
         "description": "Return another resume by id (for cross-resume comparison).",
         "input_schema": {"type": "object", "properties": {
             "resume_id": {"type": "string"}}, "required": ["resume_id"]}},
        {"name": "get_application_history",
         "description": "List job applications, optionally filtered by status / company / since (ISO date).",
         "input_schema": {"type": "object", "properties": {
             "status": {"type": "string"}, "company": {"type": "string"},
             "since": {"type": "string"}, "limit": {"type": "integer"}}, "required": []}},
        {"name": "get_application_by_id",
         "description": "Return a single application incl. full job description text.",
         "input_schema": {"type": "object", "properties": {
             "job_id": {"type": "string"}}, "required": ["job_id"]}},
        {"name": "dispatch_to",
         "description": "Hand off the user's request to a subagent that will modify the resume.",
         "input_schema": {"type": "object", "properties": {
             "agent": {"type": "string", "enum": ["PolishAgent", "ExperienceAgent"]},
             "focus": {"type": "string", "description": "Block id (PolishAgent: any block; ExperienceAgent: a section id)"},
             "brief": {"type": "string", "description": "One-sentence summary of the change"},
         }, "required": ["agent", "focus", "brief"]}},
    ]


def run(state: dict, llm_client) -> dict:
    """Decide how to handle the user input.

    Returns:
      {"kind": "answer", "text": str}  — show text in chat, no dispatch
      {"kind": "dispatch", "target": str, "focus": str, "brief": str}
    """
    user_msg = {"role": "user", "content": _render_user_turn(state)}
    chat = list(state.get("chat_history", []))
    chat.append(user_msg)
    out = llm_client.invoke(
        system=_SYSTEM,
        messages=chat,
        tools=_read_tool_schemas(),
    )
    for tc in out["tool_calls"]:
        if tc["name"] == "dispatch_to":
            return {
                "kind": "dispatch",
                "target": tc["args"]["agent"],
                "focus": tc["args"]["focus"],
                "brief": tc["args"]["brief"],
            }
    # No dispatch → answer in text. (Read-tool calls during the answer happen
    # in a separate read-tool-execution loop in the orchestrator; for v0 the
    # Coordinator's first turn is one-shot — read tools are exercised only when
    # the answer requires them, in a follow-up turn the orchestrator handles.)
    return {"kind": "answer", "text": out["text"]}


def _render_user_turn(state: dict) -> str:
    parts = [f"User: {state['user_input']}"]
    if state.get("selection"):
        parts.append(f"Selected blocks: {', '.join(state['selection'])}")
    parts.append("Resume skeleton:")
    parts.append(str(state["skeleton"]))
    return "\n".join(parts)
