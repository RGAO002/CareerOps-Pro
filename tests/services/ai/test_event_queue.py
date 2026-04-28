"""Per-run event queue: producer/consumer between threads."""
import threading
import time
import pytest

from services.ai import event_queue


def test_open_emit_get_close():
    rid = "run_test"
    q = event_queue.open(rid)
    event_queue.emit(rid, "agent.started", {"agentId": "PolishAgent"})
    ev = q.get(timeout=1)
    assert ev == {"type": "agent.started", "data": {"agentId": "PolishAgent"}}
    event_queue.close(rid)
    sentinel = q.get(timeout=1)
    assert sentinel == event_queue.CLOSE_SENTINEL
    # Post-close: existing consumers (who hold `q` from their attach-time
    # get_queue call) can still drain via their own reference; NEW attachers
    # see None and fall through to the route's replay-from-state path.
    # This avoids hanging a second consumer on an empty closed queue.
    assert event_queue.get_queue(rid) is None


def test_emit_after_close_is_dropped():
    """Defensive: if orchestrator's finally accidentally double-emits, the
    second emit is silently dropped (no extra event after the sentinel)."""
    rid = "run_double"
    q = event_queue.open(rid)
    event_queue.close(rid)
    event_queue.emit(rid, "stray", {"oops": True})
    sentinel = q.get(timeout=1)
    assert sentinel == event_queue.CLOSE_SENTINEL
    # No further event:
    import queue as _q
    with pytest.raises(_q.Empty):
        q.get(timeout=0.1)


def test_gc_purges_queues_past_grace_period():
    rid = "run_gc"
    event_queue.open(rid)
    event_queue.close(rid)
    # Fake "5 min later":
    event_queue.gc(now_ms=lambda: int(__import__("time").time() * 1000) + 6 * 60 * 1000)
    assert event_queue.get_queue(rid) is None


def test_gc_keeps_slot_within_grace_period_for_debug_introspection():
    """Slot stays in _QUEUES dict after close until 5min grace expires —
    only for admin/debug visibility. `get_queue()` still returns None
    once closed (active SSE consumers go to replay path); this test peeks
    at the underlying dict directly to verify the slot is preserved."""
    rid = "run_keep"
    event_queue.open(rid)
    event_queue.close(rid)
    event_queue.gc()  # current time → still within 5 min
    # get_queue returns None because closed (consumers go to replay):
    assert event_queue.get_queue(rid) is None
    # But the slot is still in the dict (not yet GC'd):
    assert rid in event_queue._QUEUES


def test_emit_to_unknown_run_is_noop():
    event_queue.emit("nonexistent", "x", {})  # no exception


def test_threaded_producer_consumer():
    rid = "run_t"
    q = event_queue.open(rid)
    received = []

    def producer():
        for i in range(5):
            event_queue.emit(rid, "suggestion.streamed", {"i": i})
        event_queue.close(rid)

    threading.Thread(target=producer).start()
    while True:
        ev = q.get(timeout=2)
        if ev == event_queue.CLOSE_SENTINEL:
            break
        received.append(ev["data"]["i"])
    assert received == [0, 1, 2, 3, 4]
