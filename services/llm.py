"""
LLM Service - Model configuration and utilities
"""
import os
import json
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic


def get_llm(model_choice, api_key):
    """Get LLM instance based on model choice."""
    final_key = api_key if api_key else os.getenv("OPENAI_API_KEY")
    if not final_key:
        raise ValueError("API Key missing.")
    if "claude" in model_choice:
        return ChatAnthropic(model=model_choice, api_key=final_key)
    return ChatOpenAI(model=model_choice, api_key=final_key)


def clean_json(content):
    """Clean and parse JSON from LLM response."""
    content = content.replace("```json", "").replace("```", "").strip()
    return json.loads(content)
