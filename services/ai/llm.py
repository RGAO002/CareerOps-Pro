"""Thin wrapper around langchain-anthropic. Single-provider in v0 (Anthropic
Claude — chosen for tool-call stability per spec § 14 open question)."""
from __future__ import annotations
import os
from typing import Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage


def _build_anthropic_model(model_name: str = "claude-sonnet-4-5"):
    """Lazy import so unit tests using stub models don't pull network deps."""
    from langchain_anthropic import ChatAnthropic
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set. v0 requires it (single-provider — see "
            "spec § 14 / Task 0). Populate `.env` and restart the API server."
        )
    return ChatAnthropic(model=model_name, api_key=api_key, temperature=0)


class LLMClient:
    """Provider-agnostic invocation surface. v0 ships Anthropic only.

    `invoke(system, messages, tools)` returns:
      {"text": str, "tool_calls": [{"id", "name", "args"}]}
    """

    def __init__(self, model=None, model_name: str = "claude-sonnet-4-5"):
        self._model = model or _build_anthropic_model(model_name)

    def invoke(self, *, system: str, messages: list, tools: list) -> dict:
        bound = self._model.bind_tools(tools) if tools else self._model
        chain_messages = [SystemMessage(content=system)]
        for m in messages:
            role = m["role"]
            if role == "user":
                chain_messages.append(HumanMessage(content=m["content"]))
            elif role == "assistant":
                chain_messages.append(AIMessage(content=m["content"]))
        ai_msg: AIMessage = bound.invoke(chain_messages)
        return {
            "text": ai_msg.content if isinstance(ai_msg.content, str) else "",
            "tool_calls": [
                {"id": tc.get("id", ""), "name": tc["name"], "args": tc.get("args", {})}
                for tc in (ai_msg.tool_calls or [])
            ],
        }
