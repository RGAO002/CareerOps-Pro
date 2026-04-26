# api/services/snapshot_store.py
"""File-based snapshot store.

Layout:
  saved_sessions/resumes/snapshots/{resume_id}/{snapshot_id}.json

Retention:
  - ai_edit, checkpoint: kept forever
  - auto, manual_save: combined rolling window of 50 most recent
"""
import json
from pathlib import Path
from typing import Optional

from api.models.resume import ResumeSnapshot


PROJECT_ROOT = Path(__file__).parent.parent.parent
SNAPSHOTS_DIR = PROJECT_ROOT / "saved_sessions" / "resumes" / "snapshots"

ROLLING_TRIGGERS = ("auto", "manual_save")
ROLLING_LIMIT = 50


def _resume_dir(resume_id: str) -> Path:
    return SNAPSHOTS_DIR / resume_id


def _ensure_resume_dir(resume_id: str) -> Path:
    d = _resume_dir(resume_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def save(snapshot: ResumeSnapshot) -> None:
    """Persist a snapshot."""
    d = _ensure_resume_dir(snapshot.resume_id)
    (d / f"{snapshot.id}.json").write_text(
        snapshot.model_dump_json(indent=2),
        encoding="utf-8",
    )


def get(snapshot_id: str) -> Optional[ResumeSnapshot]:
    """Find a snapshot by id across all resume dirs."""
    if not SNAPSHOTS_DIR.exists():
        return None
    for resume_dir in SNAPSHOTS_DIR.iterdir():
        if not resume_dir.is_dir():
            continue
        path = resume_dir / f"{snapshot_id}.json"
        if path.exists():
            try:
                return ResumeSnapshot.model_validate_json(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, ValueError):
                return None
    return None


def list_for_resume(resume_id: str) -> list[ResumeSnapshot]:
    """List all snapshots for one resume, newest first."""
    d = _resume_dir(resume_id)
    if not d.exists():
        return []
    snaps: list[ResumeSnapshot] = []
    for f in d.glob("*.json"):
        try:
            snaps.append(ResumeSnapshot.model_validate_json(f.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, ValueError):
            continue
    return sorted(snaps, key=lambda s: s.created_at, reverse=True)


def enforce_retention(resume_id: str) -> None:
    """Trim rolling snapshots to ROLLING_LIMIT, preserve ai_edit/checkpoint."""
    snaps = list_for_resume(resume_id)
    rolling = [s for s in snaps if s.trigger in ROLLING_TRIGGERS]
    if len(rolling) <= ROLLING_LIMIT:
        return
    to_delete = rolling[ROLLING_LIMIT:]
    for s in to_delete:
        path = _resume_dir(s.resume_id) / f"{s.id}.json"
        if path.exists():
            path.unlink()
