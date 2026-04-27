# api/services/resume_store.py
"""File-based resume store under saved_sessions/resumes/.

v1 storage. Phase 2+ may migrate to Postgres.
"""
import json
import re
from pathlib import Path
from typing import Optional

from api.models.resume import Resume


PROJECT_ROOT = Path(__file__).parent.parent.parent
RESUMES_DIR = PROJECT_ROOT / "saved_sessions" / "resumes"


_VALID_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def _validate_id(resume_id: str) -> None:
    """Reject ids that could enable path traversal or filesystem mischief.

    Allowed pattern covers UUIDs and any sane id without enabling ``..``,
    ``/``, or null bytes.
    """
    if not isinstance(resume_id, str) or not _VALID_ID_RE.match(resume_id):
        raise ValueError(f"Invalid resume id: {resume_id!r}")


def _ensure_dir() -> None:
    RESUMES_DIR.mkdir(parents=True, exist_ok=True)
    (RESUMES_DIR / "snapshots").mkdir(exist_ok=True)


def _path_for(resume_id: str) -> Path:
    _validate_id(resume_id)
    return RESUMES_DIR / f"{resume_id}.json"


def save(resume: Resume) -> None:
    """Write a resume to disk, overwriting if it exists."""
    _validate_id(resume.id)
    _ensure_dir()
    _path_for(resume.id).write_text(
        resume.model_dump_json(indent=2),
        encoding="utf-8",
    )


def get(resume_id: str) -> Optional[Resume]:
    """Load a resume by id, or None if not found."""
    _validate_id(resume_id)
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
    _validate_id(resume_id)
    path = _path_for(resume_id)
    if path.exists():
        path.unlink()


# ---------------------------------------------------------------------------
# v2 schema helpers — version-aware load + dict-shaped save.
#
# load_dict() returns the raw v2-shaped dict regardless of on-disk version.
# v1 docs are auto-migrated through migration_v1_to_v2.migrate_one_dict()
# (lazy import to avoid a circular pull at module load).
# ---------------------------------------------------------------------------


def load_dict(resume_id: str) -> dict:
    """Load a resume as a dict, auto-migrating v1 → v2 on read.

    Used by code that wants the v2 shape regardless of what the file currently
    holds on disk. The original file is NOT rewritten — the on-disk version is
    only changed by an explicit save (CLI migration or save_v2_dict).
    """
    _validate_id(resume_id)
    path = _path_for(resume_id)
    if not path.exists():
        raise FileNotFoundError(f"Resume {resume_id} not found")
    raw = json.loads(path.read_text(encoding="utf-8"))
    version = raw.get("schema_version", 1)
    if version == 2:
        return raw
    # Lazy import: migration module may import from here in the future.
    from api.services.migration_v1_to_v2 import migrate_one_dict
    return migrate_one_dict(raw)


def save_v2_dict(resume_v2: dict) -> None:
    """Write a v2-shaped resume dict to disk."""
    if "id" not in resume_v2:
        raise ValueError("missing id")
    _validate_id(resume_v2["id"])
    _ensure_dir()
    _path_for(resume_v2["id"]).write_text(
        json.dumps(resume_v2, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def list_all_dict() -> list[dict]:
    """List all resumes as v2-shaped dicts, newest updated_at first.

    Both v1 and v2 files on disk are returned in v2 shape (v1 is auto-migrated
    via load_dict). Files that fail to load are silently skipped.

    Sort key prefers v2 ``metadata.updated_at`` (ISO string) when present and
    falls back to v1 ``updated_at`` (epoch ms) — comparable lexically for ISO
    strings; falls back gracefully when types mix.
    """
    _ensure_dir()
    resumes: list[dict] = []
    for f in RESUMES_DIR.glob("*.json"):
        if f.parent != RESUMES_DIR:
            continue  # skip snapshots subdir
        try:
            rid = f.stem
            _validate_id(rid)
            resumes.append(load_dict(rid))
        except (json.JSONDecodeError, ValueError, FileNotFoundError):
            continue

    def _key(r: dict):
        meta = r.get("metadata") or {}
        ua = meta.get("updated_at")
        # Stringify so heterogenous types (ISO strings vs epoch ints) still sort.
        return str(ua) if ua is not None else ""

    return sorted(resumes, key=_key, reverse=True)
