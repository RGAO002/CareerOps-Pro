# tests/api/test_resume_v3.py
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.services import resume_store


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(resume_store, "RESUMES_DIR", tmp_path)
    return TestClient(app)


V3_DOC = {
    "schema_version": 3,
    "id": "test-get",
    "title": "Test",
    "template_id": "minimal-single-column",
    "rows": [],
    "groups": [],
    "metadata": {"created_at": "2026-05-02T00:00:00Z", "updated_at": "2026-05-02T00:00:00Z"},
}


def test_get_returns_v3(client, tmp_path):
    (tmp_path / "test-get.json").write_text(json.dumps(V3_DOC), encoding="utf-8")
    r = client.get("/api/resume/test-get")
    assert r.status_code == 200
    body = r.json()
    assert body["schema_version"] == 3


def test_get_404_for_missing(client):
    r = client.get("/api/resume/nope")
    assert r.status_code == 404
