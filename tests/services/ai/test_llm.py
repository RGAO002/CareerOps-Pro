"""LLM wrapper — verifies request shape + tool-call parsing.

Uses a stub `BaseChatModel` to avoid hitting OpenAI in unit tests.
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


def test_invoke_extracts_text_blocks():
    stub = _StubModel(AIMessage(content=[
        {"type": "text", "text": "hello"},
        {"type": "text", "text": " there"},
    ]))
    client = llm.LLMClient(model=stub)
    out = client.invoke(system="x", messages=[], tools=[])
    assert out["text"] == "hello there"


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


def test_to_openai_tools_converts_native_tool_schema():
    native = [{
        "name": "update_bullet",
        "description": "Update a bullet",
        "input_schema": {
            "type": "object",
            "properties": {"block_id": {"type": "string"}},
            "required": ["block_id"],
        },
    }]
    assert llm._to_openai_tools(native) == [{
        "type": "function",
        "function": {
            "name": "update_bullet",
            "description": "Update a bullet",
            "parameters": native[0]["input_schema"],
        },
    }]
