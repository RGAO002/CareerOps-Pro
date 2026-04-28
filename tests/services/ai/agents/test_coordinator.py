"""CoordinatorAgent — intent routing. Uses stub LLM so tests are deterministic."""
from langchain_core.messages import AIMessage

from services.ai.agents import coordinator
from services.ai import llm


class _Stub:
    def __init__(self, response): self.response = response
    def bind_tools(self, t): return self
    def invoke(self, msgs): return self.response


def _client(text="", tool_calls=None):
    return llm.LLMClient(model=_Stub(AIMessage(content=text, tool_calls=tool_calls or [])))


def test_coordinator_answer_when_no_tool_calls():
    state = {
        "run_id": "run_1", "resume_id": "r1",
        "user_input": "how many bullets in experience?",
        "selection": [], "chat_history": [],
        "skeleton": {"sections": [{"id": "s1", "role": "experience", "entries": [{"id": "e1", "title_excerpt": "X", "bullet_count": 4}]}]},
    }
    decision = coordinator.run(state, _client(text="You have 4 bullets."))
    assert decision == {"kind": "answer", "text": "You have 4 bullets."}


def test_coordinator_dispatches_to_polish_for_single_bullet_focus():
    state = {
        "run_id": "run_1", "resume_id": "r1",
        "user_input": "make this shorter",
        "selection": ["b2"], "chat_history": [],
        "skeleton": {"sections": []},
    }
    decision = coordinator.run(state, _client(tool_calls=[{
        "id": "tc1", "name": "dispatch_to",
        "args": {"agent": "PolishAgent", "focus": "b2", "brief": "make shorter"},
    }]))
    assert decision == {
        "kind": "dispatch", "target": "PolishAgent",
        "focus": "b2", "brief": "make shorter",
    }


def test_coordinator_dispatches_to_experience_for_section_tailor():
    state = {
        "run_id": "run_1", "resume_id": "r1",
        "user_input": "tailor experience for this JD: ...",
        "selection": [], "chat_history": [],
        "skeleton": {"sections": [{"id": "s1", "role": "experience", "entries": []}]},
    }
    decision = coordinator.run(state, _client(tool_calls=[{
        "id": "tc1", "name": "dispatch_to",
        "args": {"agent": "ExperienceAgent", "focus": "s1", "brief": "tailor for JD"},
    }]))
    assert decision["target"] == "ExperienceAgent"
