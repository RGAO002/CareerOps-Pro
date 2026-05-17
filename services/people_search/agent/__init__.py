"""People Search Agent — autonomous research loop.

The agent runs in a loop: each turn the LLM decides which tool to call
next, observes the result, and decides again. It can spawn subprocess
subagents for context-isolated deep dives on individual candidates.

Public surface:
    run_agent_stream(query, model, ...) -> AsyncIterator[event_dict]
    run_agent(query, model, ...) -> SearchResponse  (non-streaming wrapper)
"""
from services.people_search.agent.loop import run_agent, run_agent_stream

__all__ = ["run_agent", "run_agent_stream"]
