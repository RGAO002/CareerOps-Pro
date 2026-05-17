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


def test_put_accepts_v3_and_persists(client, tmp_path):
    payload = {**V3_DOC, "id": "test-put"}
    r = client.put("/api/resume/test-put", json=payload)
    assert r.status_code == 200
    saved = json.loads((tmp_path / "test-put.json").read_text(encoding="utf-8"))
    assert saved["schema_version"] == 3
    assert saved["id"] == "test-put"


def test_put_rejects_v2_payload(client):
    payload = {"schema_version": 2, "id": "test-put-v2", "title": "x", "header": {"id": "h", "name": "x", "contact_lines": []}, "sections": [], "metadata": {"created_at": "x", "updated_at": "x"}}
    r = client.put("/api/resume/test-put-v2", json=payload)
    assert r.status_code == 400
    assert "schema_version must be 3" in r.json()["detail"]


def test_put_rejects_invalid_v3(client):
    # Missing required fields → Pydantic validation error.
    r = client.put("/api/resume/bad", json={"schema_version": 3, "id": "bad"})
    assert r.status_code == 400


def test_put_creates_backup_on_overwrite(client, tmp_path):
    first = {**V3_DOC, "id": "test-backup", "title": "v1"}
    second = {**V3_DOC, "id": "test-backup", "title": "v2"}
    client.put("/api/resume/test-backup", json=first)
    assert not (tmp_path / "test-backup.backup.json").exists()
    client.put("/api/resume/test-backup", json=second)
    backup = json.loads((tmp_path / "test-backup.backup.json").read_text(encoding="utf-8"))
    assert backup["title"] == "v1"


def test_create_blank_returns_v3(client):
    r = client.post("/api/resume/", json={"title": "Blank"})
    assert r.status_code == 200
    body = r.json()
    assert body["schema_version"] == 3
    assert "rows" in body
    assert "groups" in body


def test_variant_returns_v3(client, tmp_path):
    base = {**V3_DOC, "id": "base"}
    client.put("/api/resume/base", json=base)
    r = client.post("/api/resume/base/variant", json={"title": "Variant"})
    assert r.status_code == 200
    body = r.json()
    assert body["schema_version"] == 3
    assert body["id"] != "base"
