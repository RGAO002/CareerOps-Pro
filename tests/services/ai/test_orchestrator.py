"""LangGraph orchestrator — Coordinator decides answer vs dispatch; subagents emit suggestions."""
import json
import pytest
from langchain_core.messages import AIMessage

from services.ai import orchestrator, runs, suggestions, llm
from services.ai.tools import write_tools


class _Stub:
    def __init__(self, response): self.response = response
    def bind_tools(self, t): return self
    def invoke(self, m): return self.response


@pytest.fixture
def setup(tmp_path, monkeypatch):
    resume = {
        "id": "r1", "header": {"id": "h", "name": "F", "contact_lines": []},
        "sections": [{"id": "s1", "role": "experience", "heading": "Experience",
                      "entries": [{"id": "e1", "title": "T", "meta": "M",
                                   "bullets": [{"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]}]}],
        "metadata": {"updated_at": "", "created_at": "", "target_company": None, "target_role": None, "parent_id": None},
    }
    (tmp_path / "r1.json").write_text(json.dumps(resume))
    monkeypatch.setattr(write_tools, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    runs_dir = tmp_path / "ai_runs"
    monkeypatch.setattr(runs, "RUNS_DIR", runs_dir)
    # Patch the read_tools resume dir too (Coordinator may call them — for v0 we
    # use stub LLM so this is defensive):
    from services.ai.tools import read_tools
    monkeypatch.setattr(read_tools, "RESUMES_DIR", tmp_path)
    return tmp_path, resume


def test_orchestrator_answer_path(setup):
    """Coordinator answers in text → no subagent invoked → run completes with answer."""
    coord_client = llm.LLMClient(model=_Stub(AIMessage(content="You have 1 bullet.", tool_calls=[])))
    polish_client = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[])))
    exp_client = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[])))
    rid = orchestrator.run_orchestration(
        resume_id="r1", user_input="how many bullets?", selection=[],
        chat_history=[],
        clients={"Coordinator": coord_client, "PolishAgent": polish_client, "ExperienceAgent": exp_client},
    )
    state = runs.load(rid)
    assert state["status"] == "done"
    assert state["coordinator_decision"] == {"kind": "answer", "text": "You have 1 bullet."}
    assert state["applied_suggestion_ids"] == []


def test_orchestrator_polish_dispatch_emits_suggestion(setup):
    coord = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[
        {"id": "tc1", "name": "dispatch_to",
         "args": {"agent": "PolishAgent", "focus": "b1", "brief": "shorten"}},
    ])))
    polish = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[
        {"id": "tc1", "name": "update_bullet",
         "args": {"block_id": "b1",
                  "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x"}]}]}}},
    ])))
    rid = orchestrator.run_orchestration(
        resume_id="r1", user_input="shorten this", selection=["b1"],
        chat_history=[],
        clients={"Coordinator": coord, "PolishAgent": polish, "ExperienceAgent": None},
    )
    state = runs.load(rid)
    assert state["status"] == "done"
    assert state["coordinator_decision"]["target"] == "PolishAgent"
    assert len(state["applied_suggestion_ids"]) == 1
    items = suggestions.list_for_resume("r1")
    # Suggestion was streaming during run; orchestrator transitions runId set to pending at run end:
    assert len(items) == 1 and items[0]["status"] == "pending"
