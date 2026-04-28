"""PolishAgent — text-only updates on focus block. Tool palette is restricted."""
import json
from langchain_core.messages import AIMessage

from services.ai.agents import polish
from services.ai import llm, suggestions, context
from services.ai.tools import write_tools


class _Stub:
    def __init__(self, response): self.response = response
    def bind_tools(self, t): self.captured_tools = t; return self
    def invoke(self, msgs): self.captured_messages = msgs; return self.response


def _client(tool_calls):
    return llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=tool_calls)))


def test_polish_emits_update_bullet_suggestion(tmp_path, monkeypatch):
    resume = {
        "id": "r1", "header": {"id": "h", "name": "F", "contact_lines": []},
        "sections": [{"id": "s1", "role": "experience", "heading": "E",
                      "entries": [{"id": "e1", "title": "T", "meta": "M",
                                   "bullets": [{"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]}]}],
        "metadata": {"updated_at": "", "created_at": "", "target_company": None, "target_role": None, "parent_id": None},
    }
    (tmp_path / "r1.json").write_text(json.dumps(resume))
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(write_tools, "RESUMES_DIR", tmp_path)

    state = {"run_id": "run_1", "resume_id": "r1", "focus": "b1",
             "brief": "make it punchier",
             "skeleton": context.build_skeleton(resume),
             "focus_block": context.build_focus_block(resume, "b1")}

    new_doc = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "punchy"}]}]}
    polish.run(state, _client([{"id": "tc1", "name": "update_bullet",
                                 "args": {"block_id": "b1", "content": new_doc}}]))

    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "update" and s["after"] == new_doc and s["agentId"] == "PolishAgent"


def test_polish_tool_schemas_exclude_structural():
    captured = {}
    class _C(_Stub):
        def bind_tools(self, t): captured["tools"] = t; return self
    c = llm.LLMClient(model=_C(AIMessage(content="", tool_calls=[])))
    polish.run({"run_id": "r", "resume_id": "r1", "focus": "b1", "brief": "",
                "skeleton": {}, "focus_block": {"kind": "bullet", "id": "b1", "content": {}}}, c)
    names = {t["name"] for t in captured["tools"]}
    assert names == {"update_bullet", "update_entry_title", "update_entry_meta",
                     "update_section_heading", "update_header_name"}
    # No structural tools:
    assert names.isdisjoint({"insert_bullet", "delete_bullet", "move_bullet",
                              "insert_entry", "delete_entry", "move_entry"})
