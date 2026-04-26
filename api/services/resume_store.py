# api/services/resume_store.py
"""File-based resume store under saved_sessions/resumes/.

v1 storage. Phase 2+ may migrate to Postgres.
"""
import json
from pathlib import Path
from typing import Optional

from api.models.resume import Resume


PROJECT_ROOT = Path(__file__).parent.parent.parent
RESUMES_DIR = PROJECT_ROOT / "saved_sessions" / "resumes"


def _ensure_dir() -> None:
    RESUMES_DIR.mkdir(parents=True, exist_ok=True)
    (RESUMES_DIR / "snapshots").mkdir(exist_ok=True)


def _path_for(resume_id: str) -> Path:
    return RESUMES_DIR / f"{resume_id}.json"


def save(resume: Resume) -> None:
    """Write a resume to disk, overwriting if it exists."""
    _ensure_dir()
    _path_for(resume.id).write_text(
        resume.model_dump_json(indent=2),
        encoding="utf-8",
    )


def get(resume_id: str) -> Optional[Resume]:
    """Load a resume by id, or None if not found."""
    path = _path_for(resume_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return Resume.model_validate(data)
    except (json.JSONDecodeError, ValueError):
        return None


def list_all() -> list[Resume]:
    """List all resumes, newest updated_at first."""
    _ensure_dir()
    resumes: list[Resume] = []
    for f in RESUMES_DIR.glob("*.json"):
        if f.parent != RESUMES_DIR:
            continue  # skip snapshots subdir
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            resumes.append(Resume.model_validate(data))
        except (json.JSONDecodeError, ValueError):
            continue
    return sorted(resumes, key=lambda r: r.updated_at, reverse=True)


def delete(resume_id: str) -> None:
    """Delete a resume file. Snapshots are NOT deleted (separate concern)."""
    path = _path_for(resume_id)
    if path.exists():
        path.unlink()
