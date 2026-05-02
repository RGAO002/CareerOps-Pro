# api/services/__tests__/test_resume_store_v3.py
import json
import shutil
from pathlib import Path

import pytest

from api.services import resume_store


@pytest.fixture
def isolated_store(tmp_path, monkeypatch):
    """Point resume_store at a temp directory."""
    monkeypatch.setattr(resume_store, "RESUMES_DIR", tmp_path)
    return tmp_path


V3_DOC = {
    "schema_version": 3,
    "id": "test-r1",
    "title": "Test",
    "template_id": "minimal-single-column",
    "rows": [],
    "groups": [],
    "metadata": {"created_at": "2026-05-02T00:00:00Z", "updated_at": "2026-05-02T00:00:00Z"},
}


def test_save_v3_dict_writes_file(isolated_store):
    resume_store.save_v3_dict(V3_DOC)
    out = isolated_store / "test-r1.json"
    assert out.exists()
    written = json.loads(out.read_text(encoding="utf-8"))
    assert written["schema_version"] == 3


def test_save_v3_dict_creates_backup_when_main_exists(isolated_store):
    # First write — no backup expected.
    resume_store.save_v3_dict(V3_DOC)
    backup = isolated_store / "test-r1.backup.json"
    assert not backup.exists(), "no backup on first write"

    # Second write — backup of previous content.
    updated = {**V3_DOC, "title": "Updated"}
    resume_store.save_v3_dict(updated)
    assert backup.exists(), "backup created on second write"
    backup_content = json.loads(backup.read_text(encoding="utf-8"))
    assert backup_content["title"] == "Test", "backup contains PRE-write content"
    main = json.loads((isolated_store / "test-r1.json").read_text(encoding="utf-8"))
    assert main["title"] == "Updated"


def test_save_v3_dict_backup_overwrites_previous_backup(isolated_store):
    resume_store.save_v3_dict(V3_DOC)
    resume_store.save_v3_dict({**V3_DOC, "title": "v2-content"})
    resume_store.save_v3_dict({**V3_DOC, "title": "v3-content"})
    backup = json.loads((isolated_store / "test-r1.backup.json").read_text(encoding="utf-8"))
    # Most recent backup = the one written just before the latest save = v2-content
    assert backup["title"] == "v2-content"


def test_save_v3_dict_rejects_missing_id(isolated_store):
    with pytest.raises(ValueError, match="missing id"):
        resume_store.save_v3_dict({"schema_version": 3})
