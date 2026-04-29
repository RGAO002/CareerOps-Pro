"""AI routes: POST /run (background dispatch — returns immediately),
GET /events (LIVE SSE stream from per-run event_queue),
GET /suggestions (filtered list), POST /status (status transitions)."""
from __future__ import annotations
import asyncio
import json
import threading
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.ai import orchestrator, runs, suggestions, llm, event_queue

router = APIRouter()


def build_llm_clients() -> dict:
    """Production: one Anthropic-backed client shared by all agents.
    Tests monkeypatch this to inject stub LLMClient instances."""
    c = llm.LLMClient()
    return {"Coordinator": c, "PolishAgent": c, "ExperienceAgent": c}


# ---- POST /api/ai/run ---------------------------------------------------

class RunRequest(BaseModel):
    resumeId: str
    userInput: str
    selection: list = []
    chatHistory: list = []
    # v0: persona routing not implemented; field is accepted for forward
    # compatibility with the frontend agent target chips. Backend ignores it.
    targetAgent: str | None = None


@router.post("/run")
def post_run(req: RunRequest):
    """Dispatch orchestration to a daemon thread and return runId immediately.
    The SSE consumer at GET /runs/{runId}/events tails the event queue we
    open here — and which the orchestrator pushes events to in real time."""
    # Verify resume exists before allocating a run + spawning thread:
    from services.ai.tools import read_tools
    if read_tools.get_current_resume(req.resumeId) is None:
        raise HTTPException(status_code=404, detail=f"resume {req.resumeId} not found")

    # Allocate run + queue NOW, before spawning the worker, so the SSE
    # consumer can attach immediately if it races us.
    run_id = runs.create({
        "resume_id": req.resumeId, "user_input": req.userInput,
        "selection": req.selection, "chat_history": req.chatHistory,
    })
    event_queue.open(run_id)

    clients = build_llm_clients()

    def _worker():
        try:
            orchestrator.run_orchestration(
                resume_id=req.resumeId,
                user_input=req.userInput,
                selection=req.selection,
                chat_history=req.chatHistory,
                clients=clients,
                run_id=run_id,            # use pre-allocated id
            )
        except Exception as exc:
            # The orchestrator handles most errors internally, but exceptions
            # before its guarded section must not leave the run forever
            # "running" with an open SSE queue.
            runs.update(
                run_id,
                status="error",
                error=str(exc),
                completed_at=int(time.time() * 1000),
            )
            event_queue.emit(run_id, "run.error", {"runId": run_id, "error": str(exc)})
            event_queue.close(run_id)

    threading.Thread(target=_worker, daemon=True, name=f"ai-run-{run_id}").start()
    return {"runId": run_id}


# ---- GET /api/ai/runs/{runId}/events ------------------------------------

# Per-event-loop helper: read from a thread-safe queue without blocking the
# asyncio loop. asyncio.to_thread runs queue.get in a default executor.
_QUEUE_GET_TIMEOUT_S = 0.5    # poll cadence — gives us responsive shutdown
_TOTAL_STREAM_TIMEOUT_S = 120 # absolute cap; orchestrator's own 60s cap is tighter


@router.get("/runs/{run_id}/events")
async def get_run_events(run_id: str):
    """Live SSE: tail the per-run event_queue and yield events to the client.

    Exits on:
      - CLOSE_SENTINEL from event_queue.close() (orchestrator finished)
      - _TOTAL_STREAM_TIMEOUT_S elapsed (defensive — catches stuck runs)
      - Client disconnect (StreamingResponse handles this; the loop will
        get cancelled and the queue may leak slightly until the orchestrator
        closes it. Acceptable for v0 single-user.)
    """
    q = event_queue.get_queue(run_id)
    if q is None:
        # Queue not found — run was GC'd past the 5-minute grace period
        # (event_queue.gc removes only after `closed_at + 5min`). For runs
        # that finished moments before this attach, the queue still exists
        # with the sentinel queued, and we go through the live path below
        # which yields all queued events + sentinel + exits cleanly.
        state = runs.load(run_id)
        if state is None:
            raise HTTPException(status_code=404, detail="run not found")
        return StreamingResponse(_replay_from_state(run_id, state),
                                  media_type="text/event-stream")

    started_at = time.monotonic()

    async def gen():
        while True:
            if time.monotonic() - started_at > _TOTAL_STREAM_TIMEOUT_S:
                yield _sse("run.error", {"runId": run_id, "error": "stream_timeout"})
                return
            try:
                ev = await asyncio.to_thread(q.get, True, _QUEUE_GET_TIMEOUT_S)
            except Exception:
                # queue.Empty after timeout — loop and re-check overall timeout
                continue
            if ev == event_queue.CLOSE_SENTINEL:
                return
            yield _sse(ev["type"], ev["data"])

    return StreamingResponse(gen(), media_type="text/event-stream")


def _replay_from_state(run_id: str, state: dict):
    """Synthesize an SSE stream from persisted run state + suggestions.
    Used when the SSE consumer attaches AFTER the run already finished and
    the queue has been GC'd. One-shot, exits immediately."""
    yield _sse("run.started", {"runId": run_id, "createdAt": state.get("created_at")})
    if state.get("status") == "error":
        yield _sse("run.error", {"runId": run_id, "error": state.get("error") or "AI run failed"})
        return
    decision = state.get("coordinator_decision") or {}
    if decision.get("kind") == "answer":
        yield _sse("agent.narration", {"agentId": "Coordinator", "text": decision.get("text", "")})
    elif decision.get("kind") == "dispatch":
        agent = decision["target"]
        yield _sse("agent.started", {"agentId": agent, "lockedBlockIds": [decision["focus"]]})
        for sid in state.get("applied_suggestion_ids", []):
            s = suggestions.get(state["resume_id"], sid)
            if s:
                yield _sse("suggestion.streamed", {"suggestion": s})
        yield _sse("agent.completed", {"agentId": agent, "runId": run_id})
    yield _sse("run.completed", {
        "runId": run_id,
        "suggestionIds": state.get("applied_suggestion_ids", []),
        "status": state.get("status"),
    })


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ---- GET /api/ai/suggestions --------------------------------------------

@router.get("/suggestions")
def list_suggestions(
    resumeId: str = Query(...),
    status: Optional[str] = Query(None, description="Comma-separated statuses to include."),
):
    if status:
        status_set = {s.strip() for s in status.split(",") if s.strip()}
        items = suggestions.list_for_resume(resumeId, status_filter=status_set)
    else:
        items = suggestions.list_for_resume(resumeId)
    return {"suggestions": items}


# ---- POST /api/ai/suggestions/{id}/status -------------------------------

class StatusRequest(BaseModel):
    status: str


@router.post("/suggestions/{suggestion_id}/status")
def post_status(suggestion_id: str, body: StatusRequest, request: Request):
    if body.status not in {"pending", "accepted", "rejected", "superseded"}:
        raise HTTPException(status_code=400, detail="invalid status")
    # Find which resume the suggestion belongs to:
    sug = _find_suggestion(suggestion_id)
    if sug is None:
        raise HTTPException(status_code=404, detail="suggestion not found")
    return suggestions.set_status(sug["resumeId"], suggestion_id, body.status)


def _find_suggestion(suggestion_id: str):
    """Scan all resumes' sidecars for this id. v0 single-user: O(N) is fine."""
    if not suggestions.RESUMES_DIR.exists():
        return None
    for sidecar in suggestions.RESUMES_DIR.glob("*.suggestions.json"):
        rid = sidecar.name.replace(".suggestions.json", "")
        s = suggestions.get(rid, suggestion_id)
        if s is not None:
            return s
    return None
