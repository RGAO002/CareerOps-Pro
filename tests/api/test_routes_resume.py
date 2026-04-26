# tests/api/test_routes_resume.py
"""Integration tests for /api/resume routes."""
import io
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


def test_put_creates_or_replaces_resume(client):
    payload = {
        "id": "new1",
        "title": "Brand new",
        "created_at": 1000,
        "updated_at": 1000,
        "doc": {"type": "doc", "content": []},
    }
    resp = client.put("/api/resume/new1", json=payload)
    assert resp.status_code == 200
    assert resp.json()["id"] == "new1"

    got = client.get("/api/resume/new1")
    assert got.status_code == 200
    assert got.json()["title"] == "Brand new"


def test_put_with_mismatched_id_uses_url_id(client):
    """URL :id wins if body id differs (defensive)."""
    payload = {
        "id": "bodyid",
        "title": "T",
        "created_at": 1,
        "updated_at": 1,
        "doc": {"type": "doc", "content": []},
    }
    resp = client.put("/api/resume/urlid", json=payload)
    assert resp.status_code == 200
    assert resp.json()["id"] == "urlid"
    assert resume_store.get("urlid") is not None
    assert resume_store.get("bodyid") is None


def test_post_creates_blank_resume(client):
    resp = client.post("/api/resume/", json={"title": "Empty"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Empty"
    assert body["id"]
    assert body["doc"]["type"] == "doc"
    assert resume_store.get(body["id"]) is not None


def test_parse_pdf_creates_resume(client, monkeypatch):
    """Mock the parser so the test doesn't need a real LLM."""
    from api.routes import resume as routes

    def fake_parse(text: str, model_choice: str, api_key: str) -> dict:
        return {
            "name": "Test User",
            "contact": ["test@example.com"],
            "experience": [
                {"company": "Acme", "role": "Eng", "date": "2024", "bullets": ["Built X"]}
            ],
        }

    monkeypatch.setattr(routes, "parse_resume", fake_parse)
    monkeypatch.setattr(routes, "_extract_pdf_text", lambda b: "Some PDF text")
    monkeypatch.setattr(routes, "is_scanned_pdf", lambda t: False)

    fake_pdf = b"%PDF-1.4\n...not really a pdf..."
    resp = client.post(
        "/api/resume/parse",
        files={"file": ("test.pdf", io.BytesIO(fake_pdf), "application/pdf")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"]
    header = body["doc"]["content"][0]
    assert header["type"] == "resumeHeader"
    assert any(c.get("text") == "Test User" for c in header.get("content", []))


def test_parse_rejects_non_pdf(client):
    resp = client.post(
        "/api/resume/parse",
        files={"file": ("test.txt", io.BytesIO(b"not a pdf"), "text/plain")},
    )
    assert resp.status_code == 400
