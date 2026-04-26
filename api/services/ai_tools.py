# api/services/ai_tools.py
"""AI tool implementations registered with ai_orchestrator.

v1 ships exactly one tool: rewrite_bullet. Real implementation lands in
Task 38. This module exists now as the registration entry point.
"""
from api.services import ai_orchestrator


def _placeholder_rewrite_bullet(args: dict) -> dict:
    """Placeholder. Real implementation in Task 38."""
    raise NotImplementedError("rewrite_bullet not yet implemented (Task 38)")


def register_all() -> None:
    """Idempotently register all v1 tools."""
    ai_orchestrator.register("rewrite_bullet", _placeholder_rewrite_bullet)
