"""People Search — autonomous agent for finding specific people via public sources.

Public surface:
    run_people_search(query, ...) -> dict          # blocking, returns SearchResponse dict
    run_people_search_async(...)                   # async, same shape
    run_people_search_stream(...)                  # async generator of events

The agent decides each step (which source to search, when to fetch, when to
spawn a subagent for deep dives, when to stop). See `agent/` for internals.
"""
from services.people_search.pipeline import (
    run_people_search,
    run_people_search_async,
    run_people_search_stream,
)

__all__ = [
    "run_people_search",
    "run_people_search_async",
    "run_people_search_stream",
]
