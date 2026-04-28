"""6 read tools — pure functions, no side effects.

Spec § 3.1. These power the Coordinator's "answer questions" capability.
"""
import json
from pathlib import Path

import pytest

from services.ai.tools import read_tools


@pytest.fixture
def sample_resume():
    return {
        "id": "r1",
        "schema_version": 2,
        "title": "Test Resume",
        "header": {"id": "h", "name": "Fred", "contact_lines": []},
        "sections": [
            {"id": "s1", "role": "experience", "heading": "Experience", "entries": [
                {"id": "e1", "title": "Eng @ Acme", "meta": "2024-now",
                 "bullets": [
                     {"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
                     {"id": "b2", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
                 ]},
            ]},
        ],
        "metadata": {"created_at": "", "updated_at": "", "target_company": None,
                     "target_role": None, "parent_id": None},
    }


def test_get_current_resume_returns_resume_dict(monkeypatch, tmp_path, sample_resume):
    monkeypatch.setattr(read_tools, "RESUMES_DIR", tmp_path)
    (tmp_path / "r1.json").write_text(json.dumps(sample_resume))
    out = read_tools.get_current_resume("r1")
    assert out["id"] == "r1"
    assert out["sections"][0]["entries"][0]["title"] == "Eng @ Acme"


def test_get_resume_block_returns_named_block(monkeypatch, tmp_path, sample_resume):
    monkeypatch.setattr(read_tools, "RESUMES_DIR", tmp_path)
    (tmp_path / "r1.json").write_text(json.dumps(sample_resume))
    block = read_tools.get_resume_block("r1", "b2")
    assert block["id"] == "b2" and block["kind"] == "bullet"
    entry = read_tools.get_resume_block("r1", "e1")
    assert entry["id"] == "e1" and entry["kind"] == "entry"
    section = read_tools.get_resume_block("r1", "s1")
    assert section["id"] == "s1" and section["kind"] == "section"
    header = read_tools.get_resume_block("r1", "h")
    assert header["id"] == "h" and header["kind"] == "header"


def test_get_resume_block_returns_none_for_missing(monkeypatch, tmp_path, sample_resume):
    monkeypatch.setattr(read_tools, "RESUMES_DIR", tmp_path)
    (tmp_path / "r1.json").write_text(json.dumps(sample_resume))
    assert read_tools.get_resume_block("r1", "missing") is None


def test_list_user_resumes_returns_summary(monkeypatch, tmp_path, sample_resume):
    monkeypatch.setattr(read_tools, "RESUMES_DIR", tmp_path)
    (tmp_path / "r1.json").write_text(json.dumps(sample_resume))
    other = dict(sample_resume); other["id"] = "r2"; other["title"] = "Other"
    (tmp_path / "r2.json").write_text(json.dumps(other))
    out = read_tools.list_user_resumes()
    ids = {r["id"] for r in out}
    assert ids == {"r1", "r2"}
    assert all("title" in r for r in out)


def test_get_application_history_filters(monkeypatch):
    fake_jobs = {"jobs": [
        {"id": "j1", "company": "A", "title": "PM",  "status": "applied",   "date_applied": "2026-04-01"},
        {"id": "j2", "company": "B", "title": "Eng", "status": "interview", "date_applied": "2026-04-10"},
    ]}
    from services import job_tracker
    monkeypatch.setattr(job_tracker, "load_tracker", lambda: fake_jobs)
    out = read_tools.get_application_history(status="applied")
    assert {j["id"] for j in out} == {"j1"}


def test_get_application_by_id_returns_one(monkeypatch):
    fake_jobs = {"jobs": [{"id": "j1", "company": "A", "title": "PM", "status": "applied"}]}
    from services import job_tracker
    monkeypatch.setattr(job_tracker, "load_tracker", lambda: fake_jobs)
    assert read_tools.get_application_by_id("j1")["company"] == "A"
    assert read_tools.get_application_by_id("missing") is None
