"""GET /api/jobs/ + GET /api/jobs/{id} — wraps services/job_tracker.py reads.

Spec § 3.4. Read-only routes — single-user app, no auth changes.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Point job_tracker at a temp tracker file with stub data."""
    tracker_file = tmp_path / "job_tracker.json"
    tracker_file.write_text(json.dumps({
        "version": 1,
        "jobs": [
            {"id": "trk_1", "company": "Acme",   "title": "Eng",   "status": "applied",   "date_applied": "2026-04-01"},
            {"id": "trk_2", "company": "Globex", "title": "PM",    "status": "interview", "date_applied": "2026-04-10"},
            {"id": "trk_3", "company": "Initech","title": "TPM",   "status": "applied",   "date_applied": "2026-03-15"},
        ],
    }, indent=2))
    from services import job_tracker
    monkeypatch.setattr(job_tracker, "TRACKER_FILE", tracker_file)
    from api.main import app
    return TestClient(app)


def test_list_jobs_returns_all(client):
    r = client.get("/api/jobs/")
    assert r.status_code == 200
    body = r.json()
    assert {j["id"] for j in body["jobs"]} == {"trk_1", "trk_2", "trk_3"}


def test_list_jobs_filter_by_status(client):
    r = client.get("/api/jobs/?status=applied")
    assert r.status_code == 200
    assert {j["id"] for j in r.json()["jobs"]} == {"trk_1", "trk_3"}


def test_list_jobs_limit(client):
    r = client.get("/api/jobs/?limit=2")
    assert r.status_code == 200
    assert len(r.json()["jobs"]) == 2


def test_get_job_by_id_returns_one(client):
    r = client.get("/api/jobs/trk_2")
    assert r.status_code == 200
    assert r.json()["job"]["company"] == "Globex"


def test_get_job_404_when_missing(client):
    r = client.get("/api/jobs/nope")
    assert r.status_code == 404
