"""File-based Suggestion sidecar storage.

Path: `saved_sessions/resumes/{resumeId}.suggestions.json`
Shape: `{"version": 1, "items": [Suggestion, ...]}`

This is intentionally append-only-then-status-mutation; we never delete in-place
(except via `gc`). All status writes go through `set_status` so the timestamp
side-effect table from spec § 5.2 is enforced in one place.
"""
from __future__ import annotations
import json
import time
from pathlib import Path
from typing import Callable, Optional

from .types import Suggestion, SuggestionStatus

# Module-level for monkeypatch in tests:
RESUMES_DIR = Path(__file__).resolve().parents[2] / "saved_sessions" / "resumes"

# Retention windows (spec § 5.3):
_TERMINAL_RETENTION_MS = 24 * 60 * 60 * 1000     # 24 hours
_STREAMING_ORPHAN_MS = 5 * 60 * 1000              # 5 minutes


def _path(resume_id: str) -> Path:
    return RESUMES_DIR / f"{resume_id}.suggestions.json"


def _load(resume_id: str) -> dict:
    p = _path(resume_id)
    if not p.exists():
        return {"version": 1, "items": []}
    return json.loads(p.read_text())


def _save(resume_id: str, data: dict) -> None:
    p = _path(resume_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2))


def append(resume_id: str, s: Suggestion) -> None:
    data = _load(resume_id)
    data["items"].append(s)
    _save(resume_id, data)


def list_for_resume(resume_id: str, *, status_filter: Optional[set] = None) -> list:
    data = _load(resume_id)
    items = data["items"]
    if status_filter:
        items = [x for x in items if x.get("status") in status_filter]
    return items


def get(resume_id: str, suggestion_id: str) -> Optional[Suggestion]:
    for x in _load(resume_id)["items"]:
        if x["id"] == suggestion_id:
            return x
    return None


def set_status(
    resume_id: str,
    suggestion_id: str,
    target_status: SuggestionStatus,
    *,
    now_ms: Callable[[], int] = lambda: int(time.time() * 1000),
) -> dict:
    """Apply spec § 5.2 timestamp side effects atomically with the status write.

    Returns:
      {ok: True}                — transitioned
      {ok: True, noop: True}    — already at target_status
      {ok: False, current: ...} — not allowed (terminal -> different terminal)

    Allowed transitions:
      pending  -> accepted | rejected | superseded
      accepted -> pending  (undo revert)
      rejected -> pending  (defensive symmetry; not used in v0 but harmless)
      superseded -> pending (defensive)
      X -> X (idempotent no-op)
    """
    data = _load(resume_id)
    for x in data["items"]:
        if x["id"] != suggestion_id:
            continue
        current = x.get("status")
        if current == target_status:
            return {"ok": True, "noop": True}

        terminal = {"accepted", "rejected", "superseded"}
        # Block transitions between two different terminals (e.g. rejected -> accepted).
        if current in terminal and target_status in terminal:
            return {"ok": False, "current": current}

        # Apply the transition + clear all terminal timestamps, then set the
        # one corresponding to target_status if applicable.
        x["status"] = target_status
        x.pop("appliedAt", None)
        x.pop("rejectedAt", None)
        x.pop("supersededAt", None)
        if target_status == "accepted":
            x["appliedAt"] = now_ms()
        elif target_status == "rejected":
            x["rejectedAt"] = now_ms()
        elif target_status == "superseded":
            x["supersededAt"] = now_ms()
        # target_status == "pending": all timestamps stay cleared
        _save(resume_id, data)
        return {"ok": True}
    return {"ok": False, "current": None}  # not found


def gc(
    resume_id: str,
    *,
    now_ms: Callable[[], int] = lambda: int(time.time() * 1000),
) -> int:
    """Purge:
      - terminal-status records whose terminal timestamp is older than 24h
      - streaming-status records older than `createdAt + 5min` (orphan from crashed run)
    Returns count purged.
    """
    data = _load(resume_id)
    now = now_ms()
    keep = []
    purged = 0
    for x in data["items"]:
        st = x.get("status")
        if st in ("accepted", "rejected", "superseded"):
            ts_field = {"accepted": "appliedAt", "rejected": "rejectedAt", "superseded": "supersededAt"}[st]
            ts = x.get(ts_field) or 0
            if now - ts > _TERMINAL_RETENTION_MS:
                purged += 1
                continue
        elif st == "streaming":
            if now - (x.get("createdAt") or 0) > _STREAMING_ORPHAN_MS:
                purged += 1
                continue
        keep.append(x)
    data["items"] = keep
    _save(resume_id, data)
    return purged
