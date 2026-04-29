"""6 read tools (pure, no side effect) wired into Coordinator's tool palette.

Spec § 3.1. Backed by:
  - `saved_sessions/resumes/{id}.json` (existing resume sidecar)
  - `services/job_tracker.py` (existing job applications store)
"""
from __future__ import annotations
from typing import Optional

from api.services import resume_store
from services import job_tracker

RESUMES_DIR = resume_store.RESUMES_DIR


def _load_resume(resume_id: str) -> Optional[dict]:
    original_dir = resume_store.RESUMES_DIR
    resume_store.RESUMES_DIR = RESUMES_DIR
    try:
        return resume_store.load_dict(resume_id)
    except (FileNotFoundError, ValueError):
        return None
    finally:
        resume_store.RESUMES_DIR = original_dir


def get_current_resume(resume_id: str) -> Optional[dict]:
    """Full resume document (current edit state on disk)."""
    return _load_resume(resume_id)


def get_resume_block(resume_id: str, block_id: str) -> Optional[dict]:
    """Locate a single block (header / section / entry / bullet) by id and
    return it tagged with its kind. None if missing."""
    r = _load_resume(resume_id)
    if not r:
        return None
    if r["header"]["id"] == block_id:
        return {**r["header"], "kind": "header"}
    for s in r["sections"]:
        if s["id"] == block_id:
            return {**s, "kind": "section"}
        for e in s["entries"]:
            if e["id"] == block_id:
                return {**e, "kind": "entry"}
            for b in e["bullets"]:
                if b["id"] == block_id:
                    return {**b, "kind": "bullet"}
    return None


def list_user_resumes() -> list:
    """Lightweight summary of all resumes — id / title / updated_at / target_*."""
    original_dir = resume_store.RESUMES_DIR
    resume_store.RESUMES_DIR = RESUMES_DIR
    try:
        resumes = resume_store.list_all_dict()
    finally:
        resume_store.RESUMES_DIR = original_dir
    out = []
    for r in resumes:
        out.append({
            "id": r.get("id"),
            "title": r.get("title"),
            "updated_at": (r.get("metadata") or {}).get("updated_at"),
            "target_company": (r.get("metadata") or {}).get("target_company"),
            "target_role": (r.get("metadata") or {}).get("target_role"),
        })
    return out


def get_resume_by_id(resume_id: str) -> Optional[dict]:
    """Alias for `get_current_resume` — exposed as a separate tool for clarity in
    the LLM prompt ("look up THAT resume, not necessarily the current one")."""
    return _load_resume(resume_id)


def get_application_history(
    status: Optional[str] = None,
    company: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 50,
) -> list:
    """Filtered job application list. Mirrors `GET /api/jobs/` filters."""
    data = job_tracker.load_tracker()
    items = data.get("jobs", [])
    if status:
        items = [j for j in items if j.get("status") == status]
    if company:
        c = company.lower()
        items = [j for j in items if c in (j.get("company") or "").lower()]
    if since:
        items = [j for j in items if (j.get("date_applied") or "") >= since]
    return items[:limit]


def get_application_by_id(job_id: str) -> Optional[dict]:
    """Single application incl. full JD text."""
    data = job_tracker.load_tracker()
    for j in data.get("jobs", []):
        if j.get("id") == job_id:
            return j
    return None
