"""Tests for the v2 schema-aware resume store helpers."""
import json
from pathlib import Path

import pytest

from api.services import resume_store


@pytest.fixture(autouse=True)
def isolate_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect resume_store.RESUMES_DIR to a temp dir for each test."""
    d = tmp_path / "resumes"
    d.mkdir()
    monkeypatch.setattr(resume_store, "RESUMES_DIR", d)
    return d


def test_save_and_load_v2():
    v2_doc = {
        "schema_version": 2,
        "id": "test-v2",
        "title": "Test V2",
        "template_id": "minimal-single-column",
        "header": {"id": "h", "name": "X", "contact_lines": []},
        "sections": [],
        "metadata": {
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "target_company": None,
            "target_role": None,
            "parent_id": None,
        },
    }
    resume_store.save_v2_dict(v2_doc)
    out = resume_store.load_dict("test-v2")
    assert out["schema_version"] == 2
    assert out["id"] == "test-v2"
    assert out["header"]["name"] == "X"


def test_load_missing_raises():
    with pytest.raises(FileNotFoundError):
        resume_store.load_dict("does-not-exist")


def test_load_v1_auto_migrates(isolate_storage: Path):
    """A v1-shaped file on disk is auto-migrated to v2 on read.

    Depends on api.services.migration_v1_to_v2.migrate_one_dict (Task 36).
    """
    v1_doc = {
        "id": "test-v1",
        "title": "T",
        "doc": {
            "type": "doc",
            "content": [
                {
                    "type": "resumeHeader",
                    "attrs": {"name": "Y", "contact": "y@y.com"},
                },
                {
                    "type": "resumeSection",
                    "attrs": {"heading": "Experience"},
                    "content": [
                        {
                            "type": "entry",
                            "attrs": {"title": "Eng", "meta": "Now"},
                            "content": [
                                {
                                    "type": "bullet",
                                    "content": [{"type": "text", "text": "did stuff"}],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    }
    (isolate_storage / "test-v1.json").write_text(
        json.dumps(v1_doc), encoding="utf-8"
    )
    out = resume_store.load_dict("test-v1")
    assert out["schema_version"] == 2
    assert out["header"]["name"] == "Y"
    assert out["sections"][0]["role"] == "experience"
    assert out["sections"][0]["heading"] == "Experience"
    assert len(out["sections"][0]["entries"][0]["bullets"]) == 1
