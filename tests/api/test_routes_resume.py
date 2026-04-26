# tests/api/test_routes_resume.py
"""Integration tests for /api/resume routes."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.resume import Resume
from api.services import resume_store, snapshot_store


@pytest.fixture(autouse=True)
def isolate_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    rdir = tmp_path / "resumes"
    rdir.mkdir()
    sdir = rdir / "snapshots"
    sdir.mkdir()
    monkeypatch.setattr(resume_store, "RESUMES_DIR", rdir)
    monkeypatch.setattr(snapshot_store, "SNAPSHOTS_DIR", sdir)


@pytest.fixture
def client():
    return TestClient(app)


def _seed_resume(rid: str, title: str, ts: int = 1000) -> None:
    resume_store.save(Resume(id=rid, title=title, created_at=ts, updated_at=ts))


def test_list_returns_empty_when_no_resumes(client):
    resp = client.get("/api/resume/")
    assert resp.status_code == 200
    assert resp.json() == {"resumes": []}


def test_list_returns_summary_fields_only(client):
    _seed_resume("a", "A", 100)
    _seed_resume("b", "B", 200)
    resp = client.get("/api/resume/")
    assert resp.status_code == 200
    items = resp.json()["resumes"]
    assert len(items) == 2
    assert items[0]["id"] == "b"
    assert "title" in items[0]
    assert "doc" not in items[0]


def test_get_one_returns_full_resume(client):
    _seed_resume("x", "X")
    resp = client.get("/api/resume/x")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "x"
    assert "doc" in body


def test_get_missing_returns_404(client):
    resp = client.get("/api/resume/nope")
    assert resp.status_code == 404
