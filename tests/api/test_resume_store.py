# tests/api/test_resume_store.py
"""Tests for the file-based resume store."""
from pathlib import Path

import pytest

from api.models.resume import Resume
from api.services import resume_store


@pytest.fixture(autouse=True)
def isolate_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect resume_store.RESUMES_DIR to a temp dir for each test."""
    d = tmp_path / "resumes"
    d.mkdir()
    monkeypatch.setattr(resume_store, "RESUMES_DIR", d)
    return d


def _make_resume(rid: str = "abc", title: str = "Test") -> Resume:
    return Resume(
        id=rid,
        title=title,
        created_at=1000,
        updated_at=1000,
    )


def test_save_then_get_returns_same_resume():
    r = _make_resume("r1", "Base")
    resume_store.save(r)
    loaded = resume_store.get("r1")
    assert loaded is not None
    assert loaded.id == "r1"
    assert loaded.title == "Base"


def test_get_missing_returns_none():
    assert resume_store.get("nonexistent") is None


def test_list_returns_all_in_updated_at_desc():
    resume_store.save(Resume(id="a", title="A", created_at=100, updated_at=100))
    resume_store.save(Resume(id="b", title="B", created_at=200, updated_at=200))
    resume_store.save(Resume(id="c", title="C", created_at=150, updated_at=150))

    listed = resume_store.list_all()
    assert [r.id for r in listed] == ["b", "c", "a"]


def test_save_overwrites_existing():
    resume_store.save(_make_resume("x", "Original"))
    resume_store.save(_make_resume("x", "Updated"))
    assert resume_store.get("x").title == "Updated"


def test_delete_removes_file():
    resume_store.save(_make_resume("y"))
    assert resume_store.get("y") is not None
    resume_store.delete("y")
    assert resume_store.get("y") is None
