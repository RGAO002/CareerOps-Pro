"""Agent loop — the heart of People Search.

Pattern (follows the Anthropic tool_use protocol):

    1. send history + tool list to LLM
    2. if response.stop_reason != "tool_use" → done
    3. else: execute each tool_use block, append tool_result blocks
    4. loop

Streaming version (run_agent_stream) yields events as the agent works,
so the frontend can show a live timeline. Events include: agent_text,
tool_call, tool_result, candidate_added, candidate_updated,
subagent_spawned, subagent_completed, budget, finalized, error, done.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any, AsyncIterator, Awaitable, Callable, Optional

from anthropic import AsyncAnthropic

from services.people_search.agent.prompts import MAIN_AGENT_SYSTEM, SUBAGENT_SYSTEM
from services.people_search.agent.state import AgentState, make_subagent_state
from services.people_search.agent.tools import EmitFn, execute_tool, get_tools
from services.people_search.schema import SearchResponse


# ──────────────────────────────────────────────────────────────────
# Defaults — overridable via env / call kwargs
# ──────────────────────────────────────────────────────────────────

# Model defaults: Sonnet for the main agent (better reasoning), Haiku for
# subagents (faster + cheaper since their task is narrow).
DEFAULT_MAIN_MODEL = os.getenv(
    "PEOPLE_SEARCH_MAIN_MODEL", "claude-sonnet-4-6"
)
DEFAULT_SUBAGENT_MODEL = os.getenv(
    "PEOPLE_SEARCH_SUBAGENT_MODEL", "claude-haiku-4-5-20251001"
)


def _build_client() -> AsyncAnthropic:
    """Build Anthropic SDK client. Honors ANTHROPIC_BASE_URL for Kimi-style endpoints."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError(
            "ANTHROPIC_API_KEY not set. The People Search agent uses the Anthropic "
            "Messages API (or any Anthropic-compatible endpoint via ANTHROPIC_BASE_URL)."
        )
    base_url = os.getenv("ANTHROPIC_BASE_URL")
    if base_url:
        return AsyncAnthropic(api_key=api_key, base_url=base_url)
    return AsyncAnthropic(api_key=api_key)


# ──────────────────────────────────────────────────────────────────
# The loop
# ──────────────────────────────────────────────────────────────────

async def _run_loop(
    state: AgentState,
    *,
    system_prompt: str,
    model: str,
    is_main_agent: bool,
    emit: Optional[EmitFn] = None,
    max_tokens_per_turn: int = 4096,
) -> AgentState:
    """Drive the LLM in a tool-use loop until it finalizes or budget runs out.

    Mutates state in place; also returns it for convenience.
    """
    client = _build_client()
    tools = get_tools(is_main_agent=is_main_agent)

    # Seed the conversation with the user's query
    state.history.append({"role": "user", "content": state.query})

    while True:
        # Budget check before each LLM call
        reason = state.budget_exhausted()
        if reason:
            state.termination_reason = reason
            await _emit(emit, {"type": "budget_exhausted", "reason": reason})
            break

        # Call LLM
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens_per_turn,
                system=system_prompt,
                tools=tools,
                messages=state.history,
            )
        except Exception as e:
            state.termination_reason = f"llm_error: {e}"
            await _emit(emit, {"type": "error", "message": f"LLM call failed: {e}"})
            break

        state.rounds += 1
        usage = getattr(response, "usage", None)
        if usage is not None:
            state.tokens_in += getattr(usage, "input_tokens", 0) or 0
            state.tokens_out += getattr(usage, "output_tokens", 0) or 0

        # Append assistant turn to history (must include ALL content blocks
        # for the next turn's tool_result alignment)
        assistant_blocks = [_block_to_dict(b) for b in response.content]
        state.history.append({"role": "assistant", "content": assistant_blocks})

        # Emit agent's plain-text reasoning (if any)
        for block in response.content:
            if getattr(block, "type", None) == "text":
                await _emit(emit, {"type": "agent_text", "text": block.text})

        # Emit budget snapshot
        await _emit(emit, {"type": "budget", **state.stats_dict()})

        # If not a tool call, the agent is done speaking — terminate
        if response.stop_reason != "tool_use":
            if not state.finalized:
                state.termination_reason = state.termination_reason or f"stopped: {response.stop_reason}"
            break

        # Execute each tool_use block, collect tool_result blocks
        tool_results: list[dict] = []
        for block in response.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            await _emit(emit, {
                "type": "tool_call",
                "id": block.id,
                "name": block.name,
                "input": block.input,
            })
            try:
                result = await execute_tool(
                    name=block.name,
                    tool_input=block.input or {},
                    state=state,
                    emit=emit,
                    is_main_agent=is_main_agent,
                )
            except Exception as e:
                result = f"ERROR executing {block.name}: {e}"
            await _emit(emit, {
                "type": "tool_result",
                "id": block.id,
                "name": block.name,
                "summary": result[:400],
            })
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result,
            })

        # Append the tool results as the next "user" turn
        state.history.append({"role": "user", "content": tool_results})

        # If the agent just finalized, exit the loop after the final tool_result
        if state.finalized:
            break

    return state


def _block_to_dict(block: Any) -> dict:
    """Convert an Anthropic content block into a plain dict the SDK accepts back."""
    btype = getattr(block, "type", None)
    if btype == "text":
        return {"type": "text", "text": block.text}
    if btype == "tool_use":
        return {
            "type": "tool_use",
            "id": block.id,
            "name": block.name,
            "input": block.input,
        }
    # Fallback: best-effort dict cast
    if hasattr(block, "model_dump"):
        return block.model_dump()
    return dict(block)  # type: ignore[arg-type]


async def _emit(emit: Optional[EmitFn], event: dict) -> None:
    if emit is None:
        return
    try:
        await emit(event)
    except Exception:
        pass


# ──────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────

def _build_search_response(state: AgentState) -> SearchResponse:
    """Convert agent state into a SearchResponse (sorted top-N candidates)."""
    if state.final_top_ids:
        ordered = [
            state.candidates[cid].candidate
            for cid in state.final_top_ids
            if cid in state.candidates
        ]
    else:
        # Fallback: budget exhausted before finalize. Return what we have, sorted.
        ordered = sorted(
            (tc.candidate for tc in state.candidates.values()),
            key=lambda c: c.confidence,
            reverse=True,
        )

    # Attach all collected evidence back onto candidates that don't have any
    # (LLM may have skipped explicit evidence assignment under budget pressure).
    for c in ordered:
        if not c.evidence and state.evidence_pool:
            c.evidence = state.evidence_pool[:5]

    from services.people_search.schema import ParsedCriteria
    return SearchResponse(
        query=state.query,
        parsed=ParsedCriteria(raw_query=state.query),
        candidates=ordered[:5],
        stats={
            **state.stats_dict(),
            "termination_reason": state.termination_reason or "completed",
            "finalized": state.finalized,
        },
    )


async def run_agent(
    query: str,
    *,
    model: str = DEFAULT_MAIN_MODEL,
    emit: Optional[EmitFn] = None,
) -> SearchResponse:
    """Non-streaming wrapper. Drives the agent and returns a SearchResponse."""
    state = AgentState(query=query)
    await _run_loop(
        state,
        system_prompt=MAIN_AGENT_SYSTEM,
        model=model,
        is_main_agent=True,
        emit=emit,
    )
    return _build_search_response(state)


async def run_agent_stream(
    query: str,
    *,
    model: str = DEFAULT_MAIN_MODEL,
) -> AsyncIterator[dict]:
    """Streaming version: yield events as the agent works.

    Final event is {"type": "done", "result": <SearchResponse dict>}.
    """
    queue: asyncio.Queue[dict] = asyncio.Queue()
    state = AgentState(query=query)

    async def emit(ev: dict) -> None:
        await queue.put(ev)

    async def runner() -> None:
        try:
            await _run_loop(
                state,
                system_prompt=MAIN_AGENT_SYSTEM,
                model=model,
                is_main_agent=True,
                emit=emit,
            )
        except Exception as e:
            await queue.put({"type": "error", "message": f"Agent crashed: {e}"})
        finally:
            response = _build_search_response(state)
            await queue.put({"type": "done", "result": response.model_dump()})

    task = asyncio.create_task(runner())
    try:
        while True:
            event = await queue.get()
            yield event
            if event.get("type") == "done":
                break
    finally:
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass


async def run_subagent(payload: dict, *, model: str = DEFAULT_SUBAGENT_MODEL) -> dict:
    """Run a subagent with the provided payload. Returns a dossier dict."""
    task_text = payload.get("task") or ""
    parent_query = payload.get("parent_query") or ""
    candidate_id = payload.get("candidate_id")
    known = payload.get("known_candidates") or []

    seed = (
        f"Parent's original query: {parent_query}\n\n"
        f"Your focused task: {task_text}\n"
        f"Candidate id (parent's): {candidate_id}\n\n"
        f"Candidates already known to the parent (don't re-find these):\n"
        f"{json.dumps(known, ensure_ascii=False, indent=2)}\n"
    )

    state = make_subagent_state(query=seed)
    await _run_loop(
        state,
        system_prompt=SUBAGENT_SYSTEM,
        model=model,
        is_main_agent=False,
        emit=None,
    )

    # Build a JSON dossier the parent can ingest
    return {
        "candidate_id": candidate_id,
        "task": task_text,
        "candidates": [tc.to_dict() for tc in state.candidates.values()],
        "evidence_count": len(state.evidence_pool),
        "stats": state.stats_dict(),
        "termination_reason": state.termination_reason,
        "finalized": state.finalized,
    }
