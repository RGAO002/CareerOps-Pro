"""LLM wrapper — verifies request shape + tool-call parsing.

Uses a stub `BaseChatModel` to avoid hitting Anthropic in unit tests. Real-
provider integration is exercised in tests/services/ai/test_orchestrator.py
behind a `requires_anthropic_api_key` marker.
"""
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from services.ai import llm


class _StubModel:
    """Mimics the bound-model returned by langchain-anthropic .bind_tools()."""

    def __init__(self, response: AIMessage):
        self.response = response
        self.captured_messages = None
        self.captured_tools = None

    def bind_tools(self, tools):
        self.captured_tools = tools
        return self

    def invoke(self, messages):
        self.captured_messages = messages
        return self.response


def test_invoke_returns_text_reply_when_no_tool_calls():
    stub = _StubModel(AIMessage(content="hello there"))
    client = llm.LLMClient(model=stub)
    out = client.invoke(
        system="you are a coordinator",
        messages=[{"role": "user", "content": "hi"}],
        tools=[],
    )
    assert out == {"text": "hello there", "tool_calls": []}


def test_invoke_returns_tool_calls_when_present():
    stub = _StubModel(AIMessage(
        content="",
        tool_calls=[
            {"id": "tc1", "name": "update_bullet",
             "args": {"block_id": "b1", "content": {"type": "doc", "content": []}}},
        ],
    ))
    client = llm.LLMClient(model=stub)
    out = client.invoke(system="x", messages=[], tools=[{"name": "update_bullet", "description": "...", "schema": {}}])
    assert out["text"] == ""
    assert out["tool_calls"][0]["name"] == "update_bullet"
    assert out["tool_calls"][0]["args"]["block_id"] == "b1"


def test_invoke_passes_system_as_first_message():
    stub = _StubModel(AIMessage(content="ok"))
    client = llm.LLMClient(model=stub)
    client.invoke(system="SYS", messages=[{"role": "user", "content": "hi"}], tools=[])
    assert isinstance(stub.captured_messages[0], SystemMessage)
    assert stub.captured_messages[0].content == "SYS"
    assert isinstance(stub.captured_messages[1], HumanMessage)
