# tests/api/test_snapshot_store.py
"""Tests for snapshot CRUD + retention."""
from pathlib import Path

import pytest

from api.models.resume import ResumeSnapshot
from api.services import snapshot_store


@pytest.fixture(autouse=True)
def isolate_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    snap_dir = tmp_path / "snapshots"
    snap_dir.mkdir()
    monkeypatch.setattr(snapshot_store, "SNAPSHOTS_DIR", snap_dir)
    return snap_dir


def _snap(sid: str, rid: str, ts: int, trigger: str = "auto") -> ResumeSnapshot:
    return ResumeSnapshot(
        id=sid,
        resume_id=rid,
        created_at=ts,
        trigger=trigger,
        doc={"type": "doc", "content": []},
    )


def test_save_then_list_for_resume():
    snapshot_store.save(_snap("s1", "r1", 100))
    snapshot_store.save(_snap("s2", "r1", 200))
    snapshot_store.save(_snap("s3", "r2", 150))

    r1_snaps = snapshot_store.list_for_resume("r1")
    assert [s.id for s in r1_snaps] == ["s2", "s1"]  # newest first


def test_get_specific_snapshot():
    snapshot_store.save(_snap("s1", "r1", 100, "ai_edit"))
    s = snapshot_store.get("s1")
    assert s is not None
    assert s.trigger == "ai_edit"


def test_get_missing_returns_none():
    assert snapshot_store.get("does_not_exist") is None


def test_retention_keeps_ai_edit_and_checkpoint_forever():
    """Adding 60 auto snapshots must NOT remove ai_edit / checkpoint snapshots."""
    snapshot_store.save(_snap("ai1", "r1", 1, "ai_edit"))
    snapshot_store.save(_snap("ck1", "r1", 2, "checkpoint"))
    for i in range(60):
        snapshot_store.save(_snap(f"auto{i}", "r1", 1000 + i, "auto"))

    snapshot_store.enforce_retention("r1")

    snaps = snapshot_store.list_for_resume("r1")
    ids = {s.id for s in snaps}
    assert "ai1" in ids
    assert "ck1" in ids
    rolling = [s for s in snaps if s.trigger in ("auto", "manual_save")]
    assert len(rolling) == 50


def test_retention_combined_cap_for_auto_and_manual():
    for i in range(30):
        snapshot_store.save(_snap(f"a{i}", "r1", i, "auto"))
    for i in range(30):
        snapshot_store.save(_snap(f"m{i}", "r1", 1000 + i, "manual_save"))

    snapshot_store.enforce_retention("r1")

    snaps = snapshot_store.list_for_resume("r1")
    rolling = [s for s in snaps if s.trigger in ("auto", "manual_save")]
    assert len(rolling) == 50
