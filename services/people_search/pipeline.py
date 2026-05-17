"""People Search top-level entry points.

The pipeline is now an autonomous agent loop (services.people_search.agent).
This module re-exports the public surface and provides a synchronous
non-streaming wrapper for callers that prefer one-shot semantics.
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator

from services.people_search.agent.loop import (
    DEFAULT_MAIN_MODEL,
    run_agent,
    run_agent_stream,
)


async def run_people_search_async(
    query: str,
    *,
    model: str = DEFAULT_MAIN_MODEL,
) -> dict:
    """Run the agent and return a SearchResponse dict (non-streaming)."""
    response = await run_agent(query, model=model)
    return response.model_dump()


def run_people_search(
    query: str,
    model_choice: str | None = None,
    api_key: str | None = None,  # kept for backward-compat; agent uses env vars
) -> dict:
    """Synchronous wrapper. Used by callers that don't manage their own loop."""
    model = model_choice or DEFAULT_MAIN_MODEL
    return asyncio.run(run_people_search_async(query, model=model))


async def run_people_search_stream(
    query: str,
    *,
    model: str = DEFAULT_MAIN_MODEL,
) -> AsyncIterator[dict]:
    """Stream events as the agent runs. Final event is {"type": "done", "result": ...}."""
    async for event in run_agent_stream(query, model=model):
        yield event
