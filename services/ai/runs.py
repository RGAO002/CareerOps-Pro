"""AI run state CRUD: `saved_sessions/ai_runs/{runId}.json`.

State includes user_input, selection, coordinator_decision, accumulated
suggestion ids, status (running/done/error), created_at, completed_at."""
from __future__ import annotations
import json
import time
import uuid
from pathlib import Path
from typing import Callable, Optional

RUNS_DIR = Path(__file__).resolve().parents[2] / "saved_sessions" / "ai_runs"

_RUN_ORPHAN_TIMEOUT_MS = 60 * 1000              # 60s for running → error
_DONE_RETENTION_MS = 5 * 60 * 1000              # 5min to keep done/error states


def _path(run_id: str) -> Path:
    return RUNS_DIR / f"{run_id}.json"


def _now_ms() -> int:
    return int(time.time() * 1000)


def create(initial: dict) -> str:
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    state = {
        "run_id": run_id,
        "status": "running",
        "created_at": _now_ms(),
        "completed_at": None,
        "coordinator_decision": None,
        "applied_suggestion_ids": [],
        "error": None,
        **initial,
    }
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    _path(run_id).write_text(json.dumps(state, indent=2))
    return run_id


def load(run_id: str) -> Optional[dict]:
    p = _path(run_id)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def update(run_id: str, *, _patch: Optional[dict] = None, **fields) -> None:
    state = load(run_id)
    if state is None:
        return
    for k, v in fields.items():
        state[k] = v
    if _patch:
        state.update(_patch)
    _path(run_id).write_text(json.dumps(state, indent=2))


def gc(*, now_ms: Callable[[], int] = _now_ms) -> int:
    if not RUNS_DIR.exists():
        return 0
    now = now_ms()
    purged = 0
    for p in list(RUNS_DIR.glob("run_*.json")):
        try:
            state = json.loads(p.read_text())
        except Exception:
            p.unlink(missing_ok=True)
            purged += 1
            continue
        st = state.get("status")
        if st in ("done", "error"):
            ts = state.get("completed_at") or state.get("created_at") or 0
            if now - ts > _DONE_RETENTION_MS:
                p.unlink(missing_ok=True)
                purged += 1
        elif st == "running":
            if now - (state.get("created_at") or 0) > _RUN_ORPHAN_TIMEOUT_MS:
                state["status"] = "error"
                state["error"] = "orphan_timeout"
                state["completed_at"] = now
                p.write_text(json.dumps(state, indent=2))
    return purged
