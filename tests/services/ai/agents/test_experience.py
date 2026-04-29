"""ExperienceAgent — full write toolset, runtime-scoped to experience sections."""
import json
import pytest
from langchain_core.messages import AIMessage

from services.ai.agents import experience
from services.ai import llm, suggestions, context
from services.ai.tools import write_tools


class _Stub:
    def __init__(self, response): self.response = response
    def bind_tools(self, t): self.captured_tools = t; return self
    def invoke(self, msgs): return self.response


@pytest.fixture
def setup(tmp_path, monkeypatch):
    resume = {
        "id": "r1", "schema_version": 2, "header": {"id": "h", "name": "F", "contact_lines": []},
        "sections": [
            {"id": "s1", "role": "experience", "heading": "Experience",
             "entries": [{"id": "e1", "title": "T", "meta": "M",
                          "bullets": [{"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]}]},
            {"id": "s2", "role": "skills", "heading": "Skills", "entries": []},
        ],
        "metadata": {"updated_at": "", "created_at": "", "target_company": None, "target_role": None, "parent_id": None},
    }
    (tmp_path / "r1.json").write_text(json.dumps(resume))
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(write_tools, "RESUMES_DIR", tmp_path)
    return tmp_path, resume


def _client(tcs):
    return llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=tcs)))


def test_experience_emits_insert_bullet(setup):
    _, resume = setup
    state = {"run_id": "run_1", "resume_id": "r1", "focus": "s1", "brief": "add bullet",
             "skeleton": context.build_skeleton(resume),
             "section": context.build_section_detail(resume, ["experience"])}
    new_doc = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x"}]}]}
    experience.run(state, _client([{"id": "tc1", "name": "insert_bullet",
                                     "args": {"parent_entry_id": "e1", "at_index": 1, "content": new_doc}}]))
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "insert" and s["agentId"] == "ExperienceAgent"


def test_experience_rejects_skills_section_target(setup):
    """Cross-section / non-experience writes must be rejected (runtime scope guard)."""
    _, resume = setup
    state = {"run_id": "run_1", "resume_id": "r1", "focus": "s1", "brief": "edit skills",
             "skeleton": context.build_skeleton(resume),
             "section": context.build_section_detail(resume, ["experience"])}
    # AI tries to add a bullet inside the skills section's entries (none exist; this still
    # tests scope guard at the section level — we'll add a synthetic entry on s2 first).
    p = setup[0] / "r1.json"
    r = json.loads(p.read_text())
    r["schema_version"] = 2
    r["sections"][1]["entries"].append({"id": "e_sk", "title": "T", "meta": "",
                                         "bullets": [{"id": "b_sk", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]})
    p.write_text(json.dumps(r))
    new_doc = {"type": "doc", "content": [{"type": "paragraph"}]}
    experience.run(state, _client([{"id": "tc1", "name": "insert_bullet",
                                     "args": {"parent_entry_id": "e_sk", "at_index": 0, "content": new_doc}}]))
    # No suggestion should have been emitted (scope guard rejected it):
    assert suggestions.list_for_resume("r1") == []


def test_experience_rejects_header_name_unconditionally(setup):
    """update_header_name is not in ExperienceAgent's tool schema; even if a stub LLM
    forces it, the agent's tool dispatch must skip it."""
    _, resume = setup
    state = {"run_id": "run_1", "resume_id": "r1", "focus": "s1", "brief": "rename me",
             "skeleton": context.build_skeleton(resume),
             "section": context.build_section_detail(resume, ["experience"])}
    experience.run(state, _client([{"id": "tc1", "name": "update_header_name",
                                     "args": {"value": "Frederick"}}]))
    assert suggestions.list_for_resume("r1") == []
