"""
LLM Service - Model configuration and utilities

Supports OpenAI, Anthropic, and Google Gemini models via LangChain.
"""
import os
import json
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI

# ── Provider detection ────────────────────────────────────────
PROVIDER_OPENAI = "openai"
PROVIDER_ANTHROPIC = "anthropic"
PROVIDER_GOOGLE = "google"


def detect_provider(model_choice: str) -> str:
    """Detect LLM provider from model name."""
    model = model_choice.lower()
    if "claude" in model:
        return PROVIDER_ANTHROPIC
    if "gemini" in model:
        return PROVIDER_GOOGLE
    return PROVIDER_OPENAI


def get_llm(model_choice, api_key=None, *, provider=None):
    """Get LLM instance based on model choice.

    Args:
        model_choice: Model name (e.g. "gpt-4o", "claude-3-5-sonnet-20241022",
                       "gemini-2.0-flash")
        api_key: API key for the provider. Falls back to environment variables:
                 - OpenAI:    OPENAI_API_KEY
                 - Anthropic: ANTHROPIC_API_KEY
                 - Google:    GOOGLE_API_KEY
        provider: Override provider detection (optional).
    """
    prov = provider or detect_provider(model_choice)

    if prov == PROVIDER_ANTHROPIC:
        final_key = api_key or os.getenv("ANTHROPIC_API_KEY") or os.getenv("OPENAI_API_KEY")
        if not final_key:
            raise ValueError("Anthropic API Key missing.")
        return ChatAnthropic(model=model_choice, api_key=final_key)

    if prov == PROVIDER_GOOGLE:
        final_key = api_key or os.getenv("GOOGLE_API_KEY")
        if not final_key:
            raise ValueError("Google API Key missing. Set GOOGLE_API_KEY env var.")
        return ChatGoogleGenerativeAI(model=model_choice, google_api_key=final_key)

    # Default: OpenAI
    final_key = api_key or os.getenv("OPENAI_API_KEY")
    if not final_key:
        raise ValueError("OpenAI API Key missing.")
    return ChatOpenAI(model=model_choice, api_key=final_key)


def clean_json(content):
    """Clean and parse JSON from LLM response."""
    content = content.replace("```json", "").replace("```", "").strip()
    return json.loads(content)
