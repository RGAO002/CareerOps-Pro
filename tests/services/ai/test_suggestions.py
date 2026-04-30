"""Suggestion sidecar storage CRUD with op-specific shape + status-timestamp side effects.

Spec refs:
  - § 5.1 (discriminated union schema with `supersededAt`)
  - § 5.2 (POST /status timestamp side-effect table)
  - § 5.3 (24h GC retention; persistence path)

Storage path: `saved_sessions/resumes/{resumeId}.suggestions.json` (flat sidecar).
"""
import json
import time
from pathlib import Path

import pytest

from services.ai import suggestions
from services.ai.types import (
    UpdateSuggestion,
    InsertSuggestion,
    BlockSnapshot,
    EditableField,
)


@pytest.fixture
def tmp_resume_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    return tmp_path


def test_append_then_list_returns_records(tmp_resume_dir):
    s: UpdateSuggestion = {
        "id": "sug_1",
        "runId": "run_1",
        "agentId": "PolishAgent",
        "resumeId": "r1",
        "status": "pending",
        "createdAt": 1_700_000_000_000,
        "source": {"kind": "agent", "agentId": "PolishAgent", "runId": "run_1"},
        "op": "update",
        "field": {"kind": "bullet.content", "id": "b1"},
        "before": {"type": "doc", "content": [{"type": "paragraph"}]},
        "after":  {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x"}]}]},
    }
    suggestions.append("r1", s)
    out = suggestions.list_for_resume("r1")
    assert len(out) == 1 and out[0]["id"] == "sug_1"


def test_status_accepted_sets_appliedAt_clears_others(tmp_resume_dir):
    s = _make_update("sug_a", "r1")
    s["rejectedAt"] = 999
    s["supersededAt"] = 998
    suggestions.append("r1", s)
    suggestions.set_status("r1", "sug_a", "accepted", now_ms=lambda: 12345)
    out = suggestions.list_for_resume("r1")
    assert out[0]["status"] == "accepted"
    assert out[0]["appliedAt"] == 12345
    assert "rejectedAt" not in out[0] or out[0].get("rejectedAt") is None
    assert "supersededAt" not in out[0] or out[0].get("supersededAt") is None


def test_status_pending_clears_all_terminal_timestamps(tmp_resume_dir):
    s = _make_update("sug_b", "r1")
    s["status"] = "accepted"
    s["appliedAt"] = 100
    suggestions.append("r1", s)
    suggestions.set_status("r1", "sug_b", "pending", now_ms=lambda: 200)
    out = suggestions.list_for_resume("r1")
    assert out[0]["status"] == "pending"
    assert out[0].get("appliedAt") is None
    assert out[0].get("rejectedAt") is None
    assert out[0].get("supersededAt") is None


def test_status_idempotent_returns_no_op_on_repeat(tmp_resume_dir):
    s = _make_update("sug_c", "r1")
    suggestions.append("r1", s)
    r1 = suggestions.set_status("r1", "sug_c", "accepted", now_ms=lambda: 1)
    r2 = suggestions.set_status("r1", "sug_c", "accepted", now_ms=lambda: 2)
    assert r1["ok"] is True
    assert r2["ok"] is True and r2.get("noop") is True
    out = suggestions.list_for_resume("r1")
    assert out[0]["appliedAt"] == 1  # not re-set


def test_status_conflict_returns_ok_false_with_current(tmp_resume_dir):
    """v0 resilience: client respects current state, never overrides."""
    s = _make_update("sug_d", "r1")
    suggestions.append("r1", s)
    suggestions.set_status("r1", "sug_d", "rejected", now_ms=lambda: 1)
    res = suggestions.set_status("r1", "sug_d", "accepted", now_ms=lambda: 2)
    assert res == {"ok": False, "current": "rejected"}


def test_gc_purges_terminal_records_older_than_24h(tmp_resume_dir):
    old = _make_update("sug_old", "r1")
    old["status"] = "rejected"
    old["rejectedAt"] = 1_000_000  # ancient
    fresh = _make_update("sug_fresh", "r1")
    fresh["status"] = "rejected"
    fresh["rejectedAt"] = 999_999_999_999  # recent (1ms before `now` below)
    suggestions.append("r1", old)
    suggestions.append("r1", fresh)
    suggestions.gc("r1", now_ms=lambda: 1_000_000_000_000)  # well past 24h after `old`
    out = suggestions.list_for_resume("r1")
    assert {x["id"] for x in out} == {"sug_fresh"}


def test_streaming_orphan_purged_after_5_minutes(tmp_resume_dir):
    s = _make_update("sug_stream", "r1")
    s["status"] = "streaming"
    s["createdAt"] = 1_000_000  # ancient
    suggestions.append("r1", s)
    suggestions.gc("r1", now_ms=lambda: 1_000_000_000_000)
    assert suggestions.list_for_resume("r1") == []


# ---- helpers ----

def _make_update(sid: str, rid: str) -> UpdateSuggestion:
    return {
        "id": sid, "runId": "run", "agentId": "PolishAgent", "resumeId": rid,
        "status": "pending", "createdAt": 1, "source": {"kind": "agent", "agentId": "PolishAgent", "runId": "run"},
        "op": "update",
        "field": {"kind": "entry.title", "id": "e1"},
        "before": "old", "after": "new",
    }
