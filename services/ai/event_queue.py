"""Per-run event channel — backs live SSE streaming during orchestration.

Module-level `{run_id: {queue, closed_at}}` dict. Producer (orchestrator on a
background thread) writes events; consumer (SSE generator on the asyncio loop)
reads via `await asyncio.to_thread(queue.get, timeout=...)`.

Events are dicts shaped `{type: str, data: dict}`. Event types match spec § 4.4:
run.started, agent.started, agent.narration, suggestion.streamed,
agent.completed, run.completed, run.error.

`close(run_id)` pushes a `CLOSE_SENTINEL` so the consumer's loop can break
cleanly. The slot stays in `_QUEUES` (with `closed_at` set) for a 5-min
grace period only for debug/admin introspection — `gc(now_ms)` removes it
afterwards. **`get_queue()` returns None for any closed run**, so live
(during-run) consumers and post-close attachers split at `get_queue()`:
the live consumer holds the queue ref obtained at attach time and drains
through the sentinel; post-close attachers see None and fall through to
the route's `_replay_from_state` one-shot path. This avoids the hang a
second consumer would experience if it attached to an empty closed queue
(it would block on `queue.get` forever — the sentinel was already drained
by the first consumer).
"""
from __future__ import annotations
import queue
import time
from typing import Callable, Dict, Optional, TypedDict

_GRACE_PERIOD_MS = 5 * 60 * 1000   # keep closed queues 5 min for late attachers


class _Slot(TypedDict, total=False):
    queue: "queue.Queue"
    closed_at: Optional[int]   # ms epoch; None while still receiving


_QUEUES: Dict[str, _Slot] = {}

CLOSE_SENTINEL = {"type": "CLOSE", "data": {}}


def _now_ms() -> int:
    return int(time.time() * 1000)


def open(run_id: str) -> "queue.Queue":
    """Allocate a fresh queue for this run. close() pushes a sentinel; gc()
    removes the entry from the dict after a grace period."""
    q: queue.Queue = queue.Queue()
    _QUEUES[run_id] = {"queue": q, "closed_at": None}
    return q


def emit(run_id: str, event_type: str, data: dict) -> None:
    """Producer-side: push an event onto the run's queue. No-op if queue gone.
    Tolerates emit-after-close by silently dropping (orchestrator's `finally`
    may double-emit due to retry logic)."""
    slot = _QUEUES.get(run_id)
    if slot is None or slot.get("closed_at") is not None:
        return
    slot["queue"].put({"type": event_type, "data": data})


def get_queue(run_id: str) -> Optional["queue.Queue"]:
    """Consumer-side accessor. Returns the queue ONLY for runs that haven't
    been closed yet. After close(), returns None so late attachers fall through
    to the route's `_replay_from_state` one-shot path.

    Why not return the queue post-close? A second SSE consumer that attaches
    after the first has already drained CLOSE_SENTINEL would see an empty
    closed queue and block indefinitely (queue.get blocks until next put,
    which never comes). The route layer's overall stream timeout would
    eventually catch it (~120s), but that's an unacceptable hang.

    The slot stays in _QUEUES (with closed_at set) until gc(), but only so
    that the (currently unused) admin / debug surface can introspect closed
    runs. Active consumers always go through the live path during the run
    OR the replay path after close — never the half-open middle ground.
    """
    slot = _QUEUES.get(run_id)
    if slot is None:
        return None
    if slot.get("closed_at") is not None:
        return None              # post-close → use replay path
    return slot["queue"]


def close(run_id: str) -> None:
    """Push the close sentinel + mark closed_at. Does NOT remove from _QUEUES.
    Safe to call twice (second call is a no-op)."""
    slot = _QUEUES.get(run_id)
    if slot is None or slot.get("closed_at") is not None:
        return
    slot["closed_at"] = _now_ms()
    slot["queue"].put(CLOSE_SENTINEL)


def gc(*, now_ms: Callable[[], int] = _now_ms) -> int:
    """Remove queues whose `closed_at` is older than the grace period. Called
    periodically by the runs GC sweep (or on-demand from tests)."""
    now = now_ms()
    purged = 0
    for rid in list(_QUEUES.keys()):
        slot = _QUEUES[rid]
        ts = slot.get("closed_at")
        if ts is not None and now - ts > _GRACE_PERIOD_MS:
            del _QUEUES[rid]
            purged += 1
    return purged
