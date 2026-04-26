# api/services/ai_orchestrator.py
"""Multi-agent-compatible AI tool dispatcher.

v1 only ever receives a single ToolCall (rewrite_bullet). The list-based
interface exists so the multi-agent phase can dispatch parallel calls from
a LangGraph node without API changes (PRODUCT_NOTES §13).
"""
from typing import Any, Callable

from api.models.resume import ToolCall, ToolResult


TOOL_REGISTRY: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {}


def register(name: str, fn: Callable[[dict[str, Any]], dict[str, Any]]) -> None:
    """Register a tool implementation."""
    TOOL_REGISTRY[name] = fn


def execute_tool_calls(resume_id: str, calls: list[ToolCall]) -> list[ToolResult]:
    """Run a list of tool calls in order. Failures are isolated per-call."""
    results: list[ToolResult] = []
    for call in calls:
        fn = TOOL_REGISTRY.get(call.name)
        if fn is None:
            results.append(ToolResult(
                name=call.name,
                success=False,
                error=f"Unknown tool: {call.name}",
            ))
            continue
        args = {**call.arguments, "_resume_id": resume_id}
        try:
            data = fn(args)
            results.append(ToolResult(name=call.name, success=True, data=data))
        except Exception as exc:  # noqa: BLE001
            results.append(ToolResult(name=call.name, success=False, error=str(exc)))
    return results
