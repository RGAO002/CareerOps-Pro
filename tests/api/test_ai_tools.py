# tests/api/test_ai_tools.py
"""Tests for AI tools — uses mocked LLM."""
from unittest.mock import patch

import pytest

from api.services import ai_tools, ai_orchestrator
from api.models.resume import ToolCall


@pytest.fixture(autouse=True)
def reset_registry():
    ai_orchestrator.TOOL_REGISTRY.clear()
    ai_tools.register_all()


def test_rewrite_bullet_returns_rewritten_text():
    with patch.object(ai_tools, "_call_llm", return_value="Built 12 REST APIs, cut p95 latency 40%."):
        results = ai_orchestrator.execute_tool_calls(
            resume_id="r1",
            calls=[ToolCall(
                name="rewrite_bullet",
                arguments={
                    "bullet_text": "Built APIs",
                    "preset": "add_quantitative_impact",
                },
            )],
        )
        assert results[0].success is True
        assert "p95" in results[0].data["rewritten"]


def test_rewrite_bullet_unknown_preset_uses_default():
    with patch.object(ai_tools, "_call_llm", return_value="rewritten") as mock_llm:
        ai_orchestrator.execute_tool_calls(
            resume_id="r1",
            calls=[ToolCall(
                name="rewrite_bullet",
                arguments={"bullet_text": "X", "preset": "totally_made_up"},
            )],
        )
        assert mock_llm.called


def test_rewrite_bullet_empty_text_errors():
    results = ai_orchestrator.execute_tool_calls(
        resume_id="r1",
        calls=[ToolCall(name="rewrite_bullet", arguments={"bullet_text": "", "preset": "default"})],
    )
    assert results[0].success is False
    assert "empty" in (results[0].error or "").lower()
