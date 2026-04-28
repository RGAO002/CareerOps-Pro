"""AI routes — POST /run async background dispatch, GET /events live SSE, GET /suggestions, POST /status."""
import json
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage


@pytest.fixture
def client(tmp_path, monkeypatch):
    from services.ai.tools import write_tools, read_tools
    from services.ai import suggestions, runs, orchestrator, llm
    monkeypatch.setattr(write_tools, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(read_tools, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(runs, "RUNS_DIR", tmp_path / "ai_runs")
    resume = {
        "id": "r1", "header": {"id": "h", "name": "F", "contact_lines": []},
        "sections": [{"id": "s1", "role": "experience", "heading": "Experience",
                      "entries": [{"id": "e1", "title": "T", "meta": "M",
                                   "bullets": [{"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]}]}],
        "metadata": {"updated_at": "", "created_at": "", "target_company": None, "target_role": None, "parent_id": None},
    }
    (tmp_path / "r1.json").write_text(json.dumps(resume))

    # Stub LLM clients so /run can be exercised in unit tests:
    class _Stub:
        def __init__(self, response): self.response = response
        def bind_tools(self, t): return self
        def invoke(self, m): return self.response

    def fake_clients():
        coord = llm.LLMClient(model=_Stub(AIMessage(content="OK", tool_calls=[])))
        polish = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[])))
        exp = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[])))
        return {"Coordinator": coord, "PolishAgent": polish, "ExperienceAgent": exp}

    from api.routes import ai as ai_route
    monkeypatch.setattr(ai_route, "build_llm_clients", fake_clients)

    from api.main import app
    return TestClient(app)


def test_run_returns_runid_immediately_and_dispatches_in_background(client):
    """POST /run returns IMMEDIATELY with runId after dispatching orchestration
    to a daemon thread. Response time should be <100ms even when the orchestrator
    would take seconds (here it's a stub LLM, but the async-dispatch shape matters)."""
    import time
    t0 = time.time()
    r = client.post("/api/ai/run", json={
        "resumeId": "r1", "userInput": "how many bullets?", "selection": [], "chatHistory": []
    })
    elapsed = time.time() - t0
    assert r.status_code == 200
    rid = r.json()["runId"]
    assert rid.startswith("run_")
    # Response is immediate (route doesn't wait for orchestration). 1s is a
    # generous bound that catches accidental "await orchestration" regressions:
    assert elapsed < 1.0, f"POST /run took {elapsed:.2f}s — should be <100ms (background dispatch)"
    # Wait briefly for the daemon thread to do its work, then verify state:
    time.sleep(0.5)
    from services.ai import runs as _runs
    state = _runs.load(rid)
    assert state["status"] in ("done", "running")  # done with stub LLM is fast


def test_get_suggestions_returns_pending(client):
    r = client.get("/api/ai/suggestions", params={"resumeId": "r1", "status": "pending"})
    assert r.status_code == 200
    assert r.json() == {"suggestions": []}


def test_post_status_idempotent(client):
    # Seed a suggestion directly via the storage layer:
    from services.ai import suggestions
    s = {"id": "sug_x", "runId": "r", "agentId": "PolishAgent", "resumeId": "r1",
         "status": "pending", "createdAt": 1, "source": {"kind": "agent", "agentId": "PolishAgent", "runId": "r"},
         "op": "update", "field": {"kind": "entry.title", "id": "e1"},
         "before": "T", "after": "TX"}
    suggestions.append("r1", s)
    r1 = client.post("/api/ai/suggestions/sug_x/status", json={"status": "accepted"})
    assert r1.status_code == 200 and r1.json() == {"ok": True}
    r2 = client.post("/api/ai/suggestions/sug_x/status", json={"status": "accepted"})
    assert r2.status_code == 200 and r2.json() == {"ok": True, "noop": True}


def test_post_status_terminal_conflict_returns_ok_false(client):
    from services.ai import suggestions
    s = {"id": "sug_y", "runId": "r", "agentId": "PolishAgent", "resumeId": "r1",
         "status": "pending", "createdAt": 1, "source": {"kind": "agent", "agentId": "PolishAgent", "runId": "r"},
         "op": "update", "field": {"kind": "entry.title", "id": "e1"},
         "before": "T", "after": "TY"}
    suggestions.append("r1", s)
    client.post("/api/ai/suggestions/sug_y/status", json={"status": "rejected"})
    r = client.post("/api/ai/suggestions/sug_y/status", json={"status": "accepted"})
    assert r.json() == {"ok": False, "current": "rejected"}


def test_events_sse_streams_live_then_closes(client):
    """SSE attaches BEFORE orchestration finishes (in test, we POST /run then
    immediately GET /events — even with stub LLM the queue still mediates,
    so we exercise the live tail path, not the post-hoc replay fallback)."""
    r = client.post("/api/ai/run", json={
        "resumeId": "r1", "userInput": "hi", "selection": [], "chatHistory": []
    })
    rid = r.json()["runId"]
    # GET /events: live stream that exits when CLOSE_SENTINEL is received
    # (orchestrator's finally pushes it). With stub LLM the whole run is
    # ~milliseconds — the test reads the full stream synchronously.
    r = client.get(f"/api/ai/runs/{rid}/events")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    body = r.text
    assert "event: run.started" in body
    assert "event: run.completed" in body


def test_events_sse_replay_fallback_after_run_closed(client):
    """If the SSE attaches AFTER the orchestrator called event_queue.close()
    (worker thread done), fall back to one-shot replay from persisted state.

    `get_queue` returns None for closed runs even within the 5min grace
    period — late attachers always go through replay to avoid hanging on
    an empty closed queue (R9 P0 #2 fix)."""
    import time
    r = client.post("/api/ai/run", json={
        "resumeId": "r1", "userInput": "hi", "selection": [], "chatHistory": []
    })
    rid = r.json()["runId"]
    # Wait for the worker thread to finish + call event_queue.close():
    time.sleep(1.0)
    from services.ai import event_queue
    assert event_queue.get_queue(rid) is None      # closed → None
    # Now attach: should get the synthetic replay
    r = client.get(f"/api/ai/runs/{rid}/events")
    assert r.status_code == 200
    body = r.text
    assert "event: run.started" in body
    assert "event: run.completed" in body


def test_events_sse_replay_after_queue_gc_d(client):
    """Same replay path also fires when the underlying slot has been GC'd
    past its 5min grace period — runs.load still returns persisted state."""
    import time
    r = client.post("/api/ai/run", json={
        "resumeId": "r1", "userInput": "hi", "selection": [], "chatHistory": []
    })
    rid = r.json()["runId"]
    time.sleep(1.0)
    from services.ai import event_queue
    event_queue.gc(now_ms=lambda: int(time.time() * 1000) + 6 * 60 * 1000)
    assert rid not in event_queue._QUEUES        # GC'd
    r = client.get(f"/api/ai/runs/{rid}/events")
    assert r.status_code == 200
    body = r.text
    assert "event: run.started" in body
