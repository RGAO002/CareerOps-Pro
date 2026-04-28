"""AI run state CRUD — file-based, GC after run.completed + 5min."""
import time
import pytest

from services.ai import runs


@pytest.fixture
def tmp_runs(tmp_path, monkeypatch):
    monkeypatch.setattr(runs, "RUNS_DIR", tmp_path)
    return tmp_path


def test_create_then_load(tmp_runs):
    rid = runs.create({"resume_id": "r1", "user_input": "hi", "selection": []})
    assert rid.startswith("run_")
    state = runs.load(rid)
    assert state["resume_id"] == "r1" and state["status"] == "running"


def test_update_status_persists(tmp_runs):
    rid = runs.create({"resume_id": "r1", "user_input": "hi", "selection": []})
    runs.update(rid, status="done", coordinator_decision={"kind": "answer", "text": "ok"})
    state = runs.load(rid)
    assert state["status"] == "done"
    assert state["coordinator_decision"]["text"] == "ok"


def test_gc_purges_done_runs_older_than_5min(tmp_runs):
    rid = runs.create({"resume_id": "r1", "user_input": "x", "selection": []})
    runs.update(rid, status="done", completed_at=1000)  # ancient
    purged = runs.gc(now_ms=lambda: 1_000_000_000_000)
    assert purged >= 1 and runs.load(rid) is None


def test_gc_keeps_running_orphans_until_60s_then_marks_error(tmp_runs):
    rid = runs.create({"resume_id": "r1", "user_input": "x", "selection": []})
    # Force created_at to ancient:
    runs.update(rid, _patch={"created_at": 1000})
    runs.gc(now_ms=lambda: 1_000_000_000_000)
    state = runs.load(rid)
    assert state["status"] == "error" and state["error"] == "orphan_timeout"
