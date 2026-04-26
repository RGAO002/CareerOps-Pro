# api/services/ai_tools.py
"""AI tool implementations registered with ai_orchestrator.

v1 ships exactly one tool: rewrite_bullet.
"""
import os

from langchain_core.messages import SystemMessage, HumanMessage

from services.llm import get_llm

from api.services import ai_orchestrator


PRESET_PROMPTS = {
    "default": (
        "Rewrite the bullet to be clearer and more concise. Preserve all factual content. "
        "Keep within 1.2x the original length."
    ),
    "add_quantitative_impact": (
        "Rewrite the bullet to add concrete quantitative impact (percentages, numbers, scale, time saved, "
        "cost reduced, users reached). If specific numbers are not in the original, suggest realistic "
        "placeholders the candidate can verify (e.g. 'cut p95 latency by ~40%'). "
        "Keep within 1.3x the original length."
    ),
    "stronger_ownership_verbs": (
        "Rewrite the bullet replacing weak verbs ('participated', 'helped', 'assisted', 'worked on') "
        "with strong ownership verbs ('led', 'built', 'designed', 'shipped', 'owned'). "
        "Do NOT inflate scope beyond what the original implies. "
        "This addresses a common pattern where Chinese international students underclaim contribution. "
        "Keep within 1.1x the original length."
    ),
    "tailored_to_variant": (
        "Rewrite the bullet to better match the target role's terminology and signals, while preserving "
        "the underlying facts. Use vocabulary the target company is known for. "
        "Keep within 1.2x the original length."
    ),
}


def _call_llm(prompt: str, bullet_text: str) -> str:
    """Real LLM call. Patched in tests."""
    model_choice = os.environ.get("CAREEROPS_MODEL", "gpt-4o-mini")
    api_key = os.environ.get("OPENAI_API_KEY", "")
    llm = get_llm(model_choice, api_key)
    messages = [
        SystemMessage(content=prompt),
        HumanMessage(content=f"Original bullet:\n{bullet_text}\n\nRewritten bullet (no preamble, just the text):"),
    ]
    res = llm.invoke(messages)
    text = (res.content if isinstance(res.content, str) else str(res.content)).strip()
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1]
    return text


def _rewrite_bullet(args: dict) -> dict:
    bullet_text = (args.get("bullet_text") or "").strip()
    preset = args.get("preset") or "default"
    custom = (args.get("custom_instructions") or "").strip()

    if not bullet_text:
        raise ValueError("bullet_text is empty")

    base_prompt = PRESET_PROMPTS.get(preset, PRESET_PROMPTS["default"])
    if custom:
        prompt = f"{base_prompt}\n\nAdditional user instructions:\n{custom}"
    else:
        prompt = base_prompt

    rewritten = _call_llm(prompt, bullet_text)
    return {"rewritten": rewritten}


def register_all() -> None:
    """Idempotently register all v1 tools."""
    ai_orchestrator.register("rewrite_bullet", _rewrite_bullet)
