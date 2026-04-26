# tests/api/test_orchestrator.py
"""Tests for the AI orchestrator + tool registry."""
import pytest

from api.models.resume import ToolCall
from api.services import ai_orchestrator, ai_tools


def _stub_tool(args: dict) -> dict:
    return {"echo": args.get("text", "")}


def test_register_and_dispatch_single_tool():
    ai_orchestrator.TOOL_REGISTRY.clear()
    ai_orchestrator.register("echo", _stub_tool)
    results = ai_orchestrator.execute_tool_calls(
        resume_id="r1",
        calls=[ToolCall(name="echo", arguments={"text": "hi"})],
    )
    assert len(results) == 1
    assert results[0].success is True
    assert results[0].data == {"echo": "hi"}


def test_unknown_tool_returns_error_result():
    ai_orchestrator.TOOL_REGISTRY.clear()
    results = ai_orchestrator.execute_tool_calls(
        resume_id="r1",
        calls=[ToolCall(name="missing", arguments={})],
    )
    assert len(results) == 1
    assert results[0].success is False
    assert "missing" in (results[0].error or "").lower()


def test_dispatches_multiple_tools_in_order():
    ai_orchestrator.TOOL_REGISTRY.clear()
    log: list[str] = []
    ai_orchestrator.register("a", lambda args: (log.append("a"), {"ok": True})[1])
    ai_orchestrator.register("b", lambda args: (log.append("b"), {"ok": True})[1])

    results = ai_orchestrator.execute_tool_calls(
        resume_id="r1",
        calls=[ToolCall(name="a", arguments={}), ToolCall(name="b", arguments={})],
    )
    assert log == ["a", "b"]
    assert all(r.success for r in results)


def test_one_failing_tool_does_not_abort_others():
    ai_orchestrator.TOOL_REGISTRY.clear()

    def boom(args):
        raise ValueError("kaboom")

    ai_orchestrator.register("bad", boom)
    ai_orchestrator.register("good", lambda args: {"ok": True})

    results = ai_orchestrator.execute_tool_calls(
        resume_id="r1",
        calls=[ToolCall(name="bad", arguments={}), ToolCall(name="good", arguments={})],
    )
    assert results[0].success is False
    assert "kaboom" in (results[0].error or "")
    assert results[1].success is True
