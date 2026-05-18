"""Thin wrapper around the chat model used by the resume AI agents.

Default provider is OpenAI because the app already carries OPENAI_API_KEY and
the Anthropic account can be unavailable due to credits. Tool schemas authored
in the Anthropic-style `{name, description, input_schema}` shape are converted
to OpenAI function-tool dictionaries at the provider boundary.
"""
from __future__ import annotations
import os

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage


DEFAULT_MODEL = "gpt-4o"


def _build_openai_model(model_name: str | None = None):
    """Lazy import so unit tests using stub models don't pull network deps."""
    from langchain_openai import ChatOpenAI
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY not set. Populate `.env` and restart the API server."
        )
    selected = model_name or os.environ.get("CAREEROPS_AI_MODEL") or DEFAULT_MODEL
    return ChatOpenAI(model=selected, api_key=api_key)


class LLMClient:
    """Provider-agnostic invocation surface. v0 defaults to OpenAI.

    `invoke(system, messages, tools)` returns:
      {"text": str, "tool_calls": [{"id", "name", "args"}]}
    """

    def __init__(self, model=None, model_name: str | None = None):
        self._model = model or _build_openai_model(model_name)
        # Tests inject tiny stubs that expect the repo's native tool schema.
        # Real OpenAI models need OpenAI function-tool dictionaries.
        self._normalize_tools = model is None

    def invoke(self, *, system: str, messages: list, tools: list) -> dict:
        provider_tools = _to_openai_tools(tools) if self._normalize_tools else tools
        bound = self._model.bind_tools(provider_tools) if provider_tools else self._model
        chain_messages = [SystemMessage(content=system)]
        for m in messages:
            role = m["role"]
            if role == "user":
                chain_messages.append(HumanMessage(content=m["content"]))
            elif role == "assistant":
                chain_messages.append(AIMessage(content=m["content"]))
        ai_msg: AIMessage = bound.invoke(chain_messages)
        return {
            "text": _extract_text(ai_msg.content),
            "tool_calls": [
                {"id": tc.get("id", ""), "name": tc["name"], "args": tc.get("args", {})}
                for tc in (ai_msg.tool_calls or [])
            ],
        }


def _extract_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks = []
        for block in content:
            if isinstance(block, str):
                chunks.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                chunks.append(str(block.get("text", "")))
        return "".join(chunks)
    return ""


def _to_openai_tools(tools: list) -> list:
    out = []
    for tool in tools:
        if tool.get("type") == "function":
            out.append(tool)
            continue
        params = tool.get("input_schema") or tool.get("schema") or {
            "type": "object",
            "properties": {},
        }
        out.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": params,
            },
        })
    return out
