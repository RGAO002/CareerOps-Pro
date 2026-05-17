"""People Search API routes.

Two endpoints:
  POST /api/people-search/query   — blocking, returns full SearchResponse JSON
                                     (back-compat for non-streaming clients)
  POST /api/people-search/stream  — Server-Sent Events stream of agent events,
                                     terminating with {type: "done", result: ...}
"""
import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.people_search import (
    run_people_search_async,
    run_people_search_stream,
)
from services.people_search.agent.loop import DEFAULT_MAIN_MODEL

router = APIRouter()


class PeopleSearchRequest(BaseModel):
    query: str
    model_choice: Optional[str] = None  # defaults to agent's DEFAULT_MAIN_MODEL


@router.post("/query")
async def people_search_query(body: PeopleSearchRequest):
    """Run the agent end-to-end, return final SearchResponse JSON (no progress)."""
    q = (body.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="query is required")
    try:
        return await run_people_search_async(
            q, model=body.model_choice or DEFAULT_MAIN_MODEL
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")


@router.post("/stream")
async def people_search_stream(body: PeopleSearchRequest):
    """Stream agent events as SSE.

    Each event is emitted as `data: <json>\\n\\n`. The final event is always
    `{"type": "done", "result": <SearchResponse>}`. Frontend should keep
    reading until it sees `done` or the connection closes.
    """
    q = (body.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="query is required")

    async def event_source():
        try:
            async for event in run_people_search_stream(
                q, model=body.model_choice or DEFAULT_MAIN_MODEL
            ):
                # SSE framing
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except ValueError as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Stream crashed: {e}'})}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # disable nginx buffering if proxied
            "Connection": "keep-alive",
        },
    )
