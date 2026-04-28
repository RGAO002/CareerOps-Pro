# Resume Editor AI Integration v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire AI editing into the v2 resume editor: Coordinator + PolishAgent + ExperienceAgent (LangGraph) emit reviewable Suggestions; sidebar review surface; soft-lock visual; frontend-owned apply with optimistic supersede; undo via additive `_aiApplyTransaction`. Strict v2 non-regression per spec § 0.5.

**Architecture:** Backend Python + LangGraph + FastAPI SSE; frontend Zustand stores (`useSuggestionStore`, `useAILockStore`) + new `AISidebar` component. Existing v2 store actions are reused as-is — only additive extensions allowed: optional `forcedId` on `insertBullet`/`insertEntry`, `_aiApplyTransaction` helper, `~5-line undo()/redo()` dispatch, `_undoSuppressed` flag.

**Tech Stack:** Python 3 · FastAPI · LangGraph · langchain-anthropic · uuid · python-dotenv · pytest+httpx (backend tests) · TypeScript 5 · Next.js 16 · Zustand · TipTap 3 · Vitest + happy-dom (frontend tests) · Anthropic Claude API (`ANTHROPIC_API_KEY` env)

**Spec source of truth:** `docs/superpowers/specs/2026-04-28-resume-editor-ai-design.md`

**Branch:** `feature/resume-editor-v2` (continue on existing v2 branch — Task 0 confirms)

---

## File Structure (locked at plan time)

### Backend — NEW
- `api/routes/jobs.py` — wraps `services/job_tracker.py` reads
- `api/routes/ai.py` — `POST /api/ai/run`, `GET /api/ai/runs/{runId}/events` (SSE), `GET /api/ai/suggestions`, `POST /api/ai/suggestions/{id}/status`
- `services/ai/__init__.py`
- `services/ai/types.py` — TypedDicts for Suggestion variants, AIRunState, etc.
- `services/ai/suggestions.py` — file-based CRUD over `saved_sessions/resumes/{id}.suggestions.json` (flat sidecar — corrects spec § 5.3 path)
- `services/ai/runs.py` — file-based CRUD for in-flight run state
- `services/ai/context.py` — `build_skeleton`, `build_section_detail`, `build_focus_block`
- `services/ai/llm.py` — Anthropic client thin wrapper
- `services/ai/tools/__init__.py`
- `services/ai/tools/read_tools.py` — 6 read tool implementations
- `services/ai/tools/write_tools.py` — 10 write tool implementations (emit Suggestions only)
- `services/ai/agents/__init__.py`
- `services/ai/agents/coordinator.py`
- `services/ai/agents/polish.py`
- `services/ai/agents/experience.py`
- `services/ai/orchestrator.py` — LangGraph build
- `tests/api/test_jobs_routes.py`
- `tests/api/test_ai_routes.py`
- `tests/services/ai/test_suggestions.py`
- `tests/services/ai/test_context.py`
- `tests/services/ai/test_write_tools.py`
- `tests/services/ai/test_orchestrator.py`

### Backend — MODIFY
- `requirements.txt` — add `langgraph`
- `api/main.py` — register `jobs_router`, `ai_router`

### Frontend — NEW
- `frontend/src/stores/aiSuggestion.ts` — `useSuggestionStore`
- `frontend/src/stores/aiLock.ts` — `useAILockStore`
- `frontend/src/components/ai/AISessionClient.ts` — SSE consumer
- `frontend/src/components/ai/concurrencyCheck.ts` — op-specific frontend check
- `frontend/src/components/ai/applySuggestion.ts` — per-op apply via `_aiApplyTransaction`
- `frontend/src/components/ai/AISidebar.tsx`
- `frontend/src/components/ai/AISidebarRow.tsx`
- `frontend/src/components/ai/__tests__/applySuggestion.test.ts`
- `frontend/src/components/ai/__tests__/concurrencyCheck.test.ts`
- `frontend/src/stores/__tests__/aiSuggestion.test.ts`

### Frontend — MODIFY (additive only — see spec § 0.5 rule #7)
- `frontend/src/components/resume/v2/types.ts` — add `'ai-apply'` to `UpdateOriginType` union (additive — existing values untouched; matches existing `'ai-rewrite'` precedent for AI-driven mutations, but distinguishes "applying a Suggestion record" from generic AI rewrites)
- `frontend/src/components/resume/v2/store/undo-stack.ts` — widen `UndoEntry` type with optional `kind/runId/suggestionIds`
- `frontend/src/components/resume/v2/store/useResumeStore.ts` — add `_undoSuppressed`, `_aiApplyTransaction`, `_registerAiApplyUndoCallback`, dispatch in undo/redo
- `frontend/src/components/resume/v2/store/actions/insertBlock.ts` — optional `forcedId` (and forced-first-bullet-id for insertEntry)
- `frontend/src/components/resume/v2/store/actions/structural.test.ts` — add forcedId tests
- `frontend/src/components/resume/v2/interaction/DragController.ts` — lock check at startDrag/commitDrop
- `frontend/src/components/resume/v2/interaction/DragController.test.ts` — lock-blocks-drag tests
- `frontend/src/components/resume/v2/EditorPage.tsx` — `usePageContext` registration + mount `AISidebar` + double-click ⋮⋮ wiring
- `frontend/src/components/resume/v2/atoms/HeaderRowInteractionOverlay.tsx`, `EntryRowInteractionOverlay.tsx`, `BulletInteractionOverlay.tsx` — double-click handler on ⋮⋮ to open sidebar
- `frontend/src/components/resume/v2/atoms/AtomRenderer.tsx` (or AtomContentLayer) — soft-lock visual (opacity + pulse + border) when `useAILockStore` contains the block id
- `frontend/src/components/layout/AIChatPanel/index.tsx` — replace mock send with `POST /api/ai/run` + SSE narration + render "📋 View in sidebar" button on completion

### Persistence on disk — NEW files appearing at runtime
- `saved_sessions/resumes/{id}.suggestions.json` — Suggestion sidecar per resume
- `saved_sessions/ai_runs/{runId}.json` — in-flight run state, GC after `run.completed + 5min`

---

## Test Commands (use these exactly throughout)

**Backend:**
```bash
cd /Users/fred/Desktop/CareerOps-Pro
pytest tests/ -v
pytest tests/services/ai/ -v          # AI services only
pytest tests/api/test_ai_routes.py -v # AI routes only
```

**Frontend (v2 regression net — must stay green throughout per spec § 0.5):**
```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend
npx vitest run src/components/resume/v2
```

**Frontend new AI surface:**
```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend
npx vitest run src/components/ai src/stores
```

---

## Task Index

- Task 0: Inventory + branch + LLM env (no code)
- Task 1: Backend — Suggestion types + sidecar storage
- Task 2: Backend — `api/routes/jobs.py`
- Task 3: Backend — Read tools
- Task 4: Backend — Write tools (emit Suggestions, no mutation)
- Task 5: Backend — Context builder (skeleton + section + focus)
- Task 6: Backend — LLM wrapper (Anthropic + tool-call interface)
- Task 7: Backend — CoordinatorAgent
- Task 8: Backend — PolishAgent
- Task 9: Backend — ExperienceAgent
- Task 10: Backend — LangGraph orchestrator + run state
- Task 11: Backend — `api/routes/ai.py` (run / SSE events / suggestions / status)
- Task 12: Frontend — UndoStack widening + `_aiApplyTransaction` + dispatch
- Task 13: Frontend — `forcedId` on insertBullet/insertEntry
- Task 14: Frontend — `useSuggestionStore` + `useAILockStore`
- Task 15: Frontend — `concurrencyCheck.ts` (op-specific)
- Task 16: Frontend — `applySuggestion.ts` (per-op apply via transaction)
- Task 17: Frontend — `AISessionClient` (SSE consumer)
- Task 18: Frontend — `AISidebar` UI
- Task 19: Frontend — Soft lock visual + DragController/keyboard structural guards
- Task 20: Frontend — EditorPage wiring (pageContext + sidebar mount + ⋮⋮ double-click)
- Task 21: Frontend — Wire AIChatPanel send → `/api/ai/run` + narration + button
- Task 22: Final regression sweep + AC walkthrough (per spec § 11)

---

## Task 0: Inventory + branch + LLM env

**Files:** none — verification + setup only.

- [ ] **Step 1: Verify spec assumptions are still true on disk**

```bash
# All must pass; if any fails, stop and reconcile with spec author before continuing.
test -f /Users/fred/Desktop/CareerOps-Pro/api/main.py
test -f /Users/fred/Desktop/CareerOps-Pro/api/routes/resume.py
test -f /Users/fred/Desktop/CareerOps-Pro/services/job_tracker.py
test -f /Users/fred/Desktop/CareerOps-Pro/saved_sessions/job_tracker.json
test -f /Users/fred/Desktop/CareerOps-Pro/frontend/src/components/resume/v2/store/useResumeStore.ts
test -f /Users/fred/Desktop/CareerOps-Pro/frontend/src/components/resume/v2/store/undo-stack.ts
test -f /Users/fred/Desktop/CareerOps-Pro/frontend/src/components/resume/v2/store/actions/insertBlock.ts
test -f /Users/fred/Desktop/CareerOps-Pro/frontend/src/stores/aiPanel.ts
test -f /Users/fred/Desktop/CareerOps-Pro/frontend/src/stores/conversation.ts
test -f /Users/fred/Desktop/CareerOps-Pro/frontend/src/stores/pageContext.ts
grep -q '"prefix=\"/api/resume\""\|prefix="/api/resume"' /Users/fred/Desktop/CareerOps-Pro/api/main.py
echo "✓ all spec assumptions verified"
```

Expected: prints `✓ all spec assumptions verified`. If any `test -f` fails, the spec needs reconciliation before plan execution.

- [ ] **Step 2: Verify v2 baseline tests are green**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/components/resume/v2 2>&1 | tail -3
```
Expected: `Test Files  37 passed (37) / Tests  223 passed | 1 skipped (224)` (or higher counts if more tests landed since spec). Record the baseline numbers — they are the floor for every subsequent task per spec § 0.5 rule #10.

- [ ] **Step 3: Confirm branch + LLM env**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro branch --show-current
# Expected: feature/resume-editor-v2

# Verify ANTHROPIC_API_KEY is loadable from .env (used by langchain-anthropic).
# .env is git-ignored; user must have it configured locally.
test -f /Users/fred/Desktop/CareerOps-Pro/.env && grep -q "^ANTHROPIC_API_KEY=" /Users/fred/Desktop/CareerOps-Pro/.env && echo "✓ ANTHROPIC_API_KEY present" || echo "✗ Set ANTHROPIC_API_KEY in .env before proceeding"
```

If branch is not `feature/resume-editor-v2`: switch to it (`git checkout feature/resume-editor-v2`). v0 work continues directly on this branch — no sub-branch — because the v2 editor and AI integration ship as one coherent feature and frequent merges between them are unnecessary. If `ANTHROPIC_API_KEY` is missing, halt and ask user to populate `.env`.

- [ ] **Step 4: Add `langgraph` to `requirements.txt`**

`requirements.txt` modify — add this line right after `langchain-core`:

```
langgraph>=0.2,<0.3
```

Then install:
```bash
cd /Users/fred/Desktop/CareerOps-Pro && pip install -r requirements.txt 2>&1 | tail -5
python -c "import langgraph; print('langgraph', langgraph.__version__)"
```
Expected: prints version string like `langgraph 0.2.x`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add requirements.txt
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: add langgraph dependency"
```

---

## Task 1: Backend — Suggestion types + sidecar storage

**Files:**
- Create: `services/ai/__init__.py`
- Create: `services/ai/types.py`
- Create: `services/ai/suggestions.py`
- Create: `tests/services/__init__.py` (if missing)
- Create: `tests/services/ai/__init__.py`
- Create: `tests/services/ai/test_suggestions.py`

- [ ] **Step 1: Write failing test for storage CRUD + status timestamps**

`tests/services/ai/test_suggestions.py`:

```python
"""Suggestion sidecar storage CRUD with op-specific shape + status-timestamp side effects.

Spec refs:
  - § 5.1 (discriminated union schema with `supersededAt`)
  - § 5.2 (POST /status timestamp side-effect table)
  - § 5.3 (24h GC retention; persistence path)

Storage path: `saved_sessions/resumes/{resumeId}.suggestions.json` (flat sidecar).
"""
import json
import time
from pathlib import Path

import pytest

from services.ai import suggestions
from services.ai.types import (
    UpdateSuggestion,
    InsertSuggestion,
    BlockSnapshot,
    EditableField,
)


@pytest.fixture
def tmp_resume_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    return tmp_path


def test_append_then_list_returns_records(tmp_resume_dir):
    s: UpdateSuggestion = {
        "id": "sug_1",
        "runId": "run_1",
        "agentId": "PolishAgent",
        "resumeId": "r1",
        "status": "pending",
        "createdAt": 1_700_000_000_000,
        "source": {"kind": "agent", "agentId": "PolishAgent", "runId": "run_1"},
        "op": "update",
        "field": {"kind": "bullet.content", "id": "b1"},
        "before": {"type": "doc", "content": [{"type": "paragraph"}]},
        "after":  {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x"}]}]},
    }
    suggestions.append("r1", s)
    out = suggestions.list_for_resume("r1")
    assert len(out) == 1 and out[0]["id"] == "sug_1"


def test_status_accepted_sets_appliedAt_clears_others(tmp_resume_dir):
    s = _make_update("sug_a", "r1")
    s["rejectedAt"] = 999
    s["supersededAt"] = 998
    suggestions.append("r1", s)
    suggestions.set_status("r1", "sug_a", "accepted", now_ms=lambda: 12345)
    out = suggestions.list_for_resume("r1")
    assert out[0]["status"] == "accepted"
    assert out[0]["appliedAt"] == 12345
    assert "rejectedAt" not in out[0] or out[0].get("rejectedAt") is None
    assert "supersededAt" not in out[0] or out[0].get("supersededAt") is None


def test_status_pending_clears_all_terminal_timestamps(tmp_resume_dir):
    s = _make_update("sug_b", "r1")
    s["status"] = "accepted"
    s["appliedAt"] = 100
    suggestions.append("r1", s)
    suggestions.set_status("r1", "sug_b", "pending", now_ms=lambda: 200)
    out = suggestions.list_for_resume("r1")
    assert out[0]["status"] == "pending"
    assert out[0].get("appliedAt") is None
    assert out[0].get("rejectedAt") is None
    assert out[0].get("supersededAt") is None


def test_status_idempotent_returns_no_op_on_repeat(tmp_resume_dir):
    s = _make_update("sug_c", "r1")
    suggestions.append("r1", s)
    r1 = suggestions.set_status("r1", "sug_c", "accepted", now_ms=lambda: 1)
    r2 = suggestions.set_status("r1", "sug_c", "accepted", now_ms=lambda: 2)
    assert r1["ok"] is True
    assert r2["ok"] is True and r2.get("noop") is True
    out = suggestions.list_for_resume("r1")
    assert out[0]["appliedAt"] == 1  # not re-set


def test_status_conflict_returns_ok_false_with_current(tmp_resume_dir):
    """v0 resilience: client respects current state, never overrides."""
    s = _make_update("sug_d", "r1")
    suggestions.append("r1", s)
    suggestions.set_status("r1", "sug_d", "rejected", now_ms=lambda: 1)
    res = suggestions.set_status("r1", "sug_d", "accepted", now_ms=lambda: 2)
    assert res == {"ok": False, "current": "rejected"}


def test_gc_purges_terminal_records_older_than_24h(tmp_resume_dir):
    old = _make_update("sug_old", "r1")
    old["status"] = "rejected"
    old["rejectedAt"] = 1_000_000  # ancient
    fresh = _make_update("sug_fresh", "r1")
    fresh["status"] = "rejected"
    fresh["rejectedAt"] = 999_000_000_000  # recent
    suggestions.append("r1", old)
    suggestions.append("r1", fresh)
    suggestions.gc("r1", now_ms=lambda: 1_000_000_000_000)  # well past 24h after `old`
    out = suggestions.list_for_resume("r1")
    assert {x["id"] for x in out} == {"sug_fresh"}


def test_streaming_orphan_purged_after_5_minutes(tmp_resume_dir):
    s = _make_update("sug_stream", "r1")
    s["status"] = "streaming"
    s["createdAt"] = 1_000_000  # ancient
    suggestions.append("r1", s)
    suggestions.gc("r1", now_ms=lambda: 1_000_000_000_000)
    assert suggestions.list_for_resume("r1") == []


# ---- helpers ----

def _make_update(sid: str, rid: str) -> UpdateSuggestion:
    return {
        "id": sid, "runId": "run", "agentId": "PolishAgent", "resumeId": rid,
        "status": "pending", "createdAt": 1, "source": {"kind": "agent", "agentId": "PolishAgent", "runId": "run"},
        "op": "update",
        "field": {"kind": "entry.title", "id": "e1"},
        "before": "old", "after": "new",
    }
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/test_suggestions.py -v 2>&1 | tail -20
```
Expected: collection error or `ModuleNotFoundError: services.ai.suggestions`.

- [ ] **Step 3: Implement `services/ai/types.py`**

`services/ai/types.py`:

```python
"""Suggestion + run-state TypedDicts mirroring spec § 5.1.

Discriminated union on `op` field. `before`/`after` payload differs per op so
concurrency checks have what they need (parent's children-id list for
insert/delete/move, not just the affected block).
"""
from __future__ import annotations
from typing import Literal, TypedDict, Union, Optional

# ----- Block / Field -------------------------------------------------------

BlockId = str
TipTapDoc = dict  # passthrough; v2 uses ProseMirror-shape JSON


class FieldHeaderName(TypedDict):
    kind: Literal["header.name"]


class FieldHeaderContact(TypedDict):
    kind: Literal["header.contact"]
    index: int


class FieldSectionHeading(TypedDict):
    kind: Literal["section.heading"]
    id: BlockId


class FieldEntryTitle(TypedDict):
    kind: Literal["entry.title"]
    id: BlockId


class FieldEntryMeta(TypedDict):
    kind: Literal["entry.meta"]
    id: BlockId


class FieldBulletContent(TypedDict):
    kind: Literal["bullet.content"]
    id: BlockId


EditableField = Union[
    FieldHeaderName, FieldHeaderContact, FieldSectionHeading,
    FieldEntryTitle, FieldEntryMeta, FieldBulletContent,
]

# bullet content is TipTapDoc; everything else is plain string
BlockContent = Union[TipTapDoc, str]


class BulletSnapshot(TypedDict):
    kind: Literal["bullet"]
    id: BlockId
    content: TipTapDoc


class EntrySnapshot(TypedDict):
    kind: Literal["entry"]
    id: BlockId
    title: str
    meta: str
    bullets: list  # list[BulletSnapshot]


class SectionSnapshot(TypedDict):
    kind: Literal["section"]
    id: BlockId
    heading: str
    role: str
    entries: list  # list[EntrySnapshot]


BlockSnapshot = Union[BulletSnapshot, EntrySnapshot, SectionSnapshot]

# ----- Suggestion variants -------------------------------------------------

SuggestionStatus = Literal[
    "streaming", "pending", "accepted", "rejected", "superseded",
]


class _SuggestionBase(TypedDict, total=False):
    id: str
    runId: str
    agentId: str
    resumeId: str
    status: SuggestionStatus
    createdAt: int
    appliedAt: Optional[int]
    rejectedAt: Optional[int]
    supersededAt: Optional[int]
    source: dict


class UpdateSuggestion(_SuggestionBase):
    op: Literal["update"]
    field: EditableField
    before: BlockContent
    after: BlockContent


class InsertSuggestion(_SuggestionBase):
    op: Literal["insert"]
    parentId: BlockId
    atIndex: int
    beforeChildIds: list  # list[BlockId]
    insertedBlock: BlockSnapshot


class DeleteSuggestion(_SuggestionBase):
    op: Literal["delete"]
    parentId: BlockId
    blockId: BlockId
    beforeChildIds: list
    deletedBlock: BlockSnapshot


class MoveSuggestion(_SuggestionBase):
    op: Literal["move"]
    blockId: BlockId
    fromParentId: BlockId
    fromIndex: int
    fromBeforeChildIds: list
    toParentId: BlockId
    toIndex: int
    toBeforeChildIds: list


Suggestion = Union[UpdateSuggestion, InsertSuggestion, DeleteSuggestion, MoveSuggestion]
```

- [ ] **Step 4: Implement `services/ai/__init__.py`**

`services/ai/__init__.py`:
```python
"""AI integration services for v2 resume editor (LangGraph + tool-call agents)."""
```

- [ ] **Step 5: Implement `services/ai/suggestions.py`**

`services/ai/suggestions.py`:

```python
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
```

- [ ] **Step 6: Add `tests/services/__init__.py` + `tests/services/ai/__init__.py`** (empty files so pytest discovers as packages)

```bash
cd /Users/fred/Desktop/CareerOps-Pro
mkdir -p tests/services/ai
touch tests/services/__init__.py tests/services/ai/__init__.py
```

- [ ] **Step 7: Run tests until green**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/test_suggestions.py -v 2>&1 | tail -10
```
Expected: `7 passed`.

- [ ] **Step 8: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add services/ai/__init__.py services/ai/types.py services/ai/suggestions.py tests/services/__init__.py tests/services/ai/__init__.py tests/services/ai/test_suggestions.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: suggestion types + sidecar storage with timestamp side effects"
```

---

## Task 2: Backend — `api/routes/jobs.py`

**Files:**
- Create: `api/routes/jobs.py`
- Create: `tests/api/__init__.py` (if missing)
- Create: `tests/api/test_jobs_routes.py`
- Modify: `api/main.py` — register router

- [ ] **Step 1: Write failing test**

`tests/api/test_jobs_routes.py`:

```python
"""GET /api/jobs/ + GET /api/jobs/{id} — wraps services/job_tracker.py reads.

Spec § 3.4. Read-only routes — single-user app, no auth changes.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Point job_tracker at a temp tracker file with stub data."""
    tracker_file = tmp_path / "job_tracker.json"
    tracker_file.write_text(json.dumps({
        "version": 1,
        "jobs": [
            {"id": "trk_1", "company": "Acme",   "title": "Eng",   "status": "applied",   "date_applied": "2026-04-01"},
            {"id": "trk_2", "company": "Globex", "title": "PM",    "status": "interview", "date_applied": "2026-04-10"},
            {"id": "trk_3", "company": "Initech","title": "TPM",   "status": "applied",   "date_applied": "2026-03-15"},
        ],
    }, indent=2))
    from services import job_tracker
    monkeypatch.setattr(job_tracker, "TRACKER_FILE", tracker_file)
    from api.main import app
    return TestClient(app)


def test_list_jobs_returns_all(client):
    r = client.get("/api/jobs/")
    assert r.status_code == 200
    body = r.json()
    assert {j["id"] for j in body["jobs"]} == {"trk_1", "trk_2", "trk_3"}


def test_list_jobs_filter_by_status(client):
    r = client.get("/api/jobs/?status=applied")
    assert r.status_code == 200
    assert {j["id"] for j in r.json()["jobs"]} == {"trk_1", "trk_3"}


def test_list_jobs_limit(client):
    r = client.get("/api/jobs/?limit=2")
    assert r.status_code == 200
    assert len(r.json()["jobs"]) == 2


def test_get_job_by_id_returns_one(client):
    r = client.get("/api/jobs/trk_2")
    assert r.status_code == 200
    assert r.json()["job"]["company"] == "Globex"


def test_get_job_404_when_missing(client):
    r = client.get("/api/jobs/nope")
    assert r.status_code == 404
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && mkdir -p tests/api && touch tests/api/__init__.py
pytest tests/api/test_jobs_routes.py -v 2>&1 | tail -10
```
Expected: 404 on every route (router not registered) or import error.

- [ ] **Step 3: Confirm `services/job_tracker.py` exposes `TRACKER_FILE`**

```bash
grep -n "^TRACKER_FILE\|^_TRACKER_FILE\|tracker.*Path\|JOB_TRACKER" /Users/fred/Desktop/CareerOps-Pro/services/job_tracker.py | head -5
```

If the constant is named differently, update test fixture monkeypatch target accordingly. (If there is no module-level path constant, add one as part of Step 4 — minimal additive change to the existing service module.)

- [ ] **Step 4: Implement `api/routes/jobs.py`**

`api/routes/jobs.py`:

```python
"""GET /api/jobs/  +  GET /api/jobs/{job_id} — read-only wrappers over
services/job_tracker.py. Single-user app, no auth changes.

Spec § 3.4 — these power the AI Coordinator's read tools (`get_application_history`,
`get_application_by_id`).
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from services import job_tracker

router = APIRouter()


@router.get("/")
def list_jobs(
    status: Optional[str] = Query(None, description="Filter to a single status."),
    company: Optional[str] = Query(None, description="Substring match on company name."),
    since: Optional[str] = Query(None, description="ISO date YYYY-MM-DD; jobs applied on/after."),
    limit: int = Query(50, ge=1, le=500),
):
    data = job_tracker.load_tracker()
    items = data.get("jobs", [])
    if status:
        items = [j for j in items if j.get("status") == status]
    if company:
        c = company.lower()
        items = [j for j in items if c in (j.get("company") or "").lower()]
    if since:
        items = [j for j in items if (j.get("date_applied") or "") >= since]
    return {"jobs": items[:limit], "total_unfiltered": len(data.get("jobs", []))}


@router.get("/{job_id}")
def get_job(job_id: str):
    data = job_tracker.load_tracker()
    for j in data.get("jobs", []):
        if j.get("id") == job_id:
            return {"job": j}
    raise HTTPException(status_code=404, detail=f"job {job_id} not found")
```

If `services/job_tracker.py` does not have a module-level `TRACKER_FILE` constant, add one (it currently uses a path-builder function `_tracker_file()` per the earlier grep). Inspect:

```bash
grep -n "_tracker_file\|tracker_file\|JOB_TRACKER" /Users/fred/Desktop/CareerOps-Pro/services/job_tracker.py | head
```

If absent, add at the top of `services/job_tracker.py` (additive, no behavior change):

```python
# At top of services/job_tracker.py, replace any internal path computation with:
from pathlib import Path
TRACKER_FILE = Path(__file__).resolve().parents[1] / "saved_sessions" / "job_tracker.json"
# ... and update load_tracker() / save_tracker() to use TRACKER_FILE.
```

(If the file already has its own scheme, instead match it in the test fixture by monkeypatching the actual symbol used — adjust the test from Step 1 once.)

- [ ] **Step 5: Register router in `api/main.py`**

`api/main.py` — add import and include_router after the existing routers:

```python
from api.routes.jobs import router as jobs_router
# ...
app.include_router(jobs_router, prefix="/api/jobs", tags=["jobs"])
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/api/test_jobs_routes.py -v 2>&1 | tail -10
```
Expected: `5 passed`.

- [ ] **Step 7: Verify existing routes still mount**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/ -v --co 2>&1 | tail -10
```
Expected: collection succeeds (no import errors anywhere).

- [ ] **Step 8: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add api/routes/jobs.py api/main.py tests/api/__init__.py tests/api/test_jobs_routes.py services/job_tracker.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: GET /api/jobs/ + /{id} wrapping job_tracker reads"
```

---

## Task 3: Backend — Read tools

**Files:**
- Create: `services/ai/tools/__init__.py`
- Create: `services/ai/tools/read_tools.py`
- Create: `tests/services/ai/test_read_tools.py`

The 6 read tools are pure functions over the canonical resume + job tracker data. They return plain dicts the LangGraph agents serialize into LLM tool responses.

- [ ] **Step 1: Write failing test**

`tests/services/ai/test_read_tools.py`:

```python
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
```

- [ ] **Step 2: Run failing test**

```bash
pytest tests/services/ai/test_read_tools.py -v 2>&1 | tail -10
```
Expected: `ModuleNotFoundError: services.ai.tools.read_tools`.

- [ ] **Step 3: Implement `services/ai/tools/__init__.py`**

`services/ai/tools/__init__.py`:
```python
"""Read + write tools exposed to LangGraph agents."""
```

- [ ] **Step 4: Implement `services/ai/tools/read_tools.py`**

`services/ai/tools/read_tools.py`:

```python
"""6 read tools (pure, no side effect) wired into Coordinator's tool palette.

Spec § 3.1. Backed by:
  - `saved_sessions/resumes/{id}.json` (existing resume sidecar)
  - `services/job_tracker.py` (existing job applications store)
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Optional

from services import job_tracker

RESUMES_DIR = Path(__file__).resolve().parents[3] / "saved_sessions" / "resumes"


def _load_resume(resume_id: str) -> Optional[dict]:
    p = RESUMES_DIR / f"{resume_id}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text())


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
    out = []
    if not RESUMES_DIR.exists():
        return out
    for p in sorted(RESUMES_DIR.glob("*.json")):
        if p.name.endswith(".suggestions.json"):
            continue  # skip our sidecar
        try:
            r = json.loads(p.read_text())
        except Exception:
            continue
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
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/test_read_tools.py -v 2>&1 | tail -10
```
Expected: `6 passed`.

- [ ] **Step 6: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add services/ai/tools/__init__.py services/ai/tools/read_tools.py tests/services/ai/test_read_tools.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: 6 read tools (resume + job application access)"
```

---

## Task 4: Backend — Write tools (emit Suggestions, no mutation)

**Files:**
- Create: `services/ai/tools/write_tools.py`
- Create: `tests/services/ai/test_write_tools.py`

10 write tools per spec § 3.3. Each:
1. Validates the target exists in current resume.
2. Captures `before` / `beforeChildIds` from current resume state at emit time.
3. Mints stable UUIDs for any new blocks (`insert_*`).
4. Persists a `Suggestion` record via `services.ai.suggestions.append`.
5. Returns the suggestion id (so the agent can reference it in narration).

NEVER mutates the resume. NEVER calls store actions. The frontend apply layer (Task 16) is responsible for applying.

- [ ] **Step 1: Write failing test**

`tests/services/ai/test_write_tools.py`:

```python
"""Write tools emit Suggestion records but never mutate resume.

Spec § 3.3 + § 5.1. Verify each tool produces a correctly-shaped record with
emit-time `before` / `beforeChildIds` snapshots and stable UUIDs for inserts.
"""
import json
import pytest

from services.ai.tools import write_tools
from services.ai import suggestions


@pytest.fixture
def setup(tmp_path, monkeypatch):
    resume = {
        "id": "r1", "schema_version": 2, "title": "T",
        "header": {"id": "h", "name": "Fred", "contact_lines": []},
        "sections": [
            {"id": "s1", "role": "experience", "heading": "Experience", "entries": [
                {"id": "e1", "title": "T1", "meta": "M1", "bullets": [
                    {"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
                    {"id": "b2", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
                ]},
            ]},
        ],
        "metadata": {"created_at": "", "updated_at": "", "target_company": None,
                     "target_role": None, "parent_id": None},
    }
    (tmp_path / "r1.json").write_text(json.dumps(resume))
    monkeypatch.setattr(write_tools, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    return tmp_path


def _ctx():
    return {"resumeId": "r1", "agentId": "PolishAgent", "runId": "run_1"}


def test_update_bullet_emits_update_suggestion_with_before(setup):
    new_doc = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x"}]}]}
    sid = write_tools.update_bullet("b1", new_doc, ctx=_ctx())
    items = suggestions.list_for_resume("r1")
    [s] = items
    assert s["id"] == sid and s["op"] == "update"
    assert s["field"] == {"kind": "bullet.content", "id": "b1"}
    assert s["before"] == {"type": "doc", "content": [{"type": "paragraph"}]}
    assert s["after"] == new_doc


def test_update_entry_title_captures_string_before(setup):
    write_tools.update_entry_title("e1", "New Title", ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "update" and s["field"]["kind"] == "entry.title"
    assert s["before"] == "T1" and s["after"] == "New Title"


def test_update_section_heading_captures_before(setup):
    write_tools.update_section_heading("s1", "EXP", ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["before"] == "Experience" and s["after"] == "EXP"


def test_update_header_name_no_blockId_arg(setup):
    write_tools.update_header_name("Frederick", ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["field"] == {"kind": "header.name"}
    assert s["before"] == "Fred" and s["after"] == "Frederick"


def test_insert_bullet_mints_uuid_and_captures_beforeChildIds(setup):
    new_content = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "n"}]}]}
    write_tools.insert_bullet("e1", at_index=1, content=new_content, ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "insert"
    assert s["parentId"] == "e1" and s["atIndex"] == 1
    assert s["beforeChildIds"] == ["b1", "b2"]
    assert s["insertedBlock"]["kind"] == "bullet"
    assert isinstance(s["insertedBlock"]["id"], str) and len(s["insertedBlock"]["id"]) >= 16
    assert s["insertedBlock"]["content"] == new_content


def test_insert_entry_mints_ids_for_entry_and_each_bullet(setup):
    payload = {
        "title": "New Entry", "meta": "2026",
        "bullets": [
            {"type": "doc", "content": [{"type": "paragraph"}]},
            {"type": "doc", "content": [{"type": "paragraph"}]},
        ],
    }
    write_tools.insert_entry("s1", at_index=1, payload=payload, ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "insert"
    assert s["beforeChildIds"] == ["e1"]
    ib = s["insertedBlock"]
    assert ib["kind"] == "entry" and len(ib["bullets"]) == 2
    assert all(isinstance(b["id"], str) and len(b["id"]) >= 16 for b in ib["bullets"])
    assert len({ib["id"], *(b["id"] for b in ib["bullets"])}) == 3  # all distinct ids


def test_delete_bullet_captures_deleted_block(setup):
    write_tools.delete_bullet("b1", ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "delete" and s["blockId"] == "b1"
    assert s["parentId"] == "e1"
    assert s["beforeChildIds"] == ["b1", "b2"]
    assert s["deletedBlock"]["id"] == "b1" and s["deletedBlock"]["kind"] == "bullet"


def test_move_bullet_captures_both_parent_snapshots(setup, monkeypatch):
    # Add a second entry so we have a real cross-entry move target.
    p = setup / "r1.json"
    r = json.loads(p.read_text())
    r["sections"][0]["entries"].append({"id": "e2", "title": "T2", "meta": "M2",
                                        "bullets": [{"id": "b3", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]})
    p.write_text(json.dumps(r))
    write_tools.move_bullet("b1", to_parent_id="e2", to_index=0, ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "move" and s["blockId"] == "b1"
    assert s["fromParentId"] == "e1" and s["fromBeforeChildIds"] == ["b1", "b2"]
    assert s["toParentId"] == "e2" and s["toBeforeChildIds"] == ["b3"]


def test_unknown_target_raises_tool_error(setup):
    with pytest.raises(write_tools.ToolError):
        write_tools.update_bullet("nope", {"type": "doc", "content": []}, ctx=_ctx())


def test_status_starts_streaming(setup):
    """Per spec § 4.4 / Q10: agent's tool calls fire as `streaming` until run completes."""
    write_tools.update_entry_title("e1", "X", ctx=_ctx())
    [s] = suggestions.list_for_resume("r1")
    assert s["status"] == "streaming"
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/test_write_tools.py -v 2>&1 | tail -10
```
Expected: import error.

- [ ] **Step 3: Implement `services/ai/tools/write_tools.py`**

`services/ai/tools/write_tools.py`:

```python
"""Write tools — emit Suggestion records, NEVER mutate the resume.

Spec § 3.3. Each tool:
  1. Loads current resume from disk (fresh read).
  2. Validates target exists; raises ToolError if not.
  3. Captures `before` / `beforeChildIds` from current state.
  4. Mints stable UUIDs for inserts (entry id + per-bullet id).
  5. Persists Suggestion via `services.ai.suggestions.append`.
  6. Returns the suggestion id.

`ctx` is `{resumeId, agentId, runId}` injected by the orchestrator.
"""
from __future__ import annotations
import json
import time
import uuid
from pathlib import Path
from typing import Optional

from services.ai import suggestions
from services.ai.types import (
    Suggestion, UpdateSuggestion, InsertSuggestion,
    DeleteSuggestion, MoveSuggestion, EditableField,
)

RESUMES_DIR = Path(__file__).resolve().parents[3] / "saved_sessions" / "resumes"


class ToolError(Exception):
    """Raised when a tool call references a non-existent block or violates scope.
    Surfaced to the LLM as a tool-call error so the agent can recover or skip."""


def _load(resume_id: str) -> dict:
    p = RESUMES_DIR / f"{resume_id}.json"
    if not p.exists():
        raise ToolError(f"resume {resume_id} not found")
    return json.loads(p.read_text())


def _new_sid() -> str:
    return f"sug_{uuid.uuid4().hex[:12]}"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _base(ctx: dict) -> dict:
    sid = _new_sid()
    return {
        "id": sid,
        "runId": ctx["runId"],
        "agentId": ctx["agentId"],
        "resumeId": ctx["resumeId"],
        "status": "streaming",
        "createdAt": _now_ms(),
        "source": {"kind": "agent", "agentId": ctx["agentId"], "runId": ctx["runId"]},
    }


def _find_block(resume: dict, block_id: str):
    """Returns (block, parent_block_or_None, parent_kind, parent_children_list)
    where parent_children_list is the live list reference (for beforeChildIds).
    None if not found."""
    if resume["header"]["id"] == block_id:
        return resume["header"], None, "header", None
    for s in resume["sections"]:
        if s["id"] == block_id:
            return s, resume, "doc", resume["sections"]
        for e in s["entries"]:
            if e["id"] == block_id:
                return e, s, "section", s["entries"]
            for b in e["bullets"]:
                if b["id"] == block_id:
                    return b, e, "entry", e["bullets"]
    return None


def _entry_of_bullet(resume: dict, bullet_id: str):
    for s in resume["sections"]:
        for e in s["entries"]:
            for b in e["bullets"]:
                if b["id"] == bullet_id:
                    return e
    return None


def _section_of_entry(resume: dict, entry_id: str):
    for s in resume["sections"]:
        for e in s["entries"]:
            if e["id"] == entry_id:
                return s
    return None


# ---- update_* ------------------------------------------------------------

def update_bullet(block_id: str, content: dict, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, block_id)
    if not found or found[2] != "entry":
        raise ToolError(f"bullet {block_id} not found")
    bullet = found[0]
    s: UpdateSuggestion = {
        **_base(ctx),
        "op": "update",
        "field": {"kind": "bullet.content", "id": block_id},
        "before": bullet["content"],
        "after": content,
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


def _update_string_field(field: EditableField, value: str, before: str, ctx: dict) -> str:
    s: UpdateSuggestion = {
        **_base(ctx),
        "op": "update",
        "field": field,
        "before": before,
        "after": value,
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


def update_entry_title(entry_id: str, value: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, entry_id)
    if not found or found[2] != "section":
        raise ToolError(f"entry {entry_id} not found")
    return _update_string_field({"kind": "entry.title", "id": entry_id},
                                 value, found[0].get("title", ""), ctx)


def update_entry_meta(entry_id: str, value: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, entry_id)
    if not found or found[2] != "section":
        raise ToolError(f"entry {entry_id} not found")
    return _update_string_field({"kind": "entry.meta", "id": entry_id},
                                 value, found[0].get("meta", ""), ctx)


def update_section_heading(section_id: str, value: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, section_id)
    if not found or found[2] != "doc":
        raise ToolError(f"section {section_id} not found")
    return _update_string_field({"kind": "section.heading", "id": section_id},
                                 value, found[0].get("heading", ""), ctx)


def update_header_name(value: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    return _update_string_field({"kind": "header.name"},
                                 value, r["header"].get("name", ""), ctx)


# ---- insert_* ------------------------------------------------------------

def insert_bullet(parent_entry_id: str, at_index: int, content: dict, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, parent_entry_id)
    if not found or found[2] != "section":
        raise ToolError(f"entry {parent_entry_id} not found")
    entry = found[0]
    new_id = uuid.uuid4().hex
    s: InsertSuggestion = {
        **_base(ctx),
        "op": "insert",
        "parentId": parent_entry_id,
        "atIndex": at_index,
        "beforeChildIds": [b["id"] for b in entry["bullets"]],
        "insertedBlock": {"kind": "bullet", "id": new_id, "content": content},
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


def insert_entry(section_id: str, at_index: int, payload: dict, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, section_id)
    if not found or found[2] != "doc":
        raise ToolError(f"section {section_id} not found")
    section = found[0]
    if not payload.get("bullets"):
        raise ToolError("insert_entry payload.bullets must contain ≥1 entry")
    entry_id = uuid.uuid4().hex
    bullets = [
        {"kind": "bullet", "id": uuid.uuid4().hex, "content": c}
        for c in payload["bullets"]
    ]
    s: InsertSuggestion = {
        **_base(ctx),
        "op": "insert",
        "parentId": section_id,
        "atIndex": at_index,
        "beforeChildIds": [e["id"] for e in section["entries"]],
        "insertedBlock": {
            "kind": "entry", "id": entry_id,
            "title": payload.get("title", ""),
            "meta": payload.get("meta", ""),
            "bullets": bullets,
        },
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


# ---- delete_* ------------------------------------------------------------

def delete_bullet(block_id: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, block_id)
    if not found or found[2] != "entry":
        raise ToolError(f"bullet {block_id} not found")
    bullet, entry = found[0], found[1]
    s: DeleteSuggestion = {
        **_base(ctx),
        "op": "delete",
        "parentId": entry["id"],
        "blockId": block_id,
        "beforeChildIds": [b["id"] for b in entry["bullets"]],
        "deletedBlock": {"kind": "bullet", "id": block_id, "content": bullet["content"]},
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


def delete_entry(entry_id: str, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    found = _find_block(r, entry_id)
    if not found or found[2] != "section":
        raise ToolError(f"entry {entry_id} not found")
    entry, section = found[0], found[1]
    s: DeleteSuggestion = {
        **_base(ctx),
        "op": "delete",
        "parentId": section["id"],
        "blockId": entry_id,
        "beforeChildIds": [e["id"] for e in section["entries"]],
        "deletedBlock": {
            "kind": "entry", "id": entry_id,
            "title": entry.get("title", ""),
            "meta": entry.get("meta", ""),
            "bullets": [{"kind": "bullet", "id": b["id"], "content": b["content"]} for b in entry["bullets"]],
        },
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


# delete_section is part of the spec's write tool table for ExperienceAgent
# scope but not exercised by v0 ACs. Keep the helper here for future use.


# ---- move_* --------------------------------------------------------------

def move_bullet(block_id: str, to_parent_id: str, to_index: int, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    src = _find_block(r, block_id)
    if not src or src[2] != "entry":
        raise ToolError(f"bullet {block_id} not found")
    src_entry = src[1]
    src_index = next(i for i, b in enumerate(src_entry["bullets"]) if b["id"] == block_id)
    dst = _find_block(r, to_parent_id)
    if not dst or dst[2] != "section":
        raise ToolError(f"target entry {to_parent_id} not found")
    dst_entry = dst[0]
    s: MoveSuggestion = {
        **_base(ctx),
        "op": "move",
        "blockId": block_id,
        "fromParentId": src_entry["id"],
        "fromIndex": src_index,
        "fromBeforeChildIds": [b["id"] for b in src_entry["bullets"]],
        "toParentId": to_parent_id,
        "toIndex": to_index,
        "toBeforeChildIds": [b["id"] for b in dst_entry["bullets"]],
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]


def move_entry(entry_id: str, to_section_id: str, to_index: int, *, ctx: dict) -> str:
    r = _load(ctx["resumeId"])
    src = _find_block(r, entry_id)
    if not src or src[2] != "section":
        raise ToolError(f"entry {entry_id} not found")
    src_section = src[1]
    src_index = next(i for i, e in enumerate(src_section["entries"]) if e["id"] == entry_id)
    dst = _find_block(r, to_section_id)
    if not dst or dst[2] != "doc":
        raise ToolError(f"target section {to_section_id} not found")
    dst_section = dst[0]
    s: MoveSuggestion = {
        **_base(ctx),
        "op": "move",
        "blockId": entry_id,
        "fromParentId": src_section["id"],
        "fromIndex": src_index,
        "fromBeforeChildIds": [e["id"] for e in src_section["entries"]],
        "toParentId": to_section_id,
        "toIndex": to_index,
        "toBeforeChildIds": [e["id"] for e in dst_section["entries"]],
    }
    suggestions.append(ctx["resumeId"], s)
    return s["id"]
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/test_write_tools.py -v 2>&1 | tail -15
```
Expected: `10 passed`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add services/ai/tools/write_tools.py tests/services/ai/test_write_tools.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: 10 write tools emit Suggestions (no mutation; emit-time before snapshots)"
```

---

## Task 5: Backend — Context builder (skeleton + section + focus)

**Files:**
- Create: `services/ai/context.py`
- Create: `tests/services/ai/test_context.py`

The orchestrator builds per-agent context payloads from the `contextContract` declared by each agent (spec § 4.2). Three building blocks:

- `build_skeleton(resume)` — id + heading + per-section entry titles + bullet counts. ~200 tokens.
- `build_section_detail(resume, roles)` — full nested entries+bullets for sections matching `roles`; skeleton for others.
- `build_focus_block(resume, block_id)` — single block (with kind tag) for PolishAgent.

- [ ] **Step 1: Write failing test**

`tests/services/ai/test_context.py`:

```python
"""Context payload builders matching per-agent contextContract (spec § 4.2)."""
import pytest

from services.ai import context


@pytest.fixture
def resume():
    return {
        "id": "r1", "schema_version": 2, "title": "Test",
        "header": {"id": "h", "name": "Fred", "contact_lines": []},
        "sections": [
            {"id": "s1", "role": "experience", "heading": "Experience", "entries": [
                {"id": "e1", "title": "Eng @ Acme", "meta": "2024-now",
                 "bullets": [
                     {"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
                     {"id": "b2", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
                 ]},
                {"id": "e2", "title": "TPM @ Globex", "meta": "2022-2024",
                 "bullets": [{"id": "b3", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]},
            ]},
            {"id": "s2", "role": "skills", "heading": "Skills", "entries": [
                {"id": "e_sk1", "title": "Languages", "meta": "",
                 "bullets": [{"id": "b_sk1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]},
            ]},
        ],
        "metadata": {"updated_at": "", "created_at": "", "target_company": None,
                     "target_role": None, "parent_id": None},
    }


def test_skeleton_minimal_shape(resume):
    sk = context.build_skeleton(resume)
    assert sk["header"]["id"] == "h" and sk["header"]["name"] == "Fred"
    s1 = sk["sections"][0]
    assert s1["id"] == "s1" and s1["role"] == "experience"
    assert s1["entries"][0] == {"id": "e1", "title_excerpt": "Eng @ Acme", "bullet_count": 2}
    s2 = sk["sections"][1]
    assert s2 == {"id": "s2", "heading": "Skills", "role": "skills", "entry_count": 1}


def test_section_detail_nests_named_roles(resume):
    out = context.build_section_detail(resume, roles=["experience"])
    s1 = next(s for s in out["sections"] if s["id"] == "s1")
    assert s1["entries"][0]["bullets"][0]["id"] == "b1"  # full nesting
    s2 = next(s for s in out["sections"] if s["id"] == "s2")
    assert "entry_count" in s2 and "entries" not in s2  # skills stays skeleton


def test_focus_block_returns_block_with_kind(resume):
    out = context.build_focus_block(resume, "b1")
    assert out["kind"] == "bullet" and out["id"] == "b1"
    out = context.build_focus_block(resume, "e2")
    assert out["kind"] == "entry" and out["title"] == "TPM @ Globex"
    out = context.build_focus_block(resume, "missing")
    assert out is None
```

- [ ] **Step 2: Run failing test**

```bash
pytest tests/services/ai/test_context.py -v 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `services/ai/context.py`**

```python
"""Context payload builders for per-agent contextContract (spec § 4.2).

build_skeleton(resume)        -> light structural view (~200 tokens for 1-page)
build_section_detail(resume, roles) -> full nesting for matching roles, skeleton for others
build_focus_block(resume, id) -> single block tagged with `kind`
"""
from __future__ import annotations
from typing import Optional


def _section_skeleton(s: dict) -> dict:
    if s.get("role") == "experience":
        # experience defaults to richer skeleton — entry titles always carry useful signal
        return {
            "id": s["id"], "heading": s["heading"], "role": s["role"],
            "entries": [
                {"id": e["id"], "title_excerpt": e.get("title", ""), "bullet_count": len(e.get("bullets", []))}
                for e in s.get("entries", [])
            ],
        }
    # other sections: just count entries
    return {
        "id": s["id"], "heading": s["heading"], "role": s.get("role", ""),
        "entry_count": len(s.get("entries", [])),
    }


def build_skeleton(resume: dict) -> dict:
    return {
        "header": {"id": resume["header"]["id"], "name": resume["header"].get("name", "")},
        "sections": [_section_skeleton(s) for s in resume.get("sections", [])],
    }


def build_section_detail(resume: dict, roles: list) -> dict:
    role_set = set(roles or [])
    out_sections = []
    for s in resume.get("sections", []):
        if s.get("role") in role_set:
            # full nesting
            out_sections.append({
                "id": s["id"], "heading": s["heading"], "role": s.get("role", ""),
                "entries": [
                    {
                        "id": e["id"],
                        "title": e.get("title", ""),
                        "meta": e.get("meta", ""),
                        "bullets": [
                            {"id": b["id"], "content": b["content"]} for b in e.get("bullets", [])
                        ],
                    }
                    for e in s.get("entries", [])
                ],
            })
        else:
            out_sections.append(_section_skeleton(s))
    return {
        "header": {"id": resume["header"]["id"], "name": resume["header"].get("name", "")},
        "sections": out_sections,
    }


def build_focus_block(resume: dict, block_id: str) -> Optional[dict]:
    if resume["header"]["id"] == block_id:
        return {**resume["header"], "kind": "header"}
    for s in resume.get("sections", []):
        if s["id"] == block_id:
            return {**s, "kind": "section"}
        for e in s.get("entries", []):
            if e["id"] == block_id:
                return {**e, "kind": "entry"}
            for b in e.get("bullets", []):
                if b["id"] == block_id:
                    return {**b, "kind": "bullet"}
    return None
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/test_context.py -v 2>&1 | tail
```
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add services/ai/context.py tests/services/ai/test_context.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: context builders (skeleton / section detail / focus block)"
```

---

## Task 6: Backend — LLM wrapper (Anthropic + tool-call interface)

**Files:**
- Create: `services/ai/llm.py`
- Create: `tests/services/ai/test_llm.py`

Thin wrapper around `langchain-anthropic` exposing a single `invoke(messages, tools)` method that returns either a text reply or a list of tool calls. The wrapper isolates the rest of the codebase from langchain version drift and gives us a clean seam for stubbing in tests.

- [ ] **Step 1: Write failing test (uses a stub model — never hits the real API)**

`tests/services/ai/test_llm.py`:

```python
"""LLM wrapper — verifies request shape + tool-call parsing.

Uses a stub `BaseChatModel` to avoid hitting Anthropic in unit tests. Real-
provider integration is exercised in tests/services/ai/test_orchestrator.py
behind a `requires_anthropic_api_key` marker.
"""
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from services.ai import llm


class _StubModel:
    """Mimics the bound-model returned by langchain-anthropic .bind_tools()."""

    def __init__(self, response: AIMessage):
        self.response = response
        self.captured_messages = None
        self.captured_tools = None

    def bind_tools(self, tools):
        self.captured_tools = tools
        return self

    def invoke(self, messages):
        self.captured_messages = messages
        return self.response


def test_invoke_returns_text_reply_when_no_tool_calls():
    stub = _StubModel(AIMessage(content="hello there"))
    client = llm.LLMClient(model=stub)
    out = client.invoke(
        system="you are a coordinator",
        messages=[{"role": "user", "content": "hi"}],
        tools=[],
    )
    assert out == {"text": "hello there", "tool_calls": []}


def test_invoke_returns_tool_calls_when_present():
    stub = _StubModel(AIMessage(
        content="",
        tool_calls=[
            {"id": "tc1", "name": "update_bullet",
             "args": {"block_id": "b1", "content": {"type": "doc", "content": []}}},
        ],
    ))
    client = llm.LLMClient(model=stub)
    out = client.invoke(system="x", messages=[], tools=[{"name": "update_bullet", "description": "...", "schema": {}}])
    assert out["text"] == ""
    assert out["tool_calls"][0]["name"] == "update_bullet"
    assert out["tool_calls"][0]["args"]["block_id"] == "b1"


def test_invoke_passes_system_as_first_message():
    stub = _StubModel(AIMessage(content="ok"))
    client = llm.LLMClient(model=stub)
    client.invoke(system="SYS", messages=[{"role": "user", "content": "hi"}], tools=[])
    assert isinstance(stub.captured_messages[0], SystemMessage)
    assert stub.captured_messages[0].content == "SYS"
    assert isinstance(stub.captured_messages[1], HumanMessage)
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/test_llm.py -v 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `services/ai/llm.py`**

```python
"""Thin wrapper around langchain-anthropic. Single-provider in v0 (Anthropic
Claude — chosen for tool-call stability per spec § 14 open question)."""
from __future__ import annotations
import os
from typing import Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage


def _build_anthropic_model(model_name: str = "claude-sonnet-4-5"):
    """Lazy import so unit tests using stub models don't pull network deps."""
    from langchain_anthropic import ChatAnthropic
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set. v0 requires it (single-provider — see "
            "spec § 14 / Task 0). Populate `.env` and restart the API server."
        )
    return ChatAnthropic(model=model_name, api_key=api_key, temperature=0)


class LLMClient:
    """Provider-agnostic invocation surface. v0 ships Anthropic only.

    `invoke(system, messages, tools)` returns:
      {"text": str, "tool_calls": [{"id", "name", "args"}]}
    """

    def __init__(self, model=None, model_name: str = "claude-sonnet-4-5"):
        self._model = model or _build_anthropic_model(model_name)

    def invoke(self, *, system: str, messages: list, tools: list) -> dict:
        bound = self._model.bind_tools(tools) if tools else self._model
        chain_messages = [SystemMessage(content=system)]
        for m in messages:
            role = m["role"]
            if role == "user":
                chain_messages.append(HumanMessage(content=m["content"]))
            elif role == "assistant":
                chain_messages.append(AIMessage(content=m["content"]))
        ai_msg: AIMessage = bound.invoke(chain_messages)
        return {
            "text": ai_msg.content if isinstance(ai_msg.content, str) else "",
            "tool_calls": [
                {"id": tc.get("id", ""), "name": tc["name"], "args": tc.get("args", {})}
                for tc in (ai_msg.tool_calls or [])
            ],
        }
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/test_llm.py -v 2>&1 | tail
```
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add services/ai/llm.py tests/services/ai/test_llm.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: LLM wrapper (Anthropic + tool-call interface, stub-friendly)"
```

---

## Task 7: Backend — CoordinatorAgent

**Files:**
- Create: `services/ai/agents/__init__.py`
- Create: `services/ai/agents/coordinator.py`
- Create: `tests/services/ai/agents/__init__.py`
- Create: `tests/services/ai/agents/test_coordinator.py`

Coordinator routes user intent. It has read-only tools and a `dispatch` tool that selects a subagent + focus. Per spec § 4, Coordinator can also answer questions directly without dispatching.

- [ ] **Step 1: Write failing test**

`tests/services/ai/agents/test_coordinator.py`:

```python
"""CoordinatorAgent — intent routing. Uses stub LLM so tests are deterministic."""
from langchain_core.messages import AIMessage

from services.ai.agents import coordinator
from services.ai import llm


class _Stub:
    def __init__(self, response): self.response = response
    def bind_tools(self, t): return self
    def invoke(self, msgs): return self.response


def _client(text="", tool_calls=None):
    return llm.LLMClient(model=_Stub(AIMessage(content=text, tool_calls=tool_calls or [])))


def test_coordinator_answer_when_no_tool_calls():
    state = {
        "run_id": "run_1", "resume_id": "r1",
        "user_input": "how many bullets in experience?",
        "selection": [], "chat_history": [],
        "skeleton": {"sections": [{"id": "s1", "role": "experience", "entries": [{"id": "e1", "title_excerpt": "X", "bullet_count": 4}]}]},
    }
    decision = coordinator.run(state, _client(text="You have 4 bullets."))
    assert decision == {"kind": "answer", "text": "You have 4 bullets."}


def test_coordinator_dispatches_to_polish_for_single_bullet_focus():
    state = {
        "run_id": "run_1", "resume_id": "r1",
        "user_input": "make this shorter",
        "selection": ["b2"], "chat_history": [],
        "skeleton": {"sections": []},
    }
    decision = coordinator.run(state, _client(tool_calls=[{
        "id": "tc1", "name": "dispatch_to",
        "args": {"agent": "PolishAgent", "focus": "b2", "brief": "make shorter"},
    }]))
    assert decision == {
        "kind": "dispatch", "target": "PolishAgent",
        "focus": "b2", "brief": "make shorter",
    }


def test_coordinator_dispatches_to_experience_for_section_tailor():
    state = {
        "run_id": "run_1", "resume_id": "r1",
        "user_input": "tailor experience for this JD: ...",
        "selection": [], "chat_history": [],
        "skeleton": {"sections": [{"id": "s1", "role": "experience", "entries": []}]},
    }
    decision = coordinator.run(state, _client(tool_calls=[{
        "id": "tc1", "name": "dispatch_to",
        "args": {"agent": "ExperienceAgent", "focus": "s1", "brief": "tailor for JD"},
    }]))
    assert decision["target"] == "ExperienceAgent"
```

- [ ] **Step 2: Run failing test**

```bash
mkdir -p tests/services/ai/agents && touch tests/services/ai/agents/__init__.py
pytest tests/services/ai/agents/test_coordinator.py -v 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `services/ai/agents/__init__.py`**

```python
"""LangGraph nodes — Coordinator + section/polish subagents."""
```

- [ ] **Step 4: Implement `services/ai/agents/coordinator.py`**

```python
"""Coordinator — intent routing.

Has read-only tools (full inventory in services.ai.tools.read_tools) plus a
single `dispatch_to` tool that selects a subagent + focus + brief. If the LLM
calls `dispatch_to`, we return a dispatch decision; if it just replies in
text, we return an answer decision (Coordinator is "answering, no dispatch").
"""
from __future__ import annotations
from typing import Optional

_SYSTEM = """\
You are the Coordinator of a multi-agent resume editing assistant.

You have read-only access to the user's resumes and job application history via
your tools. You can answer questions about them directly.

When the user asks for a CHANGE to the resume, dispatch to a subagent:
  - PolishAgent — single-block text rewrites (shorten/quantify/rephrase a bullet,
    a title, a section heading, the user's name). Use when the change is scoped
    to ONE block or the user has selected a single block.
  - ExperienceAgent — structural + textual changes within a single experience
    section (add/delete/reorder bullets, rewrite multiple bullets, edit entry
    titles + meta within experience). Use for "tailor my experience to this JD"
    or similar multi-block requests scoped to experience.

If you dispatch, call the `dispatch_to` tool with:
  - agent: "PolishAgent" or "ExperienceAgent"
  - focus: a block id (the selection's first block, or your inferred target;
    for ExperienceAgent, this is a section id)
  - brief: a one-sentence summary of what the subagent should do

Otherwise, just reply in text and we'll show your message in chat.
"""


def _read_tool_schemas() -> list:
    """Tool schemas in the langchain function-calling format. Read tools live in
    services.ai.tools.read_tools but their schema is declared here so the
    Coordinator's prompt is self-contained."""
    return [
        {"name": "get_current_resume",
         "description": "Return the full current resume document.",
         "input_schema": {"type": "object", "properties": {}, "required": []}},
        {"name": "get_resume_block",
         "description": "Return a single block (header / section / entry / bullet) by id.",
         "input_schema": {"type": "object", "properties": {
             "block_id": {"type": "string"}}, "required": ["block_id"]}},
        {"name": "list_user_resumes",
         "description": "List all resumes the user has — id, title, updated_at, target_company, target_role.",
         "input_schema": {"type": "object", "properties": {}, "required": []}},
        {"name": "get_resume_by_id",
         "description": "Return another resume by id (for cross-resume comparison).",
         "input_schema": {"type": "object", "properties": {
             "resume_id": {"type": "string"}}, "required": ["resume_id"]}},
        {"name": "get_application_history",
         "description": "List job applications, optionally filtered by status / company / since (ISO date).",
         "input_schema": {"type": "object", "properties": {
             "status": {"type": "string"}, "company": {"type": "string"},
             "since": {"type": "string"}, "limit": {"type": "integer"}}, "required": []}},
        {"name": "get_application_by_id",
         "description": "Return a single application incl. full job description text.",
         "input_schema": {"type": "object", "properties": {
             "job_id": {"type": "string"}}, "required": ["job_id"]}},
        {"name": "dispatch_to",
         "description": "Hand off the user's request to a subagent that will modify the resume.",
         "input_schema": {"type": "object", "properties": {
             "agent": {"type": "string", "enum": ["PolishAgent", "ExperienceAgent"]},
             "focus": {"type": "string", "description": "Block id (PolishAgent: any block; ExperienceAgent: a section id)"},
             "brief": {"type": "string", "description": "One-sentence summary of the change"},
         }, "required": ["agent", "focus", "brief"]}},
    ]


def run(state: dict, llm_client) -> dict:
    """Decide how to handle the user input.

    Returns:
      {"kind": "answer", "text": str}  — show text in chat, no dispatch
      {"kind": "dispatch", "target": str, "focus": str, "brief": str}
    """
    user_msg = {"role": "user", "content": _render_user_turn(state)}
    chat = list(state.get("chat_history", []))
    chat.append(user_msg)
    out = llm_client.invoke(
        system=_SYSTEM,
        messages=chat,
        tools=_read_tool_schemas(),
    )
    for tc in out["tool_calls"]:
        if tc["name"] == "dispatch_to":
            return {
                "kind": "dispatch",
                "target": tc["args"]["agent"],
                "focus": tc["args"]["focus"],
                "brief": tc["args"]["brief"],
            }
    # No dispatch → answer in text. (Read-tool calls during the answer happen
    # in a separate read-tool-execution loop in the orchestrator; for v0 the
    # Coordinator's first turn is one-shot — read tools are exercised only when
    # the answer requires them, in a follow-up turn the orchestrator handles.)
    return {"kind": "answer", "text": out["text"]}


def _render_user_turn(state: dict) -> str:
    parts = [f"User: {state['user_input']}"]
    if state.get("selection"):
        parts.append(f"Selected blocks: {', '.join(state['selection'])}")
    parts.append("Resume skeleton:")
    parts.append(str(state["skeleton"]))
    return "\n".join(parts)
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/agents/test_coordinator.py -v 2>&1 | tail
```
Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add services/ai/agents/__init__.py services/ai/agents/coordinator.py tests/services/ai/agents/__init__.py tests/services/ai/agents/test_coordinator.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: CoordinatorAgent (intent routing — answer vs dispatch_to)"
```

---

## Task 8: Backend — PolishAgent

**Files:**
- Create: `services/ai/agents/polish.py`
- Create: `tests/services/ai/agents/test_polish.py`

PolishAgent is constrained to text-only changes on a single focus block. Its tool palette excludes structural tools (per spec § 4.1). Each tool call emits a Suggestion via `services.ai.tools.write_tools.*`.

- [ ] **Step 1: Write failing test**

`tests/services/ai/agents/test_polish.py`:

```python
"""PolishAgent — text-only updates on focus block. Tool palette is restricted."""
import json
from langchain_core.messages import AIMessage

from services.ai.agents import polish
from services.ai import llm, suggestions, context
from services.ai.tools import write_tools


class _Stub:
    def __init__(self, response): self.response = response
    def bind_tools(self, t): self.captured_tools = t; return self
    def invoke(self, msgs): self.captured_messages = msgs; return self.response


def _client(tool_calls):
    return llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=tool_calls)))


def test_polish_emits_update_bullet_suggestion(tmp_path, monkeypatch):
    resume = {
        "id": "r1", "header": {"id": "h", "name": "F", "contact_lines": []},
        "sections": [{"id": "s1", "role": "experience", "heading": "E",
                      "entries": [{"id": "e1", "title": "T", "meta": "M",
                                   "bullets": [{"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]}]}],
        "metadata": {"updated_at": "", "created_at": "", "target_company": None, "target_role": None, "parent_id": None},
    }
    (tmp_path / "r1.json").write_text(json.dumps(resume))
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(write_tools, "RESUMES_DIR", tmp_path)

    state = {"run_id": "run_1", "resume_id": "r1", "focus": "b1",
             "brief": "make it punchier",
             "skeleton": context.build_skeleton(resume),
             "focus_block": context.build_focus_block(resume, "b1")}

    new_doc = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "punchy"}]}]}
    polish.run(state, _client([{"id": "tc1", "name": "update_bullet",
                                 "args": {"block_id": "b1", "content": new_doc}}]))

    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "update" and s["after"] == new_doc and s["agentId"] == "PolishAgent"


def test_polish_tool_schemas_exclude_structural():
    captured = {}
    class _C(_Stub):
        def bind_tools(self, t): captured["tools"] = t; return self
    c = llm.LLMClient(model=_C(AIMessage(content="", tool_calls=[])))
    polish.run({"run_id": "r", "resume_id": "r1", "focus": "b1", "brief": "",
                "skeleton": {}, "focus_block": {"kind": "bullet", "id": "b1", "content": {}}}, c)
    names = {t["name"] for t in captured["tools"]}
    assert names == {"update_bullet", "update_entry_title", "update_entry_meta",
                     "update_section_heading", "update_header_name"}
    # No structural tools:
    assert names.isdisjoint({"insert_bullet", "delete_bullet", "move_bullet",
                              "insert_entry", "delete_entry", "move_entry"})
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/agents/test_polish.py -v 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `services/ai/agents/polish.py`**

```python
"""PolishAgent — text rewrites on a single focus block. No structural ops."""
from __future__ import annotations

from services.ai.tools import write_tools

_SYSTEM = """\
You are PolishAgent. You rewrite the TEXT of ONE block at a time. You cannot
add, delete, or move blocks. Your job:
  - Given the focus block and the user's brief, call the appropriate
    update_* tool ONCE to propose the rewrite.
  - For bullets, call `update_bullet` with TipTap JSON content.
  - For text fields (entry.title / entry.meta / section.heading / header.name),
    call the matching `update_*` tool with a plain string.
  - Do not call multiple tools in one turn unless absolutely necessary.
"""


def _tool_schemas() -> list:
    return [
        {"name": "update_bullet",
         "description": "Replace a bullet's TipTap content. content is a TipTap doc JSON.",
         "input_schema": {"type": "object", "properties": {
             "block_id": {"type": "string"},
             "content": {"type": "object"}}, "required": ["block_id", "content"]}},
        {"name": "update_entry_title",
         "description": "Replace an entry's title (plain string).",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["entry_id", "value"]}},
        {"name": "update_entry_meta",
         "description": "Replace an entry's meta (date · location, plain string).",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["entry_id", "value"]}},
        {"name": "update_section_heading",
         "description": "Replace a section's heading (plain string).",
         "input_schema": {"type": "object", "properties": {
             "section_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["section_id", "value"]}},
        {"name": "update_header_name",
         "description": "Replace the header's name (plain string).",
         "input_schema": {"type": "object", "properties": {
             "value": {"type": "string"}}, "required": ["value"]}},
    ]


def _execute_tool(tc: dict, ctx: dict) -> None:
    name, args = tc["name"], tc["args"]
    if name == "update_bullet":
        write_tools.update_bullet(args["block_id"], args["content"], ctx=ctx)
    elif name == "update_entry_title":
        write_tools.update_entry_title(args["entry_id"], args["value"], ctx=ctx)
    elif name == "update_entry_meta":
        write_tools.update_entry_meta(args["entry_id"], args["value"], ctx=ctx)
    elif name == "update_section_heading":
        write_tools.update_section_heading(args["section_id"], args["value"], ctx=ctx)
    elif name == "update_header_name":
        write_tools.update_header_name(args["value"], ctx=ctx)
    # Unknown tools are silently ignored — the LLM can only see schemas above,
    # so this branch only fires on bind_tools/scope misconfigurations.


def run(state: dict, llm_client) -> dict:
    """Run PolishAgent on the focus block. Returns {"applied_suggestion_ids": [...]}.

    Each tool call emits a Suggestion via write_tools, accumulating ids."""
    ctx = {"resumeId": state["resume_id"], "agentId": "PolishAgent",
           "runId": state["run_id"]}
    user_msg = {"role": "user", "content":
                f"Focus block:\n{state['focus_block']}\n\nBrief:\n{state['brief']}"}
    out = llm_client.invoke(system=_SYSTEM, messages=[user_msg], tools=_tool_schemas())

    applied = []
    for tc in out["tool_calls"]:
        try:
            sid = _execute_tool(tc, ctx)
            if sid:
                applied.append(sid)
        except Exception as exc:
            # ToolError or other validation failure — swallow + log; orchestrator
            # surfaces as agent.narration (Task 10).
            applied.append({"error": str(exc)})
    return {"applied_suggestion_ids": [a for a in applied if isinstance(a, str)]}
```

Note: `_execute_tool` returns the suggestion id from `write_tools.*` — the helper is `void` above, but the actual write_tools functions all return the sid. Update `_execute_tool` to return that:

```python
def _execute_tool(tc, ctx):
    name, args = tc["name"], tc["args"]
    if name == "update_bullet":
        return write_tools.update_bullet(args["block_id"], args["content"], ctx=ctx)
    if name == "update_entry_title":
        return write_tools.update_entry_title(args["entry_id"], args["value"], ctx=ctx)
    if name == "update_entry_meta":
        return write_tools.update_entry_meta(args["entry_id"], args["value"], ctx=ctx)
    if name == "update_section_heading":
        return write_tools.update_section_heading(args["section_id"], args["value"], ctx=ctx)
    if name == "update_header_name":
        return write_tools.update_header_name(args["value"], ctx=ctx)
    return None
```

(Use this version — the comment-only no-return version above is incorrect.)

- [ ] **Step 4: Run tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/services/ai/agents/test_polish.py -v 2>&1 | tail
```
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add services/ai/agents/polish.py tests/services/ai/agents/test_polish.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: PolishAgent (text-only update_* tools, no structural)"
```

---

## Task 9: Backend — ExperienceAgent

**Files:**
- Create: `services/ai/agents/experience.py`
- Create: `tests/services/ai/agents/test_experience.py`

ExperienceAgent has the full write toolset BUT runtime-guarded to `section.role === 'experience'` (spec § 4.1, § 3.3). Header tools are excluded entirely. Tool palette mirrors `write_tools.*` minus `update_header_name`.

- [ ] **Step 1: Write failing test**

`tests/services/ai/agents/test_experience.py`:

```python
"""ExperienceAgent — full write toolset, runtime-scoped to experience sections."""
import json
import pytest
from langchain_core.messages import AIMessage

from services.ai.agents import experience
from services.ai import llm, suggestions, context
from services.ai.tools import write_tools


class _Stub:
    def __init__(self, response): self.response = response
    def bind_tools(self, t): self.captured_tools = t; return self
    def invoke(self, msgs): return self.response


@pytest.fixture
def setup(tmp_path, monkeypatch):
    resume = {
        "id": "r1", "header": {"id": "h", "name": "F", "contact_lines": []},
        "sections": [
            {"id": "s1", "role": "experience", "heading": "Experience",
             "entries": [{"id": "e1", "title": "T", "meta": "M",
                          "bullets": [{"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]}]},
            {"id": "s2", "role": "skills", "heading": "Skills", "entries": []},
        ],
        "metadata": {"updated_at": "", "created_at": "", "target_company": None, "target_role": None, "parent_id": None},
    }
    (tmp_path / "r1.json").write_text(json.dumps(resume))
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(write_tools, "RESUMES_DIR", tmp_path)
    return tmp_path, resume


def _client(tcs):
    return llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=tcs)))


def test_experience_emits_insert_bullet(setup):
    _, resume = setup
    state = {"run_id": "run_1", "resume_id": "r1", "focus": "s1", "brief": "add bullet",
             "skeleton": context.build_skeleton(resume),
             "section": context.build_section_detail(resume, ["experience"])}
    new_doc = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x"}]}]}
    experience.run(state, _client([{"id": "tc1", "name": "insert_bullet",
                                     "args": {"parent_entry_id": "e1", "at_index": 1, "content": new_doc}}]))
    [s] = suggestions.list_for_resume("r1")
    assert s["op"] == "insert" and s["agentId"] == "ExperienceAgent"


def test_experience_rejects_skills_section_target(setup):
    """Cross-section / non-experience writes must be rejected (runtime scope guard)."""
    _, resume = setup
    state = {"run_id": "run_1", "resume_id": "r1", "focus": "s1", "brief": "edit skills",
             "skeleton": context.build_skeleton(resume),
             "section": context.build_section_detail(resume, ["experience"])}
    # AI tries to add a bullet inside the skills section's entries (none exist; this still
    # tests scope guard at the section level — we'll add a synthetic entry on s2 first).
    p = setup[0] / "r1.json"
    r = json.loads(p.read_text())
    r["sections"][1]["entries"].append({"id": "e_sk", "title": "T", "meta": "",
                                         "bullets": [{"id": "b_sk", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]})
    p.write_text(json.dumps(r))
    new_doc = {"type": "doc", "content": [{"type": "paragraph"}]}
    experience.run(state, _client([{"id": "tc1", "name": "insert_bullet",
                                     "args": {"parent_entry_id": "e_sk", "at_index": 0, "content": new_doc}}]))
    # No suggestion should have been emitted (scope guard rejected it):
    assert suggestions.list_for_resume("r1") == []


def test_experience_rejects_header_name_unconditionally(setup):
    """update_header_name is not in ExperienceAgent's tool schema; even if a stub LLM
    forces it, the agent's tool dispatch must skip it."""
    _, resume = setup
    state = {"run_id": "run_1", "resume_id": "r1", "focus": "s1", "brief": "rename me",
             "skeleton": context.build_skeleton(resume),
             "section": context.build_section_detail(resume, ["experience"])}
    experience.run(state, _client([{"id": "tc1", "name": "update_header_name",
                                     "args": {"value": "Frederick"}}]))
    assert suggestions.list_for_resume("r1") == []
```

- [ ] **Step 2: Run failing test**

```bash
pytest tests/services/ai/agents/test_experience.py -v 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `services/ai/agents/experience.py`**

```python
"""ExperienceAgent — full write toolset, runtime-scoped to section.role==experience."""
from __future__ import annotations
import json
from pathlib import Path

from services.ai.tools import write_tools

_SYSTEM = """\
You are ExperienceAgent. You modify ONE experience section at a time. You can:
  - Update bullet content (TipTap JSON)
  - Update entry titles + meta + section heading (plain strings)
  - Insert / delete / move bullets within or across entries IN THE SAME SECTION
  - Insert / delete / move entries WITHIN THE SAME SECTION

You CANNOT:
  - Touch the header
  - Touch any non-experience section (skills / projects / education / …)

The user's focus is the section id (state.focus). Stay scoped.
"""


def _tool_schemas() -> list:
    return [
        {"name": "update_bullet",
         "description": "Replace a bullet's TipTap content.",
         "input_schema": {"type": "object", "properties": {
             "block_id": {"type": "string"}, "content": {"type": "object"}},
             "required": ["block_id", "content"]}},
        {"name": "update_entry_title",
         "description": "Replace an entry's title (plain string).",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["entry_id", "value"]}},
        {"name": "update_entry_meta",
         "description": "Replace an entry's meta (plain string).",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["entry_id", "value"]}},
        {"name": "update_section_heading",
         "description": "Replace a section's heading (plain string).",
         "input_schema": {"type": "object", "properties": {
             "section_id": {"type": "string"}, "value": {"type": "string"}},
             "required": ["section_id", "value"]}},
        {"name": "insert_bullet",
         "description": "Insert a new bullet into an entry at the given index.",
         "input_schema": {"type": "object", "properties": {
             "parent_entry_id": {"type": "string"},
             "at_index": {"type": "integer"},
             "content": {"type": "object"}},
             "required": ["parent_entry_id", "at_index", "content"]}},
        {"name": "delete_bullet",
         "description": "Delete a bullet by id.",
         "input_schema": {"type": "object", "properties": {
             "block_id": {"type": "string"}}, "required": ["block_id"]}},
        {"name": "move_bullet",
         "description": "Move a bullet to a different entry/index.",
         "input_schema": {"type": "object", "properties": {
             "block_id": {"type": "string"},
             "to_parent_id": {"type": "string"},
             "to_index": {"type": "integer"}},
             "required": ["block_id", "to_parent_id", "to_index"]}},
        {"name": "insert_entry",
         "description": "Insert a new entry into a section. payload has title/meta/bullets[].",
         "input_schema": {"type": "object", "properties": {
             "section_id": {"type": "string"},
             "at_index": {"type": "integer"},
             "payload": {"type": "object", "properties": {
                 "title": {"type": "string"}, "meta": {"type": "string"},
                 "bullets": {"type": "array", "items": {"type": "object"}}},
                 "required": ["title", "meta", "bullets"]}},
             "required": ["section_id", "at_index", "payload"]}},
        {"name": "delete_entry",
         "description": "Delete an entry by id.",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"}}, "required": ["entry_id"]}},
        {"name": "move_entry",
         "description": "Move an entry to a different section/index (within experience).",
         "input_schema": {"type": "object", "properties": {
             "entry_id": {"type": "string"},
             "to_section_id": {"type": "string"},
             "to_index": {"type": "integer"}},
             "required": ["entry_id", "to_section_id", "to_index"]}},
    ]


def _is_experience_target(resume_id: str, target_block_id: str) -> bool:
    """True iff target_block_id is in (or is) a section with role=='experience'.
    Reads resume from disk fresh — guard runs at tool-call time, not turn start."""
    p = write_tools.RESUMES_DIR / f"{resume_id}.json"
    if not p.exists():
        return False
    r = json.loads(p.read_text())
    for s in r.get("sections", []):
        if s.get("role") != "experience":
            continue
        if s["id"] == target_block_id:
            return True
        for e in s.get("entries", []):
            if e["id"] == target_block_id:
                return True
            for b in e.get("bullets", []):
                if b["id"] == target_block_id:
                    return True
    return False


def _execute_tool(tc: dict, ctx: dict):
    """Run one tool call. Scope-guard FIRST: any target must resolve to an
    experience-scoped block. Out-of-scope calls are silently no-op'd (we'd ideally
    surface as a tool-call ToolError, but spec § 4.1 keeps v0 simple)."""
    name, args = tc["name"], tc["args"]

    # Header tool is unconditionally rejected (not in our schema, but defensive):
    if name == "update_header_name":
        return None

    # Locate the "primary target id" for scope check:
    primary = (
        args.get("block_id")
        or args.get("entry_id")
        or args.get("section_id")
        or args.get("parent_entry_id")
    )
    if primary and not _is_experience_target(ctx["resumeId"], primary):
        return None

    # All-good: dispatch to the matching write tool. Returns suggestion id.
    if name == "update_bullet":
        return write_tools.update_bullet(args["block_id"], args["content"], ctx=ctx)
    if name == "update_entry_title":
        return write_tools.update_entry_title(args["entry_id"], args["value"], ctx=ctx)
    if name == "update_entry_meta":
        return write_tools.update_entry_meta(args["entry_id"], args["value"], ctx=ctx)
    if name == "update_section_heading":
        return write_tools.update_section_heading(args["section_id"], args["value"], ctx=ctx)
    if name == "insert_bullet":
        return write_tools.insert_bullet(args["parent_entry_id"], args["at_index"], args["content"], ctx=ctx)
    if name == "delete_bullet":
        return write_tools.delete_bullet(args["block_id"], ctx=ctx)
    if name == "move_bullet":
        return write_tools.move_bullet(args["block_id"], args["to_parent_id"], args["at_index"] if "at_index" in args else args["to_index"], ctx=ctx)
    if name == "insert_entry":
        return write_tools.insert_entry(args["section_id"], args["at_index"], args["payload"], ctx=ctx)
    if name == "delete_entry":
        return write_tools.delete_entry(args["entry_id"], ctx=ctx)
    if name == "move_entry":
        return write_tools.move_entry(args["entry_id"], args["to_section_id"], args["to_index"], ctx=ctx)
    return None


def run(state: dict, llm_client) -> dict:
    ctx = {"resumeId": state["resume_id"], "agentId": "ExperienceAgent",
           "runId": state["run_id"]}
    user_msg = {"role": "user", "content":
                f"Focus section: {state['focus']}\nBrief: {state['brief']}\n\n"
                f"Section detail:\n{state['section']}"}
    out = llm_client.invoke(system=_SYSTEM, messages=[user_msg], tools=_tool_schemas())
    applied = []
    for tc in out["tool_calls"]:
        try:
            sid = _execute_tool(tc, ctx)
            if sid:
                applied.append(sid)
        except Exception:
            pass
    return {"applied_suggestion_ids": applied}
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/services/ai/agents/test_experience.py -v 2>&1 | tail
```
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add services/ai/agents/experience.py tests/services/ai/agents/test_experience.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: ExperienceAgent (full write toolset, scoped to experience sections)"
```

---

## Task 10: Backend — LangGraph orchestrator + run state + event queue

**Files:**
- Create: `services/ai/runs.py`
- Create: `services/ai/event_queue.py` — per-run event channel (live streaming, in-memory)
- Create: `services/ai/orchestrator.py`
- Create: `tests/services/ai/test_runs.py`
- Create: `tests/services/ai/test_event_queue.py`
- Create: `tests/services/ai/test_orchestrator.py`

The orchestrator builds the LangGraph: Coordinator → (PolishAgent | ExperienceAgent | END). Run state is persisted to `saved_sessions/ai_runs/{runId}.json` so a crash doesn't leak orphan `streaming` Suggestions. **Live event streaming (NOT post-hoc replay)** flows through `event_queue` — a module-level `{run_id: queue.Queue}` dict — so the SSE handler in Task 11 can yield events the moment the orchestrator emits them. This is required by spec § 6.2: soft lock and chat narration must work *during* the agent run, not flash at the end.

This task has THREE parts:
- **Part A:** `runs.py` — file CRUD for run state.
- **Part B:** `event_queue.py` — per-run event channel (in-memory).
- **Part C:** `orchestrator.py` — LangGraph build + `run_orchestration(input, emitter)` that emits events as it progresses.

- [ ] **Step 1: Write failing tests for `runs.py`**

`tests/services/ai/test_runs.py`:

```python
"""AI run state CRUD — file-based, GC after run.completed + 5min."""
import time
import pytest

from services.ai import runs


@pytest.fixture
def tmp_runs(tmp_path, monkeypatch):
    monkeypatch.setattr(runs, "RUNS_DIR", tmp_path)
    return tmp_path


def test_create_then_load(tmp_runs):
    rid = runs.create({"resume_id": "r1", "user_input": "hi", "selection": []})
    assert rid.startswith("run_")
    state = runs.load(rid)
    assert state["resume_id"] == "r1" and state["status"] == "running"


def test_update_status_persists(tmp_runs):
    rid = runs.create({"resume_id": "r1", "user_input": "hi", "selection": []})
    runs.update(rid, status="done", coordinator_decision={"kind": "answer", "text": "ok"})
    state = runs.load(rid)
    assert state["status"] == "done"
    assert state["coordinator_decision"]["text"] == "ok"


def test_gc_purges_done_runs_older_than_5min(tmp_runs):
    rid = runs.create({"resume_id": "r1", "user_input": "x", "selection": []})
    runs.update(rid, status="done", completed_at=1000)  # ancient
    purged = runs.gc(now_ms=lambda: 1_000_000_000_000)
    assert purged >= 1 and runs.load(rid) is None


def test_gc_keeps_running_orphans_until_60s_then_marks_error(tmp_runs):
    rid = runs.create({"resume_id": "r1", "user_input": "x", "selection": []})
    # Force created_at to ancient:
    runs.update(rid, _patch={"created_at": 1000})
    runs.gc(now_ms=lambda: 1_000_000_000_000)
    state = runs.load(rid)
    assert state["status"] == "error" and state["error"] == "orphan_timeout"
```

- [ ] **Step 2: Run failing test**

```bash
pytest tests/services/ai/test_runs.py -v 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `services/ai/runs.py`**

```python
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
```

- [ ] **Step 3.5: Implement `services/ai/event_queue.py` (live event channel)**

`services/ai/event_queue.py`:

```python
"""Per-run event channel — backs live SSE streaming during orchestration.

Module-level `{run_id: {queue, closed_at}}` dict. Producer (orchestrator on a
background thread) writes events; consumer (SSE generator on the asyncio loop)
reads via `await asyncio.to_thread(queue.get, timeout=...)`.

Events are dicts shaped `{type: str, data: dict}`. Event types match spec § 4.4:
run.started, agent.started, agent.narration, suggestion.streamed,
agent.completed, run.completed, run.error.

`close(run_id)` pushes a `CLOSE_SENTINEL` so the consumer's loop can break
cleanly. **It does NOT pop the queue from the dict** — late SSE attachers
(browser races, page reloads moments after run.completed) can still find the
queue, drain queued events including the sentinel, and exit cleanly. The
queue is removed by `gc(now_ms)` only after `closed_at + 5 min`.

Without this delayed removal, a fast (stub-LLM-fast or just brief) run would
finish, immediately remove its queue, and any consumer that attached even a
millisecond later would fall through to the `_replay_from_state` path —
losing the `agent.started` event with the lockedBlockIds and the per-tool
`suggestion.streamed` events the live stream would have surfaced.
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
        return None              # ★ post-close → use replay path
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
```

Test `tests/services/ai/test_event_queue.py`:

```python
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
    # ★ Post-close: existing consumers (who hold `q` from their attach-time
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
```

Run: `pytest tests/services/ai/test_event_queue.py -v` → expected `6 passed`.

- [ ] **Step 4: Write failing test for orchestrator**

`tests/services/ai/test_orchestrator.py`:

```python
"""LangGraph orchestrator — Coordinator decides answer vs dispatch; subagents emit suggestions."""
import json
import pytest
from langchain_core.messages import AIMessage

from services.ai import orchestrator, runs, suggestions, llm
from services.ai.tools import write_tools


class _Stub:
    def __init__(self, response): self.response = response
    def bind_tools(self, t): return self
    def invoke(self, m): return self.response


@pytest.fixture
def setup(tmp_path, monkeypatch):
    resume = {
        "id": "r1", "header": {"id": "h", "name": "F", "contact_lines": []},
        "sections": [{"id": "s1", "role": "experience", "heading": "Experience",
                      "entries": [{"id": "e1", "title": "T", "meta": "M",
                                   "bullets": [{"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]}]}],
        "metadata": {"updated_at": "", "created_at": "", "target_company": None, "target_role": None, "parent_id": None},
    }
    (tmp_path / "r1.json").write_text(json.dumps(resume))
    monkeypatch.setattr(write_tools, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    runs_dir = tmp_path / "ai_runs"
    monkeypatch.setattr(runs, "RUNS_DIR", runs_dir)
    # Patch the read_tools resume dir too (Coordinator may call them — for v0 we
    # use stub LLM so this is defensive):
    from services.ai.tools import read_tools
    monkeypatch.setattr(read_tools, "RESUMES_DIR", tmp_path)
    return tmp_path, resume


def test_orchestrator_answer_path(setup):
    """Coordinator answers in text → no subagent invoked → run completes with answer."""
    coord_client = llm.LLMClient(model=_Stub(AIMessage(content="You have 1 bullet.", tool_calls=[])))
    polish_client = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[])))
    exp_client = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[])))
    rid = orchestrator.run_orchestration(
        resume_id="r1", user_input="how many bullets?", selection=[],
        chat_history=[],
        clients={"Coordinator": coord_client, "PolishAgent": polish_client, "ExperienceAgent": exp_client},
    )
    state = runs.load(rid)
    assert state["status"] == "done"
    assert state["coordinator_decision"] == {"kind": "answer", "text": "You have 1 bullet."}
    assert state["applied_suggestion_ids"] == []


def test_orchestrator_polish_dispatch_emits_suggestion(setup):
    coord = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[
        {"id": "tc1", "name": "dispatch_to",
         "args": {"agent": "PolishAgent", "focus": "b1", "brief": "shorten"}},
    ])))
    polish = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[
        {"id": "tc1", "name": "update_bullet",
         "args": {"block_id": "b1",
                  "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x"}]}]}}},
    ])))
    rid = orchestrator.run_orchestration(
        resume_id="r1", user_input="shorten this", selection=["b1"],
        chat_history=[],
        clients={"Coordinator": coord, "PolishAgent": polish, "ExperienceAgent": None},
    )
    state = runs.load(rid)
    assert state["status"] == "done"
    assert state["coordinator_decision"]["target"] == "PolishAgent"
    assert len(state["applied_suggestion_ids"]) == 1
    items = suggestions.list_for_resume("r1")
    # Suggestion was streaming during run; orchestrator transitions runId set to pending at run end:
    assert len(items) == 1 and items[0]["status"] == "pending"
```

- [ ] **Step 5: Run failing tests**

```bash
pytest tests/services/ai/test_orchestrator.py -v 2>&1 | tail
```
Expected: import error.

- [ ] **Step 6: Implement `services/ai/orchestrator.py` (with live event emission)**

```python
"""LangGraph orchestrator. v0 graph shape (spec § 4.3):

  Coordinator → (PolishAgent | ExperienceAgent | END)

Live event emission: every state transition (run.started, agent.started,
agent.narration, suggestion.streamed, agent.completed, run.completed,
run.error) is pushed to the per-run event_queue so SSE consumers see them
in real time. This is what makes soft lock (spec § 6.2) and chat narration
(spec § 6.4) actually work *during* the run.

Sequential v0 — no parallel fan-out, no ReviewerAgent. LangGraph contract is
in place so v0.1 can add Reviewer / multi-section parallel without restructure.
"""
from __future__ import annotations
import time
from typing import Optional, TypedDict

from services.ai import context, runs, suggestions, llm, event_queue
from services.ai.agents import coordinator, polish, experience
from services.ai.tools import read_tools


def _emit_streamed_suggestions_for_run(resume_id: str, run_id: str,
                                        already_emitted: set) -> set:
    """Read suggestions of this run that aren't yet emitted, push them to the
    event queue. Returns updated already_emitted set."""
    for s in suggestions.list_for_resume(resume_id):
        if s.get("runId") != run_id:
            continue
        sid = s["id"]
        if sid in already_emitted:
            continue
        event_queue.emit(run_id, "suggestion.streamed", {"suggestion": s})
        already_emitted.add(sid)
    return already_emitted


def _transition_run_streaming_to_pending(resume_id: str, run_id: str) -> None:
    items = suggestions.list_for_resume(resume_id)
    for s in items:
        if s.get("runId") == run_id and s.get("status") == "streaming":
            suggestions.set_status(resume_id, s["id"], "pending")


def run_orchestration(
    *, resume_id: str, user_input: str, selection: list,
    chat_history: list, clients: dict, run_id: Optional[str] = None,
) -> str:
    """Run the orchestration synchronously, emitting events to event_queue
    as it progresses. Caller (the route handler in Task 11) decides whether
    to invoke this on a background thread (production: yes; tests: directly).

    If `run_id` is supplied, that id is reused (route handler creates the
    run + opens the queue first, then dispatches the orchestration with the
    pre-allocated id so the SSE consumer can attach immediately). Otherwise
    a fresh run + queue are created here."""
    resume = read_tools.get_current_resume(resume_id)
    if resume is None:
        raise ValueError(f"resume {resume_id} not found")

    skeleton = context.build_skeleton(resume)
    if run_id is None:
        run_id = runs.create({
            "resume_id": resume_id, "user_input": user_input, "selection": selection,
            "chat_history": chat_history,
        })
        event_queue.open(run_id)

    event_queue.emit(run_id, "run.started",
                     {"runId": run_id, "createdAt": runs.load(run_id).get("created_at")})

    try:
        coord_decision = coordinator.run({
            "run_id": run_id, "resume_id": resume_id,
            "user_input": user_input, "selection": selection,
            "chat_history": chat_history, "skeleton": skeleton,
        }, clients["Coordinator"])
        runs.update(run_id, coordinator_decision=coord_decision)

        applied: list = []
        if coord_decision["kind"] == "answer":
            event_queue.emit(run_id, "agent.narration",
                             {"agentId": "Coordinator", "text": coord_decision["text"]})
        elif coord_decision["kind"] == "dispatch":
            target = coord_decision["target"]
            focus = coord_decision["focus"]
            brief = coord_decision["brief"]

            # Compute lock scope per spec § 6.2: PolishAgent locks the focus
            # block; ExperienceAgent locks the entire focus section (header +
            # all entries + all bullets within).
            locked = _compute_lock_scope(resume, target, focus)
            event_queue.emit(run_id, "agent.started",
                             {"agentId": target, "lockedBlockIds": locked})
            event_queue.emit(run_id, "agent.narration",
                             {"agentId": target, "text": f"{target} working on {focus}..."})

            already_emitted: set = set()
            if target == "PolishAgent":
                result = polish.run({
                    "run_id": run_id, "resume_id": resume_id,
                    "focus": focus, "brief": brief,
                    "skeleton": skeleton,
                    "focus_block": context.build_focus_block(resume, focus),
                }, clients["PolishAgent"])
                applied = result["applied_suggestion_ids"]
            elif target == "ExperienceAgent":
                result = experience.run({
                    "run_id": run_id, "resume_id": resume_id,
                    "focus": focus, "brief": brief,
                    "skeleton": skeleton,
                    "section": context.build_section_detail(resume, ["experience"]),
                }, clients["ExperienceAgent"])
                applied = result["applied_suggestion_ids"]

            # After the agent's tool-call burst, emit any new suggestions:
            already_emitted = _emit_streamed_suggestions_for_run(resume_id, run_id, already_emitted)
            event_queue.emit(run_id, "agent.completed",
                             {"agentId": target, "runId": run_id})

        _transition_run_streaming_to_pending(resume_id, run_id)
        runs.update(run_id, status="done", applied_suggestion_ids=applied,
                    completed_at=int(time.time() * 1000))
        event_queue.emit(run_id, "run.completed",
                         {"runId": run_id, "suggestionIds": applied, "status": "done"})
        return run_id
    except Exception as exc:
        runs.update(run_id, status="error", error=str(exc),
                    completed_at=int(time.time() * 1000))
        event_queue.emit(run_id, "run.error", {"runId": run_id, "error": str(exc)})
        raise
    finally:
        event_queue.close(run_id)


def _compute_lock_scope(resume: dict, agent: str, focus: str) -> list:
    """For PolishAgent: just [focus]. For ExperienceAgent: focus is a
    section id; expand to section + all entry ids + all bullet ids within."""
    if agent != "ExperienceAgent":
        return [focus]
    for s in resume.get("sections", []):
        if s["id"] != focus:
            continue
        ids = [s["id"]]
        for e in s.get("entries", []):
            ids.append(e["id"])
            for b in e.get("bullets", []):
                ids.append(b["id"])
        return ids
    return [focus]
```

**Note on event timing for v0:** We emit `suggestion.streamed` events AFTER the agent's `polish.run`/`experience.run` returns (which is itself one or more LLM tool-call rounds). This is "burst at end of agent" rather than "tool-by-tool inside the agent." Spec § 4.4 ideally wants per-tool-call streaming, but for v0 the agent's run typically takes 2-30s and the burst-at-end approximation is sufficient — the `agent.started` lock + `agent.narration` text appear immediately, and Suggestions land in sidebar the moment the agent finishes (still well before the user could click Accept). v0.1 can refactor to inject the emitter into the agent's tool dispatch loop for true per-tool streaming.

- [ ] **Step 7: Run tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest \
  tests/services/ai/test_runs.py \
  tests/services/ai/test_event_queue.py \
  tests/services/ai/test_orchestrator.py -v 2>&1 | tail -20
```
Expected: `4 + 6 + 2 = 12 passed`.

- [ ] **Step 8: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add \
  services/ai/runs.py \
  services/ai/event_queue.py \
  services/ai/orchestrator.py \
  tests/services/ai/test_runs.py \
  tests/services/ai/test_event_queue.py \
  tests/services/ai/test_orchestrator.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: LangGraph orchestrator + run state + per-run event queue"
```

---

## Task 11: Backend — `api/routes/ai.py` (async run + LIVE SSE events + suggestions + status)

**Files:**
- Create: `api/routes/ai.py`
- Create: `tests/api/test_ai_routes.py`
- Modify: `api/main.py` — register `ai_router`

Routes:
- `POST /api/ai/run` — body `{resumeId, userInput, selection, chatHistory}`. **Allocates a runId + opens an event_queue, then dispatches orchestration to a background thread, and returns `{runId}` IMMEDIATELY** (not after run completes). This is required by spec § 6.2 / § 6.4 — the soft-lock visual and chat narration are useless if /run blocks for 30 s.
- `GET /api/ai/runs/{runId}/events` — **live SSE stream** that consumes from the run's `event_queue` (Task 10's Part B). Each event is yielded the moment the orchestrator emits it. The generator exits when it sees the `CLOSE_SENTINEL` (pushed by `event_queue.close()` in the orchestrator's `finally`).
- `GET /api/ai/suggestions?resumeId=...&status=pending,streaming` — list filtered.
- `POST /api/ai/suggestions/{id}/status` — body `{status}` updates status with timestamp side effects.

- [ ] **Step 1: Write failing test**

`tests/api/test_ai_routes.py`:

```python
"""AI routes — POST /run async background dispatch, GET /events live SSE, GET /suggestions, POST /status."""
import json
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage


@pytest.fixture
def client(tmp_path, monkeypatch):
    from services.ai.tools import write_tools, read_tools
    from services.ai import suggestions, runs, orchestrator, llm
    monkeypatch.setattr(write_tools, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(read_tools, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(suggestions, "RESUMES_DIR", tmp_path)
    monkeypatch.setattr(runs, "RUNS_DIR", tmp_path / "ai_runs")
    resume = {
        "id": "r1", "header": {"id": "h", "name": "F", "contact_lines": []},
        "sections": [{"id": "s1", "role": "experience", "heading": "Experience",
                      "entries": [{"id": "e1", "title": "T", "meta": "M",
                                   "bullets": [{"id": "b1", "content": {"type": "doc", "content": [{"type": "paragraph"}]}}]}]}],
        "metadata": {"updated_at": "", "created_at": "", "target_company": None, "target_role": None, "parent_id": None},
    }
    (tmp_path / "r1.json").write_text(json.dumps(resume))

    # Stub LLM clients so /run can be exercised in unit tests:
    class _Stub:
        def __init__(self, response): self.response = response
        def bind_tools(self, t): return self
        def invoke(self, m): return self.response

    def fake_clients():
        coord = llm.LLMClient(model=_Stub(AIMessage(content="OK", tool_calls=[])))
        polish = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[])))
        exp = llm.LLMClient(model=_Stub(AIMessage(content="", tool_calls=[])))
        return {"Coordinator": coord, "PolishAgent": polish, "ExperienceAgent": exp}

    from api.routes import ai as ai_route
    monkeypatch.setattr(ai_route, "build_llm_clients", fake_clients)

    from api.main import app
    return TestClient(app)


def test_run_returns_runid_immediately_and_dispatches_in_background(client):
    """POST /run returns IMMEDIATELY with runId after dispatching orchestration
    to a daemon thread. Response time should be <100ms even when the orchestrator
    would take seconds (here it's a stub LLM, but the async-dispatch shape matters)."""
    import time
    t0 = time.time()
    r = client.post("/api/ai/run", json={
        "resumeId": "r1", "userInput": "how many bullets?", "selection": [], "chatHistory": []
    })
    elapsed = time.time() - t0
    assert r.status_code == 200
    rid = r.json()["runId"]
    assert rid.startswith("run_")
    # Response is immediate (route doesn't wait for orchestration). 1s is a
    # generous bound that catches accidental "await orchestration" regressions:
    assert elapsed < 1.0, f"POST /run took {elapsed:.2f}s — should be <100ms (background dispatch)"
    # Wait briefly for the daemon thread to do its work, then verify state:
    time.sleep(0.5)
    from services.ai import runs as _runs
    state = _runs.load(rid)
    assert state["status"] in ("done", "running")  # done with stub LLM is fast


def test_get_suggestions_returns_pending(client):
    r = client.get("/api/ai/suggestions", params={"resumeId": "r1", "status": "pending"})
    assert r.status_code == 200
    assert r.json() == {"suggestions": []}


def test_post_status_idempotent(client):
    # Seed a suggestion directly via the storage layer:
    from services.ai import suggestions
    s = {"id": "sug_x", "runId": "r", "agentId": "PolishAgent", "resumeId": "r1",
         "status": "pending", "createdAt": 1, "source": {"kind": "agent", "agentId": "PolishAgent", "runId": "r"},
         "op": "update", "field": {"kind": "entry.title", "id": "e1"},
         "before": "T", "after": "TX"}
    suggestions.append("r1", s)
    r1 = client.post("/api/ai/suggestions/sug_x/status", json={"status": "accepted"})
    assert r1.status_code == 200 and r1.json() == {"ok": True}
    r2 = client.post("/api/ai/suggestions/sug_x/status", json={"status": "accepted"})
    assert r2.status_code == 200 and r2.json() == {"ok": True, "noop": True}


def test_post_status_terminal_conflict_returns_ok_false(client):
    from services.ai import suggestions
    s = {"id": "sug_y", "runId": "r", "agentId": "PolishAgent", "resumeId": "r1",
         "status": "pending", "createdAt": 1, "source": {"kind": "agent", "agentId": "PolishAgent", "runId": "r"},
         "op": "update", "field": {"kind": "entry.title", "id": "e1"},
         "before": "T", "after": "TY"}
    suggestions.append("r1", s)
    client.post("/api/ai/suggestions/sug_y/status", json={"status": "rejected"})
    r = client.post("/api/ai/suggestions/sug_y/status", json={"status": "accepted"})
    assert r.json() == {"ok": False, "current": "rejected"}


def test_events_sse_streams_live_then_closes(client):
    """SSE attaches BEFORE orchestration finishes (in test, we POST /run then
    immediately GET /events — even with stub LLM the queue still mediates,
    so we exercise the live tail path, not the post-hoc replay fallback)."""
    r = client.post("/api/ai/run", json={
        "resumeId": "r1", "userInput": "hi", "selection": [], "chatHistory": []
    })
    rid = r.json()["runId"]
    # GET /events: live stream that exits when CLOSE_SENTINEL is received
    # (orchestrator's finally pushes it). With stub LLM the whole run is
    # ~milliseconds — the test reads the full stream synchronously.
    r = client.get(f"/api/ai/runs/{rid}/events")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    body = r.text
    assert "event: run.started" in body
    assert "event: run.completed" in body


def test_events_sse_replay_fallback_after_run_closed(client):
    """If the SSE attaches AFTER the orchestrator called event_queue.close()
    (worker thread done), fall back to one-shot replay from persisted state.

    `get_queue` returns None for closed runs even within the 5min grace
    period — late attachers always go through replay to avoid hanging on
    an empty closed queue (R9 P0 #2 fix)."""
    import time
    r = client.post("/api/ai/run", json={
        "resumeId": "r1", "userInput": "hi", "selection": [], "chatHistory": []
    })
    rid = r.json()["runId"]
    # Wait for the worker thread to finish + call event_queue.close():
    time.sleep(1.0)
    from services.ai import event_queue
    assert event_queue.get_queue(rid) is None      # closed → None
    # Now attach: should get the synthetic replay
    r = client.get(f"/api/ai/runs/{rid}/events")
    assert r.status_code == 200
    body = r.text
    assert "event: run.started" in body
    assert "event: run.completed" in body


def test_events_sse_replay_after_queue_gc_d(client):
    """Same replay path also fires when the underlying slot has been GC'd
    past its 5min grace period — runs.load still returns persisted state."""
    import time
    r = client.post("/api/ai/run", json={
        "resumeId": "r1", "userInput": "hi", "selection": [], "chatHistory": []
    })
    rid = r.json()["runId"]
    time.sleep(1.0)
    from services.ai import event_queue
    event_queue.gc(now_ms=lambda: int(time.time() * 1000) + 6 * 60 * 1000)
    assert rid not in event_queue._QUEUES        # GC'd
    r = client.get(f"/api/ai/runs/{rid}/events")
    assert r.status_code == 200
    body = r.text
    assert "event: run.started" in body
```

- [ ] **Step 2: Run failing test**

```bash
pytest tests/api/test_ai_routes.py -v 2>&1 | tail
```
Expected: import error / 404s.

- [ ] **Step 3: Implement `api/routes/ai.py`**

```python
"""AI routes: POST /run (background dispatch — returns immediately),
GET /events (LIVE SSE stream from per-run event_queue),
GET /suggestions (filtered list), POST /status (status transitions)."""
from __future__ import annotations
import asyncio
import json
import threading
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.ai import orchestrator, runs, suggestions, llm, event_queue

router = APIRouter()


def build_llm_clients() -> dict:
    """Production: one Anthropic-backed client shared by all agents.
    Tests monkeypatch this to inject stub LLMClient instances."""
    c = llm.LLMClient()
    return {"Coordinator": c, "PolishAgent": c, "ExperienceAgent": c}


# ---- POST /api/ai/run ---------------------------------------------------

class RunRequest(BaseModel):
    resumeId: str
    userInput: str
    selection: list = []
    chatHistory: list = []


@router.post("/run")
def post_run(req: RunRequest):
    """Dispatch orchestration to a daemon thread and return runId immediately.
    The SSE consumer at GET /runs/{runId}/events tails the event queue we
    open here — and which the orchestrator pushes events to in real time."""
    # Verify resume exists before allocating a run + spawning thread:
    from services.ai.tools import read_tools
    if read_tools.get_current_resume(req.resumeId) is None:
        raise HTTPException(status_code=404, detail=f"resume {req.resumeId} not found")

    # Allocate run + queue NOW, before spawning the worker, so the SSE
    # consumer can attach immediately if it races us.
    run_id = runs.create({
        "resume_id": req.resumeId, "user_input": req.userInput,
        "selection": req.selection, "chat_history": req.chatHistory,
    })
    event_queue.open(run_id)

    clients = build_llm_clients()

    def _worker():
        try:
            orchestrator.run_orchestration(
                resume_id=req.resumeId,
                user_input=req.userInput,
                selection=req.selection,
                chat_history=req.chatHistory,
                clients=clients,
                run_id=run_id,            # use pre-allocated id
            )
        except Exception:
            # Orchestrator already wrote run.error to the queue + persisted
            # status='error'; nothing more to do here.
            pass

    threading.Thread(target=_worker, daemon=True, name=f"ai-run-{run_id}").start()
    return {"runId": run_id}


# ---- GET /api/ai/runs/{runId}/events ------------------------------------

# Per-event-loop helper: read from a thread-safe queue without blocking the
# asyncio loop. asyncio.to_thread runs queue.get in a default executor.
_QUEUE_GET_TIMEOUT_S = 0.5    # poll cadence — gives us responsive shutdown
_TOTAL_STREAM_TIMEOUT_S = 120 # absolute cap; orchestrator's own 60s cap is tighter


@router.get("/runs/{run_id}/events")
async def get_run_events(run_id: str):
    """Live SSE: tail the per-run event_queue and yield events to the client.

    Exits on:
      - CLOSE_SENTINEL from event_queue.close() (orchestrator finished)
      - _TOTAL_STREAM_TIMEOUT_S elapsed (defensive — catches stuck runs)
      - Client disconnect (StreamingResponse handles this; the loop will
        get cancelled and the queue may leak slightly until the orchestrator
        closes it. Acceptable for v0 single-user.)
    """
    q = event_queue.get_queue(run_id)
    if q is None:
        # Queue not found — run was GC'd past the 5-minute grace period
        # (event_queue.gc removes only after `closed_at + 5min`). For runs
        # that finished moments before this attach, the queue still exists
        # with the sentinel queued, and we go through the live path below
        # which yields all queued events + sentinel + exits cleanly.
        state = runs.load(run_id)
        if state is None:
            raise HTTPException(status_code=404, detail="run not found")
        return StreamingResponse(_replay_from_state(run_id, state),
                                  media_type="text/event-stream")

    started_at = time.monotonic()

    async def gen():
        while True:
            if time.monotonic() - started_at > _TOTAL_STREAM_TIMEOUT_S:
                yield _sse("run.error", {"runId": run_id, "error": "stream_timeout"})
                return
            try:
                ev = await asyncio.to_thread(q.get, True, _QUEUE_GET_TIMEOUT_S)
            except Exception:
                # queue.Empty after timeout — loop and re-check overall timeout
                continue
            if ev == event_queue.CLOSE_SENTINEL:
                return
            yield _sse(ev["type"], ev["data"])

    return StreamingResponse(gen(), media_type="text/event-stream")


def _replay_from_state(run_id: str, state: dict):
    """Synthesize an SSE stream from persisted run state + suggestions.
    Used when the SSE consumer attaches AFTER the run already finished and
    the queue has been GC'd. One-shot, exits immediately."""
    yield _sse("run.started", {"runId": run_id, "createdAt": state.get("created_at")})
    decision = state.get("coordinator_decision") or {}
    if decision.get("kind") == "answer":
        yield _sse("agent.narration", {"agentId": "Coordinator", "text": decision.get("text", "")})
    elif decision.get("kind") == "dispatch":
        agent = decision["target"]
        yield _sse("agent.started", {"agentId": agent, "lockedBlockIds": [decision["focus"]]})
        for sid in state.get("applied_suggestion_ids", []):
            s = suggestions.get(state["resume_id"], sid)
            if s:
                yield _sse("suggestion.streamed", {"suggestion": s})
        yield _sse("agent.completed", {"agentId": agent, "runId": run_id})
    yield _sse("run.completed", {
        "runId": run_id,
        "suggestionIds": state.get("applied_suggestion_ids", []),
        "status": state.get("status"),
    })


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ---- GET /api/ai/suggestions --------------------------------------------

@router.get("/suggestions")
def list_suggestions(
    resumeId: str = Query(...),
    status: Optional[str] = Query(None, description="Comma-separated statuses to include."),
):
    if status:
        status_set = {s.strip() for s in status.split(",") if s.strip()}
        items = suggestions.list_for_resume(resumeId, status_filter=status_set)
    else:
        items = suggestions.list_for_resume(resumeId)
    return {"suggestions": items}


# ---- POST /api/ai/suggestions/{id}/status -------------------------------

class StatusRequest(BaseModel):
    status: str


@router.post("/suggestions/{suggestion_id}/status")
def post_status(suggestion_id: str, body: StatusRequest, request: Request):
    if body.status not in {"pending", "accepted", "rejected", "superseded"}:
        raise HTTPException(status_code=400, detail="invalid status")
    # Find which resume the suggestion belongs to:
    sug = _find_suggestion(suggestion_id)
    if sug is None:
        raise HTTPException(status_code=404, detail="suggestion not found")
    return suggestions.set_status(sug["resumeId"], suggestion_id, body.status)


def _find_suggestion(suggestion_id: str):
    """Scan all resumes' sidecars for this id. v0 single-user: O(N) is fine."""
    if not suggestions.RESUMES_DIR.exists():
        return None
    for sidecar in suggestions.RESUMES_DIR.glob("*.suggestions.json"):
        rid = sidecar.name.replace(".suggestions.json", "")
        s = suggestions.get(rid, suggestion_id)
        if s is not None:
            return s
    return None
```

- [ ] **Step 4: Register router in `api/main.py`**

Add after the `jobs_router` line:

```python
from api.routes.ai import router as ai_router
app.include_router(ai_router, prefix="/api/ai", tags=["ai"])
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/api/test_ai_routes.py -v 2>&1 | tail -10
```
Expected: `7 passed` (run + suggestions + status idempotent + status conflict + live SSE + replay-after-close + replay-after-gc).

- [ ] **Step 6: Run the FULL backend test suite — must be green**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/ -v 2>&1 | tail -10
```
Expected: all backend tests green (suggestions + read_tools + write_tools + context + llm + agents + runs + orchestrator + ai routes + jobs routes).

- [ ] **Step 7: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add api/routes/ai.py api/main.py tests/api/test_ai_routes.py
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: API routes (POST /run async dispatch, live SSE /events, GET /suggestions, POST /status)"
```

---

## Task 12: Frontend — UndoStack widening + `_aiApplyTransaction` + dispatch

**Files:**
- Modify: `frontend/src/components/resume/v2/types.ts` — add `'ai-apply'` to `UpdateOriginType`
- Modify: `frontend/src/components/resume/v2/store/undo-stack.ts`
- Modify: `frontend/src/components/resume/v2/store/useResumeStore.ts`
- Create: `frontend/src/components/resume/v2/store/__tests__/aiApplyTransaction.test.ts`

- [ ] **Step 0: Add `'ai-apply'` to `UpdateOriginType` (additive, ~1 line)**

In `frontend/src/components/resume/v2/types.ts` find the existing `UpdateOriginType` union (around lines 160-168) and add the new value:

```typescript
export type UpdateOriginType =
  | 'tiptap'
  | 'ai-rewrite'
  | 'ai-apply'        // ★ NEW (v0 AI integration): used by applySuggestion path
  | 'undo'
  | 'redo'
  | 'drag-reorder'
  | 'paste'
  | 'load'
  | 'remote';
```

Run `npx tsc --noEmit` after — should add 0 new errors. (Existing `makeOrigin('ai-rewrite')` call sites unchanged; new value is additive.)

Per spec § 8: three additive extensions only. Widen `UndoEntry` type with optional `kind/runId/suggestionIds`; add `_undoSuppressed` flag; add `_aiApplyTransaction` helper; add `_registerAiApplyUndoCallback` + dispatch in `undo()`/`redo()` with precheck. NO change to `_pushUndo`'s existing semantics outside the early-return when suppressed. NO change to existing structural undo entries.

- [ ] **Step 1: Write failing test**

`frontend/src/components/resume/v2/store/__tests__/aiApplyTransaction.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useResumeStore, _pushUndo, _aiApplyTransaction, _registerAiApplyUndoCallback } from '../useResumeStore';
import type { ResumeDoc } from '../../types';

const FIXTURE: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: '', meta: '', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
    ]},
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(FIXTURE), bulletMeta: {} });
  useResumeStore.getState()._undo.clear();
  _registerAiApplyUndoCallback(null as unknown as never); // reset
});

describe('_aiApplyTransaction', () => {
  it('snapshots before, suppresses inner _pushUndo, pushes ONE entry with metadata', () => {
    const result = _aiApplyTransaction(
      'aiApply:single',
      { runId: 'run_1' },
      () => {
        _pushUndo('innerStructural');   // would normally push; should be suppressed
        useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'NEW' } }));
        return { appliedSuggestionIds: ['sug_a'], mutated: true };
      },
    );
    expect(result.mutated).toBe(true);
    expect(result.appliedSuggestionIds).toEqual(['sug_a']);
    // Undo stack has exactly ONE entry, with kind='aiApply' and runId/suggestionIds:
    const stack = useResumeStore.getState()._undo;
    expect(stack.canUndo()).toBe(true);
    // popPast and inspect:
    const past = stack.popPast()!;
    expect(past.label).toBe('aiApply:single');
    expect(past.kind).toBe('aiApply');
    expect(past.runId).toBe('run_1');
    expect(past.suggestionIds).toEqual(['sug_a']);
    // The doc snapshot is the BEFORE state (title was empty, not 'NEW'):
    expect(past.doc.title).toBe('');
  });

  it('skips push when fn returns mutated=false', () => {
    _aiApplyTransaction('aiApply:noop', { runId: 'r' }, () => ({
      appliedSuggestionIds: [], mutated: false,
    }));
    expect(useResumeStore.getState()._undo.canUndo()).toBe(false);
  });

  it('skips push when appliedSuggestionIds is empty even if mutated=true', () => {
    _aiApplyTransaction('aiApply:none-applied', { runId: 'r' }, () => {
      // This shouldn't happen in practice but the guard is defensive:
      return { appliedSuggestionIds: [], mutated: true };
    });
    expect(useResumeStore.getState()._undo.canUndo()).toBe(false);
  });

  it('rolls back resume on fn throw and does NOT push undo', () => {
    expect(() =>
      _aiApplyTransaction('aiApply:throws', { runId: 'r' }, () => {
        useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'PARTIAL' } }));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    // resume is rolled back to BEFORE:
    expect(useResumeStore.getState().resume!.title).toBe('');
    expect(useResumeStore.getState()._undo.canUndo()).toBe(false);
  });

  it('Cmd+Z (undo) restores from snapshot AND notifies suggestion callback with "undo"', () => {
    const calls: any[] = [];
    _registerAiApplyUndoCallback(((ids, dir) => {
      calls.push({ ids, dir });
      return undefined;
    }) as unknown as never);
    _aiApplyTransaction('aiApply:1', { runId: 'r' }, () => {
      useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'AFTER' } }));
      return { appliedSuggestionIds: ['sug_1', 'sug_2'], mutated: true };
    });
    expect(useResumeStore.getState().resume!.title).toBe('AFTER');
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume!.title).toBe('');
    expect(calls).toEqual([{ ids: ['sug_1', 'sug_2'], dir: 'undo' }]);
  });

  it('redo precheck: callback returning false aborts redo (doc + future stack untouched)', () => {
    _registerAiApplyUndoCallback(((_ids, dir) => {
      if (dir === 'redo:precheck') return false;
      return undefined;
    }) as unknown as never);
    _aiApplyTransaction('aiApply:1', { runId: 'r' }, () => {
      useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'AFTER' } }));
      return { appliedSuggestionIds: ['s1'], mutated: true };
    });
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume!.title).toBe('');
    // Now redo — precheck refuses:
    useResumeStore.getState().redo();
    // Doc not swapped:
    expect(useResumeStore.getState().resume!.title).toBe('');
    // Future entry preserved (canRedo still true):
    expect(useResumeStore.getState()._undo.canRedo()).toBe(true);
  });

  it('redo precheck: callback returning true (or no-op) proceeds and notifies "redo"', () => {
    const calls: string[] = [];
    _registerAiApplyUndoCallback(((_ids, dir) => {
      calls.push(dir);
      return dir === 'redo:precheck' ? true : undefined;
    }) as unknown as never);
    _aiApplyTransaction('aiApply:1', { runId: 'r' }, () => {
      useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'AFTER' } }));
      return { appliedSuggestionIds: ['s1'], mutated: true };
    });
    useResumeStore.getState().undo();
    useResumeStore.getState().redo();
    expect(useResumeStore.getState().resume!.title).toBe('AFTER');
    expect(calls).toContain('undo');
    expect(calls).toContain('redo:precheck');
    expect(calls).toContain('redo');
  });
});

describe('regression: existing _pushUndo unchanged when not suppressed', () => {
  it('regular structural _pushUndo still works exactly as before', () => {
    _pushUndo('structuralOp');
    useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'X' } }));
    expect(useResumeStore.getState()._undo.canUndo()).toBe(true);
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume!.title).toBe('');
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/components/resume/v2/store/__tests__/aiApplyTransaction.test.ts 2>&1 | tail -15
```
Expected: import errors for `_aiApplyTransaction` / `_registerAiApplyUndoCallback`.

- [ ] **Step 3: Modify `undo-stack.ts` — widen UndoEntry type**

`frontend/src/components/resume/v2/store/undo-stack.ts`:

```typescript
// frontend/src/components/resume/v2/store/undo-stack.ts
import type { ResumeDoc } from '../types';

export type UndoEntry = {
  doc: ResumeDoc;
  label: string;       // 'moveBullet', 'deleteEntry', etc.
  // ★ Optional fields added in v0 AI integration (spec § 8.3). Only set by
  //   _aiApplyTransaction. Existing _pushUndo callers leave these undefined
  //   so behavior is bit-for-bit identical to pre-v0-AI for structural undo.
  kind?: 'aiApply';
  runId?: string;
  suggestionIds?: string[];
};

const MAX_DEPTH = 100;

export class UndoStack {
  private past: UndoEntry[] = [];
  private future: UndoEntry[] = [];

  push(entry: UndoEntry): void {
    this.past.push(entry);
    if (this.past.length > MAX_DEPTH) this.past.shift();
    this.future = [];   // any new structural op clears redo
  }

  popPast(): UndoEntry | null {
    return this.past.pop() ?? null;
  }

  pushFuture(entry: UndoEntry): void {
    this.future.push(entry);
  }

  popFuture(): UndoEntry | null {
    return this.future.pop() ?? null;
  }

  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }
  clear(): void { this.past = []; this.future = []; }
}
```

- [ ] **Step 4: Modify `useResumeStore.ts` — add suppression, transaction, callback, dispatch**

Surgical edits to `frontend/src/components/resume/v2/store/useResumeStore.ts`:

**Edit 1** — replace the existing `_pushUndo` function (currently at the bottom of the file):

```typescript
// ★ NEW (additive, non-breaking): module-local suppression flag for AI apply.
let _undoSuppressed = false;

/** Internal helper for tests: push current state to undo stack with a label.
 *  Real structural actions (Task 12) call this. */
export function _pushUndo(label: string): void {
  if (_undoSuppressed) return;        // ★ NEW: in-transaction, suppress
  const r = useResumeStore.getState().resume;
  if (!r) return;
  useResumeStore.getState()._undo.push({ doc: r, label });
}
```

**Edit 2** — add `_aiApplyTransaction`, callback registry, and `AiApplyUndoCallback` type at the bottom of the file (right after the modified `_pushUndo`):

```typescript
// ★ AI apply transaction infrastructure (spec § 8.2 / § 8.4). All additive —
//   no change to existing exports or store actions.

export type AiTxResult = {
  appliedSuggestionIds: string[];
  mutated: boolean;
};

export type AiApplyUndoDirection = 'undo' | 'redo' | 'redo:precheck';
export type AiApplyUndoCallback = (
  suggestionIds: string[],
  direction: AiApplyUndoDirection,
) => boolean | void;

let _onAiApplyUndo: AiApplyUndoCallback | null = null;

/** Called once at module init by useSuggestionStore (Task 14). Pass null to
 *  unregister (used in tests). */
export function _registerAiApplyUndoCallback(cb: AiApplyUndoCallback | null): void {
  _onAiApplyUndo = cb;
}

/** Wrap a multi-action AI apply so:
 *    - inner _pushUndo calls are suppressed,
 *    - one composite undo entry is pushed at the end (containing the BEFORE
 *      ResumeDoc snapshot + suggestion ids),
 *    - the resume is rolled back to before-state if `fn` throws. */
export function _aiApplyTransaction(
  label: string,
  meta: { runId: string },
  fn: () => AiTxResult,
): AiTxResult {
  const r = useResumeStore.getState().resume;
  if (!r) return { appliedSuggestionIds: [], mutated: false };
  const snapshotBefore = r;

  const wasSuppressed = _undoSuppressed;
  _undoSuppressed = true;
  let result: AiTxResult;
  try {
    result = fn();
  } catch (err) {
    // Atomic-ish rollback: restore resume, do NOT push undo, propagate.
    useResumeStore.setState({ resume: snapshotBefore, bulletMeta: {} });
    throw err;
  } finally {
    _undoSuppressed = wasSuppressed;
  }

  // Skip undo push if nothing actually applied (per § 8.2 guard).
  if (!result.mutated || result.appliedSuggestionIds.length === 0) return result;

  useResumeStore.getState()._undo.push({
    doc: snapshotBefore,
    label,
    kind: 'aiApply',
    runId: meta.runId,
    suggestionIds: result.appliedSuggestionIds,
  });
  return result;
}
```

**Edit 3** — extend `undo()` and `redo()` (currently lines ~129-145 in useResumeStore.ts) with the AI dispatch hook (~5 lines per direction):

```typescript
    undo: () => {
      const r = get().resume;
      if (!r) return;
      const past = get()._undo.popPast();
      if (!past) return;
      // ★ Future entry preserves the FULL shape (incl. AI metadata) for symmetric redo:
      get()._undo.pushFuture({ ...past, doc: r, label: 'redo:' + past.label });
      set({ resume: past.doc, bulletMeta: {} });
      // ★ NEW: notify suggestion store if this was an AI apply
      if (past.kind === 'aiApply' && past.suggestionIds && _onAiApplyUndo) {
        _onAiApplyUndo(past.suggestionIds, 'undo');
      }
    },

    redo: () => {
      const r = get().resume;
      if (!r) return;
      const fut = get()._undo.popFuture();
      if (!fut) return;
      // ★ AI precheck FIRST — before any doc swap or stack mutation:
      if (fut.kind === 'aiApply' && fut.suggestionIds && _onAiApplyUndo) {
        const allowed = _onAiApplyUndo(fut.suggestionIds, 'redo:precheck');
        if (allowed === false) {
          get()._undo.pushFuture(fut);   // restore: redo is non-destructive on block
          return;
        }
      }
      // ★ Past entry preserves the FULL shape so chains of undo/redo keep AI metadata:
      get()._undo.push({ ...fut, doc: r, label: 'undo:' + fut.label });
      set({ resume: fut.doc, bulletMeta: {} });
      if (fut.kind === 'aiApply' && fut.suggestionIds && _onAiApplyUndo) {
        _onAiApplyUndo(fut.suggestionIds, 'redo');
      }
    },
```

- [ ] **Step 5: Run new test + full v2 suite (regression net)**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/components/resume/v2/store/__tests__/aiApplyTransaction.test.ts 2>&1 | tail
# Expected: all aiApplyTransaction tests pass
npx vitest run src/components/resume/v2 2>&1 | tail -3
# Expected: 223+ passed (no regression in any v2 test)
```

- [ ] **Step 6: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add frontend/src/components/resume/v2/store/undo-stack.ts frontend/src/components/resume/v2/store/useResumeStore.ts frontend/src/components/resume/v2/store/__tests__/aiApplyTransaction.test.ts
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: _aiApplyTransaction + _undoSuppressed + undo/redo dispatch (additive)"
```

---

## Task 13: Frontend — `forcedId` on insertBullet/insertEntry

**Files:**
- Modify: `frontend/src/components/resume/v2/store/actions/insertBlock.ts`
- Modify: `frontend/src/components/resume/v2/store/actions/structural.test.ts`

Optional trailing parameters per spec § 0.5 rule #7. Existing call sites (drag, keyboard, slash) pass nothing → behavior unchanged. AI apply (Task 16) passes `Suggestion.insertedBlock.id`.

- [ ] **Step 1: Add failing tests for forcedId behavior**

Open `frontend/src/components/resume/v2/store/actions/structural.test.ts` and add at the bottom (just inside the closing `})` of the outer describe — examine existing structure first):

```typescript
describe('forcedId (additive — for AI apply use only)', () => {
  it('insertBullet uses forcedId when provided', () => {
    const id = insertBullet('e1', 1, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'), undefined, 'forced-bid-1');
    expect(id).toBe('forced-bid-1');
    const r = useResumeStore.getState().resume!;
    const e1 = r.sections[0].entries.find(e => e.id === 'e1')!;
    expect(e1.bullets.find(b => b.id === 'forced-bid-1')).toBeTruthy();
  });

  it('insertBullet generates id when forcedId omitted (existing behavior unchanged)', () => {
    const id = insertBullet('e1', 0, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);  // uuid v4
  });

  it('insertEntry uses forcedEntryId + forcedFirstBulletId when provided', () => {
    const { entryId, firstBulletId } = insertEntry('s1', 0, makeOrigin('paste'), 'forced-eid', 'forced-fid');
    expect(entryId).toBe('forced-eid');
    expect(firstBulletId).toBe('forced-fid');
    const r = useResumeStore.getState().resume!;
    expect(r.sections[0].entries[0].id).toBe('forced-eid');
    expect(r.sections[0].entries[0].bullets[0].id).toBe('forced-fid');
  });

  it('insertEntry generates ids when forced params omitted (existing behavior unchanged)', () => {
    const { entryId, firstBulletId } = insertEntry('s1', 0, makeOrigin('paste'));
    expect(entryId).toMatch(/^[0-9a-f]{8}-/i);
    expect(firstBulletId).toMatch(/^[0-9a-f]{8}-/i);
  });
});
```

(Confirm `makeOrigin` is already imported at the top of `structural.test.ts`; if not, add `import { makeOrigin } from '../source-of-truth';` near the existing imports.)

- [ ] **Step 2: Run failing test**

```bash
npx vitest run src/components/resume/v2/store/actions/structural.test.ts -t "forcedId" 2>&1 | tail
```
Expected: insertBullet returns generated id (not 'forced-bid-1') → first test fails.

- [ ] **Step 3: Modify `insertBlock.ts` — add optional forcedId params**

Replace the `insertBullet` and `insertEntry` functions in `frontend/src/components/resume/v2/store/actions/insertBlock.ts` with:

```typescript
export function insertBullet(
  entryId: BlockId,
  indexInEntry: number,
  contentDoc: BulletBlock['content'],
  origin: UpdateOrigin,
  /**
   * Optional kind for the new bullet. Defaults to 'bullet'.
   */
  kind: 'bullet' | 'plain' = 'bullet',
  /**
   * ★ Optional v0-AI extension (spec § 0.5 rule #7): force a specific id for the
   * new bullet. Used by AI apply to keep `Suggestion.insertedBlock.id` consistent
   * with the persisted block id across reloads. Existing callers (drag,
   * keyboard, slash) omit this and continue to get a freshly-minted UUID.
   */
  forcedId?: BlockId,
): BlockId {
  const r = useResumeStore.getState().resume;
  if (!r) throw new Error('No resume hydrated');
  _pushUndo('insertBullet');
  const newBulletId = forcedId ?? newId();
  const newBullet: BulletBlock = kind === 'plain'
    ? { id: newBulletId, content: contentDoc, kind: 'plain' }
    : { id: newBulletId, content: contentDoc };
  const next = r.sections.map(s => ({
    ...s,
    entries: s.entries.map(e => {
      if (e.id !== entryId) return e;
      const out = [...e.bullets];
      out.splice(Math.min(indexInEntry, out.length), 0, newBullet);
      return { ...e, bullets: out };
    }),
  }));
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
  return newBullet.id;
}

export type InsertEntryResult = { entryId: BlockId; firstBulletId: BlockId };

export function insertEntry(
  sectionId: BlockId,
  indexInSection: number,
  origin: UpdateOrigin,
  /**
   * ★ Optional v0-AI extension (spec § 0.5 rule #7).
   */
  forcedEntryId?: BlockId,
  forcedFirstBulletId?: BlockId,
): InsertEntryResult {
  const r = useResumeStore.getState().resume;
  if (!r) throw new Error('No resume hydrated');
  _pushUndo('insertEntry');
  const newEntryId = forcedEntryId ?? newId();
  const firstBulletId = forcedFirstBulletId ?? newId();
  const newEntry: EntryBlock = {
    id: newEntryId,
    title: '',
    meta: '',
    bullets: [{ id: firstBulletId, content: { type: 'doc', content: [{ type: 'paragraph' }] } }],
  };
  const next = r.sections.map(s => {
    if (s.id !== sectionId) return s;
    const out = [...s.entries];
    out.splice(Math.min(indexInSection, out.length), 0, newEntry);
    return { ...s, entries: out };
  });
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
  return { entryId: newEntry.id, firstBulletId };
}
```

- [ ] **Step 4: Run new tests + full v2 suite**

```bash
npx vitest run src/components/resume/v2/store/actions/structural.test.ts 2>&1 | tail
# Expected: all forcedId tests pass + all existing structural tests still pass
npx vitest run src/components/resume/v2 2>&1 | tail -3
# Expected: ≥ baseline test count (Task 0 step 2 recorded number) + 4 new
```

- [ ] **Step 5: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add frontend/src/components/resume/v2/store/actions/insertBlock.ts frontend/src/components/resume/v2/store/actions/structural.test.ts
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: optional forcedId on insertBullet/insertEntry (additive)"
```

---

## Task 14: Frontend — `useSuggestionStore` + `useAILockStore`

**Files:**
- Create: `frontend/src/stores/aiSuggestion.ts`
- Create: `frontend/src/stores/aiLock.ts`
- Create: `frontend/src/stores/__tests__/aiSuggestion.test.ts`

`useSuggestionStore` holds the in-memory mirror of pending/streaming Suggestions for the current resume, hydrates from `GET /api/ai/suggestions`, exposes `accept(id)` / `reject(id)` / `acceptAll(runId, scope?)` (these are wired to the apply layer in Task 16; for Task 14 they're just stubs that update local state + POST status).

`useAILockStore` holds `lockedBlockIds: Set<BlockId>` written by SSE event handlers (Task 17).

- [ ] **Step 1: Write failing tests for suggestion store hydration + status flips**

`frontend/src/stores/__tests__/aiSuggestion.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSuggestionStore } from '../aiSuggestion';

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  useSuggestionStore.setState({ byId: {}, byRun: {} });
});

const sampleSuggestion = {
  id: 'sug_1', runId: 'run_1', agentId: 'PolishAgent', resumeId: 'r1',
  status: 'pending', createdAt: 1,
  source: { kind: 'agent', agentId: 'PolishAgent', runId: 'run_1' },
  op: 'update',
  field: { kind: 'entry.title', id: 'e1' },
  before: 'old', after: 'new',
};

describe('useSuggestionStore.hydrate', () => {
  it('fetches GET /api/ai/suggestions and indexes into byId + byRun', async () => {
    mockFetch.mockResolvedValue({
      ok: true, json: async () => ({ suggestions: [sampleSuggestion] }),
    });
    await useSuggestionStore.getState().hydrate('r1');
    const state = useSuggestionStore.getState();
    expect(state.byId['sug_1']).toEqual(sampleSuggestion);
    expect(state.byRun['run_1']).toEqual(['sug_1']);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/ai/suggestions'),
      expect.anything(),
    );
  });
});

describe('useSuggestionStore.markStatusLocally', () => {
  it('flips status + clears non-target timestamps', () => {
    useSuggestionStore.setState({
      byId: { sug_1: { ...sampleSuggestion, status: 'accepted', appliedAt: 100 } },
      byRun: { run_1: ['sug_1'] },
    });
    useSuggestionStore.getState().markStatusLocally('sug_1', 'pending');
    const s = useSuggestionStore.getState().byId['sug_1'];
    expect(s.status).toBe('pending');
    expect(s.appliedAt).toBeUndefined();
  });
});

describe('useSuggestionStore.allInRunArePending', () => {
  it('returns true only when every suggestion of the run is pending', () => {
    useSuggestionStore.setState({
      byId: {
        a: { ...sampleSuggestion, id: 'a', status: 'pending' },
        b: { ...sampleSuggestion, id: 'b', status: 'pending' },
      },
      byRun: { run_1: ['a', 'b'] },
    });
    expect(useSuggestionStore.getState().allInRunArePending(['a', 'b'])).toBe(true);
    useSuggestionStore.setState({
      byId: {
        a: { ...sampleSuggestion, id: 'a', status: 'pending' },
        b: { ...sampleSuggestion, id: 'b', status: 'rejected' },
      },
      byRun: { run_1: ['a', 'b'] },
    });
    expect(useSuggestionStore.getState().allInRunArePending(['a', 'b'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/stores/__tests__/aiSuggestion.test.ts 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `frontend/src/stores/aiSuggestion.ts`**

```typescript
// frontend/src/stores/aiSuggestion.ts
import { create } from 'zustand';

// Mirror types from backend services/ai/types.py — discriminated union on `op`.
type BlockId = string;
type TipTapDoc = unknown;

export type EditableField =
  | { kind: 'header.name' }
  | { kind: 'header.contact'; index: number }
  | { kind: 'section.heading'; id: BlockId }
  | { kind: 'entry.title'; id: BlockId }
  | { kind: 'entry.meta'; id: BlockId }
  | { kind: 'bullet.content'; id: BlockId };

export type BlockSnapshot =
  | { kind: 'bullet'; id: BlockId; content: TipTapDoc }
  | { kind: 'entry'; id: BlockId; title: string; meta: string; bullets: BlockSnapshot[] }
  | { kind: 'section'; id: BlockId; heading: string; role: string; entries: BlockSnapshot[] };

export type SuggestionStatus = 'streaming' | 'pending' | 'accepted' | 'rejected' | 'superseded';

interface Base {
  id: string;
  runId: string;
  agentId: string;
  resumeId: string;
  status: SuggestionStatus;
  createdAt: number;
  appliedAt?: number;
  rejectedAt?: number;
  supersededAt?: number;
  source: { kind: 'agent'; agentId: string; runId: string };
}

export type UpdateSuggestion = Base & {
  op: 'update'; field: EditableField; before: TipTapDoc | string; after: TipTapDoc | string;
};
export type InsertSuggestion = Base & {
  op: 'insert'; parentId: BlockId; atIndex: number; beforeChildIds: BlockId[]; insertedBlock: BlockSnapshot;
};
export type DeleteSuggestion = Base & {
  op: 'delete'; parentId: BlockId; blockId: BlockId; beforeChildIds: BlockId[]; deletedBlock: BlockSnapshot;
};
export type MoveSuggestion = Base & {
  op: 'move'; blockId: BlockId; fromParentId: BlockId; fromIndex: number; fromBeforeChildIds: BlockId[];
  toParentId: BlockId; toIndex: number; toBeforeChildIds: BlockId[];
};
export type Suggestion = UpdateSuggestion | InsertSuggestion | DeleteSuggestion | MoveSuggestion;

export function suggestionBlockId(s: Suggestion): BlockId {
  switch (s.op) {
    case 'update':
      // For header.name / header.contact, target is the header block; we
      // don't have its id at compile time so caller resolves via current resume.
      return 'id' in s.field ? s.field.id : '<header>';
    case 'insert': return s.parentId;
    case 'delete': return s.blockId;
    case 'move':   return s.blockId;
  }
}

interface SuggestionStoreState {
  byId: Record<string, Suggestion>;
  byRun: Record<string, string[]>;
  hydrate: (resumeId: string) => Promise<void>;
  upsert: (s: Suggestion) => void;
  markStatusLocally: (id: string, status: SuggestionStatus, ts?: number) => void;
  allInRunArePending: (suggestionIds: string[]) => boolean;
  postStatusToBackend: (id: string, status: SuggestionStatus) => Promise<{ok: boolean; current?: string; noop?: boolean}>;
}

export const useSuggestionStore = create<SuggestionStoreState>((set, get) => ({
  byId: {},
  byRun: {},

  hydrate: async (resumeId: string) => {
    const params = new URLSearchParams({ resumeId, status: 'pending,streaming' });
    const r = await fetch(`/api/ai/suggestions?${params}`);
    if (!r.ok) return;
    const body = await r.json();
    const byId: Record<string, Suggestion> = {};
    const byRun: Record<string, string[]> = {};
    for (const s of body.suggestions as Suggestion[]) {
      byId[s.id] = s;
      (byRun[s.runId] ||= []).push(s.id);
    }
    set({ byId, byRun });
  },

  upsert: (s: Suggestion) => set((st) => {
    const byId = { ...st.byId, [s.id]: s };
    const byRun = { ...st.byRun };
    if (!byRun[s.runId]?.includes(s.id)) {
      byRun[s.runId] = [...(byRun[s.runId] || []), s.id];
    }
    return { byId, byRun };
  }),

  markStatusLocally: (id: string, status: SuggestionStatus, ts?: number) => set((st) => {
    const cur = st.byId[id];
    if (!cur) return st;
    const updated: Suggestion = { ...cur, status };
    delete (updated as Base).appliedAt;
    delete (updated as Base).rejectedAt;
    delete (updated as Base).supersededAt;
    const t = ts ?? Date.now();
    if (status === 'accepted') (updated as Base).appliedAt = t;
    else if (status === 'rejected') (updated as Base).rejectedAt = t;
    else if (status === 'superseded') (updated as Base).supersededAt = t;
    return { ...st, byId: { ...st.byId, [id]: updated } };
  }),

  allInRunArePending: (ids: string[]) => {
    const map = get().byId;
    return ids.every((id) => map[id]?.status === 'pending');
  },

  postStatusToBackend: async (id: string, status: SuggestionStatus) => {
    const r = await fetch(`/api/ai/suggestions/${id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) return { ok: false };
    return r.json();
  },
}));
```

- [ ] **Step 4: Implement `frontend/src/stores/aiLock.ts`**

```typescript
// frontend/src/stores/aiLock.ts
import { create } from 'zustand';

type BlockId = string;

interface AILockStoreState {
  lockedBlockIds: Set<BlockId>;
  lock: (ids: BlockId[]) => void;
  unlock: (ids: BlockId[]) => void;
  isLocked: (id: BlockId) => boolean;
  clear: () => void;
}

export const useAILockStore = create<AILockStoreState>((set, get) => ({
  lockedBlockIds: new Set<BlockId>(),

  lock: (ids: BlockId[]) => set((s) => {
    const next = new Set(s.lockedBlockIds);
    for (const id of ids) next.add(id);
    return { lockedBlockIds: next };
  }),

  unlock: (ids: BlockId[]) => set((s) => {
    const next = new Set(s.lockedBlockIds);
    for (const id of ids) next.delete(id);
    return { lockedBlockIds: next };
  }),

  isLocked: (id: BlockId) => get().lockedBlockIds.has(id),

  clear: () => set({ lockedBlockIds: new Set<BlockId>() }),
}));
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/stores/__tests__/aiSuggestion.test.ts 2>&1 | tail
```
Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add frontend/src/stores/aiSuggestion.ts frontend/src/stores/aiLock.ts frontend/src/stores/__tests__/aiSuggestion.test.ts
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: useSuggestionStore + useAILockStore (Suggestion mirror + lock state)"
```

---

## Task 15: Frontend — `concurrencyCheck.ts` (op-specific)

**Files:**
- Create: `frontend/src/components/ai/concurrencyCheck.ts`
- Create: `frontend/src/components/ai/__tests__/concurrencyCheck.test.ts`

Op-specific concurrency check matching spec § 5.1's table — runs against current `useResumeStore` state at apply time. Pure function, no side effects.

- [ ] **Step 1: Write failing test**

`frontend/src/components/ai/__tests__/concurrencyCheck.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkSuggestion } from '../concurrencyCheck';
import type { ResumeDoc } from '../../resume/v2/types';
import type { Suggestion } from '@/stores/aiSuggestion';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'Fred', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: 'OldT', meta: 'OldM', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
        { id: 'b2', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
    ]},
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

const _base = {
  id: 'sug', runId: 'r', agentId: 'PolishAgent', resumeId: 'r',
  status: 'pending' as const, createdAt: 1,
  source: { kind: 'agent' as const, agentId: 'PolishAgent', runId: 'r' },
};

describe('checkSuggestion: update', () => {
  it('passes when current value matches before (string field)', () => {
    const s: Suggestion = { ..._base, op: 'update', field: { kind: 'entry.title', id: 'e1' }, before: 'OldT', after: 'NewT' };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: true });
  });

  it('fails when current value differs (user edited it)', () => {
    const s: Suggestion = { ..._base, op: 'update', field: { kind: 'entry.title', id: 'e1' }, before: 'Stale', after: 'New' };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: false, reason: 'before_mismatch' });
  });

  it('passes for bullet content via JSON-stringify equality', () => {
    const before = { type: 'doc', content: [{ type: 'paragraph' }] };
    const s: Suggestion = { ..._base, op: 'update', field: { kind: 'bullet.content', id: 'b1' }, before, after: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: true });
  });
});

describe('checkSuggestion: insert', () => {
  it('passes when parent.children matches beforeChildIds', () => {
    const s: Suggestion = { ..._base, op: 'insert', parentId: 'e1', atIndex: 1,
      beforeChildIds: ['b1', 'b2'],
      insertedBlock: { kind: 'bullet', id: 'NEW', content: { type: 'doc', content: [] } } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: true });
  });

  it('fails when parent.children differs', () => {
    const s: Suggestion = { ..._base, op: 'insert', parentId: 'e1', atIndex: 1,
      beforeChildIds: ['b1'],   // user added a bullet since emit time
      insertedBlock: { kind: 'bullet', id: 'NEW', content: { type: 'doc', content: [] } } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: false, reason: 'beforeChildIds_mismatch' });
  });

  it('fails when parent does not exist', () => {
    const s: Suggestion = { ..._base, op: 'insert', parentId: 'gone', atIndex: 0,
      beforeChildIds: [],
      insertedBlock: { kind: 'bullet', id: 'NEW', content: { type: 'doc', content: [] } } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: false, reason: 'parent_missing' });
  });
});

describe('checkSuggestion: delete', () => {
  it('passes when parent and target both exist + childIds match', () => {
    const s: Suggestion = { ..._base, op: 'delete', parentId: 'e1', blockId: 'b1',
      beforeChildIds: ['b1', 'b2'],
      deletedBlock: { kind: 'bullet', id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: true });
  });

  it('fails when block already deleted by user', () => {
    const s: Suggestion = { ..._base, op: 'delete', parentId: 'e1', blockId: 'gone',
      beforeChildIds: ['b1', 'b2'],
      deletedBlock: { kind: 'bullet', id: 'gone', content: { type: 'doc', content: [] } } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: false, reason: 'block_missing' });
  });
});

describe('checkSuggestion: move', () => {
  it('passes when both parents + childIds match', () => {
    const s: Suggestion = { ..._base, op: 'move', blockId: 'b1',
      fromParentId: 'e1', fromIndex: 0, fromBeforeChildIds: ['b1', 'b2'],
      toParentId: 'e1', toIndex: 1, toBeforeChildIds: ['b1', 'b2'] };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: true });
  });

  it('fails when fromParent gone', () => {
    const s: Suggestion = { ..._base, op: 'move', blockId: 'b1',
      fromParentId: 'gone', fromIndex: 0, fromBeforeChildIds: ['b1', 'b2'],
      toParentId: 'e1', toIndex: 0, toBeforeChildIds: ['b1', 'b2'] };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: false, reason: 'parent_missing' });
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npx vitest run src/components/ai/__tests__/concurrencyCheck.test.ts 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `frontend/src/components/ai/concurrencyCheck.ts`**

```typescript
// frontend/src/components/ai/concurrencyCheck.ts
import type { ResumeDoc, BlockId } from '../resume/v2/types';
import type { Suggestion } from '@/stores/aiSuggestion';

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: 'before_mismatch' | 'beforeChildIds_mismatch'
                       | 'parent_missing' | 'block_missing' | 'unknown_field' };

export function checkSuggestion(s: Suggestion, resume: ResumeDoc): CheckResult {
  switch (s.op) {
    case 'update': return _checkUpdate(s, resume);
    case 'insert': return _checkInsert(s, resume);
    case 'delete': return _checkDelete(s, resume);
    case 'move':   return _checkMove(s, resume);
  }
}

function _checkUpdate(s: Suggestion & { op: 'update' }, r: ResumeDoc): CheckResult {
  const cur = _readField(s.field, r);
  if (cur === undefined) return { ok: false, reason: 'unknown_field' };
  if (typeof cur === 'string') {
    return cur === s.before ? { ok: true } : { ok: false, reason: 'before_mismatch' };
  }
  // bullet content — JSON-stringify equality
  return JSON.stringify(cur) === JSON.stringify(s.before)
    ? { ok: true } : { ok: false, reason: 'before_mismatch' };
}

function _checkInsert(s: Suggestion & { op: 'insert' }, r: ResumeDoc): CheckResult {
  const childIds = _readChildIds(s.parentId, r);
  if (childIds === null) return { ok: false, reason: 'parent_missing' };
  return _arrEq(childIds, s.beforeChildIds)
    ? { ok: true } : { ok: false, reason: 'beforeChildIds_mismatch' };
}

function _checkDelete(s: Suggestion & { op: 'delete' }, r: ResumeDoc): CheckResult {
  const childIds = _readChildIds(s.parentId, r);
  if (childIds === null) return { ok: false, reason: 'parent_missing' };
  if (!_arrEq(childIds, s.beforeChildIds)) return { ok: false, reason: 'beforeChildIds_mismatch' };
  return childIds.includes(s.blockId) ? { ok: true } : { ok: false, reason: 'block_missing' };
}

function _checkMove(s: Suggestion & { op: 'move' }, r: ResumeDoc): CheckResult {
  const from = _readChildIds(s.fromParentId, r);
  const to = _readChildIds(s.toParentId, r);
  if (from === null || to === null) return { ok: false, reason: 'parent_missing' };
  if (!_arrEq(from, s.fromBeforeChildIds) || !_arrEq(to, s.toBeforeChildIds)) {
    return { ok: false, reason: 'beforeChildIds_mismatch' };
  }
  return { ok: true };
}

function _readField(f: Suggestion['field'] extends infer F ? F : never, r: ResumeDoc): string | object | undefined {
  // @ts-expect-error narrow at runtime
  switch (f.kind) {
    case 'header.name':     return r.header.name;
    case 'section.heading': return r.sections.find((s) => s.id === (f as any).id)?.heading;
    case 'entry.title': {
      for (const s of r.sections) {
        const e = s.entries.find((x) => x.id === (f as any).id);
        if (e) return e.title;
      }
      return undefined;
    }
    case 'entry.meta': {
      for (const s of r.sections) {
        const e = s.entries.find((x) => x.id === (f as any).id);
        if (e) return e.meta;
      }
      return undefined;
    }
    case 'bullet.content': {
      for (const s of r.sections) for (const e of s.entries) {
        const b = e.bullets.find((x) => x.id === (f as any).id);
        if (b) return b.content;
      }
      return undefined;
    }
  }
  return undefined;
}

function _readChildIds(parentId: BlockId, r: ResumeDoc): BlockId[] | null {
  // The "parent" can be: a section (children = entries), or an entry (children = bullets).
  for (const s of r.sections) {
    if (s.id === parentId) return s.entries.map((e) => e.id);
    for (const e of s.entries) {
      if (e.id === parentId) return e.bullets.map((b) => b.id);
    }
  }
  return null;
}

function _arrEq(a: BlockId[], b: BlockId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/ai/__tests__/concurrencyCheck.test.ts 2>&1 | tail
```
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add frontend/src/components/ai/concurrencyCheck.ts frontend/src/components/ai/__tests__/concurrencyCheck.test.ts
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: op-specific concurrency check (frontend, pure function)"
```

---

## Task 16: Frontend — `applySuggestion.ts` (per-op apply via transaction)

**Files:**
- Create: `frontend/src/components/ai/applySuggestion.ts`
- Create: `frontend/src/components/ai/__tests__/applySuggestion.test.ts`

The frontend apply layer. Per spec § 5.2 + § 8.5: each op composes existing store actions inside `_aiApplyTransaction`. Single accept = one transaction. Batch accept = one transaction wrapping the loop.

- [ ] **Step 1: Write failing test**

`frontend/src/components/ai/__tests__/applySuggestion.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { applySuggestion, applyAllInRun } from '../applySuggestion';
import type { ResumeDoc } from '@/components/resume/v2/types';

const FIXTURE: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'Fred', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: 'OldT', meta: 'OldM', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
    ]},
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

const _b = {
  id: 'sug', runId: 'r', agentId: 'PolishAgent', resumeId: 'r',
  status: 'pending' as const, createdAt: 1,
  source: { kind: 'agent' as const, agentId: 'PolishAgent', runId: 'r' },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(FIXTURE), bulletMeta: {} });
  useResumeStore.getState()._undo.clear();
  useSuggestionStore.setState({ byId: {}, byRun: {} });
  // Stub fetch to no-op (we test status post separately):
  global.fetch = (() => Promise.resolve({ ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
});

describe('applySuggestion: update entry.title', () => {
  it('mutates store and pushes ONE aiApply undo entry', async () => {
    const s: Suggestion = { ..._b, id: 'sug_1', op: 'update',
      field: { kind: 'entry.title', id: 'e1' }, before: 'OldT', after: 'NewT' };
    useSuggestionStore.getState().upsert(s);
    const result = await applySuggestion('sug_1');
    expect(result.ok).toBe(true);
    const r = useResumeStore.getState().resume!;
    expect(r.sections[0].entries[0].title).toBe('NewT');
    // Undo restores:
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume!.sections[0].entries[0].title).toBe('OldT');
  });
});

describe('applySuggestion: update bullet.content', () => {
  it('uses existing updateBullet action', async () => {
    const before = { type: 'doc', content: [{ type: 'paragraph' }] };
    const after = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'X' }] }] };
    const s: Suggestion = { ..._b, id: 'sug_2', op: 'update',
      field: { kind: 'bullet.content', id: 'b1' }, before, after };
    useSuggestionStore.getState().upsert(s);
    const result = await applySuggestion('sug_2');
    expect(result.ok).toBe(true);
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets[0].content).toEqual(after);
  });
});

describe('applySuggestion: insert bullet uses forcedId', () => {
  it('persisted block id matches Suggestion.insertedBlock.id', async () => {
    const s: Suggestion = { ..._b, id: 'sug_3', op: 'insert',
      parentId: 'e1', atIndex: 1, beforeChildIds: ['b1'],
      insertedBlock: { kind: 'bullet', id: 'forced-bullet-id', content: { type: 'doc', content: [{ type: 'paragraph' }] } } };
    useSuggestionStore.getState().upsert(s);
    await applySuggestion('sug_3');
    const bullets = useResumeStore.getState().resume!.sections[0].entries[0].bullets;
    expect(bullets[1].id).toBe('forced-bullet-id');
  });
});

describe('applySuggestion: superseded when before differs', () => {
  it('does not mutate, marks status superseded, returns ok:false', async () => {
    const s: Suggestion = { ..._b, id: 'sug_4', op: 'update',
      field: { kind: 'entry.title', id: 'e1' }, before: 'WRONG', after: 'NewT' };
    useSuggestionStore.getState().upsert(s);
    const result = await applySuggestion('sug_4');
    expect(result.ok).toBe(false);
    expect(useSuggestionStore.getState().byId['sug_4'].status).toBe('superseded');
    expect(useResumeStore.getState().resume!.sections[0].entries[0].title).toBe('OldT');
  });
});

describe('applySuggestions (scope-respecting primitive)', () => {
  it('only applies the explicitly-passed ids; other pending in same run untouched', async () => {
    const { applySuggestions } = await import('../applySuggestion');
    const s1: Suggestion = { ..._b, id: 'a', createdAt: 1, op: 'update',
      field: { kind: 'entry.title', id: 'e1' }, before: 'OldT', after: 'NewT' };
    const s2: Suggestion = { ..._b, id: 'b', createdAt: 2, op: 'update',
      field: { kind: 'entry.meta', id: 'e1' }, before: 'OldM', after: 'NewM' };
    useSuggestionStore.getState().upsert(s1);
    useSuggestionStore.getState().upsert(s2);
    // ★ Only pass ['a']: the sidebar-Accept-all scope path
    const result = await applySuggestions(['a']);
    expect(result).toEqual({ accepted: 1, skipped: 0 });
    const e = useResumeStore.getState().resume!.sections[0].entries[0];
    expect(e.title).toBe('NewT');
    expect(e.meta).toBe('OldM');                           // ← s2 NOT applied
    expect(useSuggestionStore.getState().byId['b'].status).toBe('pending');  // ← still pending
  });

  it('groups by runId so each batch produces its own undo entry', async () => {
    const { applySuggestions } = await import('../applySuggestion');
    const s1: Suggestion = { ..._b, id: 'a', runId: 'rA', createdAt: 1, op: 'update',
      field: { kind: 'entry.title', id: 'e1' }, before: 'OldT', after: 'NewT' };
    const s2: Suggestion = { ..._b, id: 'b', runId: 'rB', createdAt: 2, op: 'update',
      field: { kind: 'entry.meta', id: 'e1' }, before: 'OldM', after: 'NewM' };
    useSuggestionStore.getState().upsert(s1);
    useSuggestionStore.getState().upsert(s2);
    await applySuggestions(['a', 'b']);
    // Two undo entries (one per runId), each undo restores its own block:
    useResumeStore.getState().undo();   // pops the most recent (rB)
    expect(useResumeStore.getState().resume!.sections[0].entries[0].meta).toBe('OldM');
    expect(useResumeStore.getState().resume!.sections[0].entries[0].title).toBe('NewT');  // rA still applied
    useResumeStore.getState().undo();   // pops rA
    expect(useResumeStore.getState().resume!.sections[0].entries[0].title).toBe('OldT');
  });
});

describe('applyAllInRun (legacy wrapper)', () => {
  it('applies multiple suggestions in createdAt order, single undo entry', async () => {
    const s1: Suggestion = { ..._b, id: 'a', createdAt: 1, op: 'update',
      field: { kind: 'entry.title', id: 'e1' }, before: 'OldT', after: 'NewT' };
    const s2: Suggestion = { ..._b, id: 'b', createdAt: 2, op: 'update',
      field: { kind: 'entry.meta', id: 'e1' }, before: 'OldM', after: 'NewM' };
    useSuggestionStore.getState().upsert(s1);
    useSuggestionStore.getState().upsert(s2);
    const result = await applyAllInRun('r');
    expect(result.accepted).toBe(2);
    expect(result.skipped).toBe(0);
    const e = useResumeStore.getState().resume!.sections[0].entries[0];
    expect(e.title).toBe('NewT');
    expect(e.meta).toBe('NewM');
    // Single undo restores BOTH:
    useResumeStore.getState().undo();
    const eAfter = useResumeStore.getState().resume!.sections[0].entries[0];
    expect(eAfter.title).toBe('OldT');
    expect(eAfter.meta).toBe('OldM');
  });

  it('partial supersede: skipped item does not break the rest', async () => {
    const s1: Suggestion = { ..._b, id: 'a', createdAt: 1, op: 'update',
      field: { kind: 'entry.title', id: 'e1' }, before: 'STALE', after: 'X' };
    const s2: Suggestion = { ..._b, id: 'b', createdAt: 2, op: 'update',
      field: { kind: 'entry.meta', id: 'e1' }, before: 'OldM', after: 'NewM' };
    useSuggestionStore.getState().upsert(s1);
    useSuggestionStore.getState().upsert(s2);
    const result = await applyAllInRun('r');
    expect(result.accepted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(useSuggestionStore.getState().byId['a'].status).toBe('superseded');
    expect(useSuggestionStore.getState().byId['b'].status).toBe('accepted');
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/components/ai/__tests__/applySuggestion.test.ts 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `frontend/src/components/ai/applySuggestion.ts`**

```typescript
// frontend/src/components/ai/applySuggestion.ts
import { useResumeStore, _aiApplyTransaction, type AiTxResult } from '@/components/resume/v2/store/useResumeStore';
import { insertBullet, insertEntry } from '@/components/resume/v2/store/actions/insertBlock';
import { deleteBullet, deleteEntry, deleteSection } from '@/components/resume/v2/store/actions/deleteBlock';
import { moveBullet } from '@/components/resume/v2/store/actions/moveBullet';
import { moveEntry } from '@/components/resume/v2/store/actions/moveEntry';
import { makeOrigin } from '@/components/resume/v2/store/source-of-truth';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { checkSuggestion } from './concurrencyCheck';

const ORIGIN = () => makeOrigin('ai-apply');

/** Per-op composition inside _aiApplyTransaction's fn. Returns true on success
 *  (so caller can include the suggestion id in applied list). */
function _composeApply(s: Suggestion): boolean {
  const store = useResumeStore.getState();
  switch (s.op) {
    case 'update':
      if (s.field.kind === 'bullet.content') {
        store.updateBullet(s.field.id, s.after as never, ORIGIN());
      } else {
        store.updateField(s.field as never, s.after as string, ORIGIN());
      }
      return true;
    case 'insert':
      if (s.insertedBlock.kind === 'bullet') {
        insertBullet(s.parentId, s.atIndex, s.insertedBlock.content as never, ORIGIN(), undefined, s.insertedBlock.id);
      } else if (s.insertedBlock.kind === 'entry') {
        const ib = s.insertedBlock;
        const { entryId } = insertEntry(s.parentId, s.atIndex, ORIGIN(), ib.id, ib.bullets[0].id);
        store.updateField({ kind: 'entry.title', id: entryId } as never, ib.title, ORIGIN());
        store.updateField({ kind: 'entry.meta', id: entryId } as never, ib.meta, ORIGIN());
        // First bullet's id was forced via insertEntry; overwrite content:
        store.updateBullet(ib.bullets[0].id, ib.bullets[0].content as never, ORIGIN());
        for (let i = 1; i < ib.bullets.length; i++) {
          insertBullet(entryId, i, ib.bullets[i].content as never, ORIGIN(), undefined, ib.bullets[i].id);
        }
      }
      return true;
    case 'delete':
      if (s.deletedBlock.kind === 'bullet') deleteBullet(s.blockId, ORIGIN());
      else if (s.deletedBlock.kind === 'entry') deleteEntry(s.blockId, ORIGIN());
      else if (s.deletedBlock.kind === 'section') deleteSection(s.blockId, ORIGIN());
      return true;
    case 'move':
      // Distinguish bullet vs entry move by which parents are present:
      // (bullet parents are entries, entry parents are sections — we use the
      // resume to disambiguate.)
      const r = store.resume!;
      const isEntryMove = r.sections.some((sec) => sec.id === s.fromParentId);
      if (isEntryMove) moveEntry(s.blockId, s.toParentId, s.toIndex, ORIGIN());
      else moveBullet(s.blockId, s.toParentId, s.toIndex, ORIGIN());
      return true;
  }
}

export async function applySuggestion(suggestionId: string): Promise<{ ok: boolean; reason?: string }> {
  const sugStore = useSuggestionStore.getState();
  const s = sugStore.byId[suggestionId];
  if (!s || s.status !== 'pending') return { ok: false, reason: 'not_pending' };
  const resume = useResumeStore.getState().resume;
  if (!resume) return { ok: false, reason: 'no_resume' };

  const check = checkSuggestion(s, resume);
  if (!check.ok) {
    sugStore.markStatusLocally(suggestionId, 'superseded');
    await sugStore.postStatusToBackend(suggestionId, 'superseded');
    return { ok: false, reason: check.reason };
  }

  let applied = false;
  _aiApplyTransaction(`aiApply:${suggestionId}`, { runId: s.runId }, () => {
    applied = _composeApply(s);
    return { appliedSuggestionIds: applied ? [suggestionId] : [], mutated: applied };
  });

  if (applied) {
    sugStore.markStatusLocally(suggestionId, 'accepted');
    await sugStore.postStatusToBackend(suggestionId, 'accepted');
  }
  return { ok: applied };
}

/** Apply an explicit list of suggestion ids (caller-controlled scope). This is
 *  the underlying batch primitive. Used by:
 *   - Sidebar "Accept all" — passes visible+pending ids only (so a Suggestion
 *     hidden by the current sidebar scope is NOT silently accepted)
 *   - applyAllInRun(runId) — convenience wrapper for "all pending in this run"
 *
 *  Spec § 5.2 batch semantics: stable createdAt order, per-step concurrency
 *  re-check, per-item supersede on check fail, ONE outer aiApply undo entry. */
export async function applySuggestions(suggestionIds: string[]): Promise<{ accepted: number; skipped: number }> {
  const sugStore = useSuggestionStore.getState();
  const candidates = suggestionIds
    .map((id) => sugStore.byId[id])
    .filter((s) => s && s.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt);
  if (candidates.length === 0) return { accepted: 0, skipped: 0 };

  // All candidates of a single batch must share the same runId for the undo
  // entry's metadata. If caller passed a mixed-run set, group them and run
  // each group through its own transaction.
  const byRun = new Map<string, typeof candidates>();
  for (const c of candidates) {
    if (!byRun.has(c.runId)) byRun.set(c.runId, []);
    byRun.get(c.runId)!.push(c);
  }

  let totalAccepted = 0;
  let totalSkipped = 0;
  for (const [runId, group] of byRun) {
    const r = await _applySuggestionGroup(runId, group);
    totalAccepted += r.accepted;
    totalSkipped += r.skipped;
  }
  return { accepted: totalAccepted, skipped: totalSkipped };
}

/** Convenience wrapper: apply EVERY pending Suggestion of a run (not scope-limited).
 *  Used by tests + as a backward-compatible alias. Sidebar "Accept all" uses
 *  applySuggestions(visiblePendingIds) instead so scope is honored. */
export async function applyAllInRun(runId: string): Promise<{ accepted: number; skipped: number }> {
  const sugStore = useSuggestionStore.getState();
  const ids = (sugStore.byRun[runId] || []).slice();
  return applySuggestions(ids);
}

async function _applySuggestionGroup(
  runId: string,
  candidates: Suggestion[],
): Promise<{ accepted: number; skipped: number }> {
  if (candidates.length === 0) return { accepted: 0, skipped: 0 };

  const skipped: string[] = [];
  const appliedIds: string[] = [];

  _aiApplyTransaction(`aiApply:batch:${runId}`, { runId }, () => {
    for (const cand of candidates) {
      const resume = useResumeStore.getState().resume!;
      const check = checkSuggestion(cand, resume);
      if (!check.ok) {
        // Concurrency check is the ONLY legitimate per-op skip path. Mutation
        // hasn't happened, so we can safely supersede this one and move on.
        skipped.push(cand.id);
        continue;
      }
      // ★ NO try/catch around _composeApply: if a store action throws (which
      // shouldn't happen given the concurrency check passed, but defensively),
      // the resume may be in a half-mutated state. We MUST let the exception
      // propagate so _aiApplyTransaction's catch rolls the whole batch back
      // to snapshotBefore. Swallowing here would leave stale partial mutations.
      const ok = _composeApply(cand);
      if (ok) appliedIds.push(cand.id);
      else skipped.push(cand.id);
    }
    return { appliedSuggestionIds: appliedIds, mutated: appliedIds.length > 0 };
  });

  // Post status for each:
  for (const id of appliedIds) {
    sugStore.markStatusLocally(id, 'accepted');
    await sugStore.postStatusToBackend(id, 'accepted');
  }
  for (const id of skipped) {
    sugStore.markStatusLocally(id, 'superseded');
    await sugStore.postStatusToBackend(id, 'superseded');
  }
  return { accepted: appliedIds.length, skipped: skipped.length };
}
```

- [ ] **Step 4: Run tests + full v2 regression**

```bash
npx vitest run src/components/ai/__tests__/applySuggestion.test.ts 2>&1 | tail
# Expected: 8 passed (4 single accept + 2 applySuggestions scope + 2 applyAllInRun)
npx vitest run src/components/resume/v2 2>&1 | tail -3
# Expected: ≥ baseline still passing (no regression)
```

- [ ] **Step 5: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add frontend/src/components/ai/applySuggestion.ts frontend/src/components/ai/__tests__/applySuggestion.test.ts
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: applySuggestion + applyAllInRun (per-op composition via _aiApplyTransaction)"
```

---

## Task 17: Frontend — `AISessionClient` (SSE consumer)

**Files:**
- Create: `frontend/src/components/ai/AISessionClient.ts`
- Create: `frontend/src/components/ai/__tests__/AISessionClient.test.ts`

Consumes the SSE stream from `GET /api/ai/runs/{runId}/events` and dispatches to stores: lock acquire/release on `agent.started`/`agent.completed`, suggestion upsert on `suggestion.streamed`, narration to a callback the chat panel registers (Task 21).

- [ ] **Step 1: Write failing test**

`frontend/src/components/ai/__tests__/AISessionClient.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runSSEStream } from '../AISessionClient';
import { useSuggestionStore } from '@/stores/aiSuggestion';
import { useAILockStore } from '@/stores/aiLock';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(url: string) { this.url = url; FakeEventSource.instances.push(this); }
  addEventListener(name: string, fn: (e: MessageEvent) => void) {
    (this.listeners[name] ||= []).push(fn);
  }
  close() {}
  emit(name: string, data: unknown) {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    (this.listeners[name] || []).forEach((fn) => fn(ev));
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  // @ts-expect-error
  global.EventSource = FakeEventSource;
  useSuggestionStore.setState({ byId: {}, byRun: {} });
  useAILockStore.setState({ lockedBlockIds: new Set() });
});

describe('runSSEStream', () => {
  it('locks blocks on agent.started + unlocks on agent.completed', async () => {
    const narrations: string[] = [];
    runSSEStream('run_1', { onNarration: (t) => narrations.push(t), onCompleted: () => {} });
    const es = FakeEventSource.instances[0];
    es.emit('agent.started', { agentId: 'PolishAgent', lockedBlockIds: ['b1'] });
    expect(useAILockStore.getState().isLocked('b1')).toBe(true);
    es.emit('agent.completed', { agentId: 'PolishAgent', runId: 'run_1' });
    expect(useAILockStore.getState().isLocked('b1')).toBe(false);
  });

  it('upserts suggestions on suggestion.streamed', async () => {
    runSSEStream('run_1', { onNarration: () => {}, onCompleted: () => {} });
    const es = FakeEventSource.instances[0];
    const s = { id: 'sug_x', runId: 'run_1', agentId: 'PolishAgent', resumeId: 'r1',
                status: 'streaming', createdAt: 1,
                source: { kind: 'agent', agentId: 'PolishAgent', runId: 'run_1' },
                op: 'update', field: { kind: 'entry.title', id: 'e1' },
                before: 'a', after: 'b' };
    es.emit('suggestion.streamed', { suggestion: s });
    expect(useSuggestionStore.getState().byId['sug_x']).toMatchObject({ id: 'sug_x' });
  });

  it('forwards narration text to onNarration callback', () => {
    const calls: string[] = [];
    runSSEStream('run_1', { onNarration: (t) => calls.push(t), onCompleted: () => {} });
    FakeEventSource.instances[0].emit('agent.narration', { agentId: 'Coordinator', text: 'hi' });
    expect(calls).toEqual(['hi']);
  });

  it('calls onCompleted with runId on run.completed', () => {
    const completed: string[] = [];
    runSSEStream('run_1', { onNarration: () => {}, onCompleted: (rid) => completed.push(rid) });
    FakeEventSource.instances[0].emit('run.completed', { runId: 'run_1', suggestionIds: ['a'], status: 'done' });
    expect(completed).toEqual(['run_1']);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npx vitest run src/components/ai/__tests__/AISessionClient.test.ts 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `frontend/src/components/ai/AISessionClient.ts`**

```typescript
// frontend/src/components/ai/AISessionClient.ts
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { useAILockStore } from '@/stores/aiLock';

export interface AISessionCallbacks {
  /** Called when an `agent.narration` event arrives — chat panel renders inline. */
  onNarration: (text: string, agentId: string) => void;
  /** Called when `run.completed` arrives — chat panel renders the
   *  "📋 View in sidebar" button + summary. */
  onCompleted: (runId: string, suggestionIds: string[], status: string) => void;
  /** Optional error handler. */
  onError?: (err: unknown) => void;
}

/**
 * Open an SSE connection to `/api/ai/runs/{runId}/events`, dispatch:
 *  - agent.started      → lock blocks
 *  - agent.narration    → onNarration
 *  - suggestion.streamed → upsert suggestion
 *  - agent.completed    → unlock blocks
 *  - run.completed      → onCompleted
 *
 * Returns a cleanup function the caller invokes on unmount.
 */
export function runSSEStream(runId: string, cb: AISessionCallbacks): () => void {
  const es = new EventSource(`/api/ai/runs/${runId}/events`);
  let lockedBlocksByAgent: Record<string, string[]> = {};

  es.addEventListener('agent.started', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    const ids: string[] = data.lockedBlockIds || [];
    lockedBlocksByAgent[data.agentId] = ids;
    useAILockStore.getState().lock(ids);
  });

  es.addEventListener('agent.narration', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    cb.onNarration(data.text, data.agentId);
  });

  es.addEventListener('suggestion.streamed', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    const s = data.suggestion as Suggestion;
    useSuggestionStore.getState().upsert(s);
  });

  es.addEventListener('agent.completed', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    const ids = lockedBlocksByAgent[data.agentId] || [];
    useAILockStore.getState().unlock(ids);
    delete lockedBlocksByAgent[data.agentId];
  });

  es.addEventListener('run.completed', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    cb.onCompleted(data.runId, data.suggestionIds || [], data.status || 'done');
    es.close();
  });

  es.addEventListener('error', (e: Event) => {
    cb.onError?.(e);
  });

  return () => es.close();
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/ai/__tests__/AISessionClient.test.ts 2>&1 | tail
```
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add frontend/src/components/ai/AISessionClient.ts frontend/src/components/ai/__tests__/AISessionClient.test.ts
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: AISessionClient (SSE consumer dispatching to stores)"
```

---

## Task 18: Frontend — `AISidebar` UI

**Files:**
- Create: `frontend/src/components/ai/AISidebar.tsx`
- Create: `frontend/src/components/ai/AISidebarRow.tsx`
- Create: `frontend/src/stores/aiSidebarUI.ts` — open/closed state
- Create: `frontend/src/components/ai/__tests__/AISidebar.test.tsx`

Per spec § 6.1: 360px right-overlay sidebar, scope-driven content from selection. Single pane (no History tab — version history was cut). Each row shows agent badge + before/after diff + ✓/✗. "Accept all" / "Reject all" at bottom.

For v0 the responsive collapse-left-nav behavior is implemented as: when sidebar opens AND viewport < 1400px, dispatch a CSS class to `<body>` that collapses the nav (left nav reads its own collapsed state from a separate signal — the AppShell). v0 ships the sidebar component + a viewport-listener that toggles `body.classList.toggle('ai-sidebar-open-narrow', viewport < 1400 && open)`. Actual nav collapse styling can be a CSS-only addition in AppShell.

- [ ] **Step 1: Write failing test (rendering + scope filter + accept)**

`frontend/src/components/ai/__tests__/AISidebar.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AISidebar } from '../AISidebar';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { useAISidebarUIStore } from '@/stores/aiSidebarUI';

const mkSug = (id: string, fieldId: string, before: string, after: string): Suggestion => ({
  id, runId: 'run_1', agentId: 'PolishAgent', resumeId: 'r1',
  status: 'pending', createdAt: 1,
  source: { kind: 'agent', agentId: 'PolishAgent', runId: 'run_1' },
  op: 'update', field: { kind: 'entry.title', id: fieldId },
  before, after,
});

beforeEach(() => {
  useSuggestionStore.setState({ byId: {}, byRun: {} });
  useAISidebarUIStore.setState({ isOpen: true, scopedToBlockId: null });
  global.fetch = (() => Promise.resolve({ ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
});

describe('AISidebar', () => {
  it('renders all pending suggestions when no selection scope', () => {
    useSuggestionStore.getState().upsert(mkSug('a', 'e1', 'A', 'A2'));
    useSuggestionStore.getState().upsert(mkSug('b', 'e2', 'B', 'B2'));
    render(<AISidebar />);
    expect(screen.getByText(/A → A2/i)).toBeTruthy();
    expect(screen.getByText(/B → B2/i)).toBeTruthy();
  });

  it('filters to suggestions matching scopedToBlockId', () => {
    useSuggestionStore.getState().upsert(mkSug('a', 'e1', 'A', 'A2'));
    useSuggestionStore.getState().upsert(mkSug('b', 'e2', 'B', 'B2'));
    useAISidebarUIStore.setState({ isOpen: true, scopedToBlockId: 'e1' });
    render(<AISidebar />);
    expect(screen.queryByText(/A → A2/i)).toBeTruthy();
    expect(screen.queryByText(/B → B2/i)).toBeNull();
  });

  it('shows accept all button + reject all button', () => {
    useSuggestionStore.getState().upsert(mkSug('a', 'e1', 'A', 'A2'));
    render(<AISidebar />);
    expect(screen.getByRole('button', { name: /Accept all/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reject all/i })).toBeTruthy();
  });

  it('clicking row Accept disables button while in-flight', async () => {
    useSuggestionStore.getState().upsert(mkSug('a', 'e1', 'OldT', 'NewT'));
    // Stub useResumeStore so applySuggestion has something to mutate.
    const { useResumeStore } = await import('@/components/resume/v2/store/useResumeStore');
    useResumeStore.setState({
      resume: {
        schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
        header: { id: 'h', name: '', contact_lines: [] },
        sections: [{ id: 's1', role: 'experience', heading: 'E', entries: [
          { id: 'e1', title: 'OldT', meta: '', bullets: [] },
        ]}],
        metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
      },
      bulletMeta: {},
    });
    render(<AISidebar />);
    const btn = screen.getByRole('button', { name: /^✓ Accept$/ });
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
  });

  it('does not render when isOpen is false', () => {
    useAISidebarUIStore.setState({ isOpen: false, scopedToBlockId: null });
    const { container } = render(<AISidebar />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/components/ai/__tests__/AISidebar.test.tsx 2>&1 | tail
```
Expected: import error.

- [ ] **Step 3: Implement `frontend/src/stores/aiSidebarUI.ts`**

```typescript
// frontend/src/stores/aiSidebarUI.ts
import { create } from 'zustand';

type BlockId = string;

interface AISidebarUIState {
  isOpen: boolean;
  scopedToBlockId: BlockId | null;
  open: (scope?: BlockId | null) => void;
  close: () => void;
  setScope: (id: BlockId | null) => void;
}

export const useAISidebarUIStore = create<AISidebarUIState>((set) => ({
  isOpen: false,
  scopedToBlockId: null,
  open: (scope) => set({ isOpen: true, scopedToBlockId: scope ?? null }),
  close: () => set({ isOpen: false }),
  setScope: (id) => set({ scopedToBlockId: id }),
}));
```

- [ ] **Step 4: Implement `frontend/src/components/ai/AISidebarRow.tsx`**

```tsx
// frontend/src/components/ai/AISidebarRow.tsx
'use client';
import { useState } from 'react';
import type { Suggestion } from '@/stores/aiSuggestion';
import { applySuggestion } from './applySuggestion';
import { useSuggestionStore } from '@/stores/aiSuggestion';

interface Props {
  suggestion: Suggestion;
}

export function AISidebarRow({ suggestion: s }: Props) {
  const [working, setWorking] = useState(false);
  const isStreaming = s.status === 'streaming';
  const isSuperseded = s.status === 'superseded';

  async function onAccept() {
    setWorking(true);
    try { await applySuggestion(s.id); } finally { setWorking(false); }
  }
  async function onReject() {
    setWorking(true);
    try {
      useSuggestionStore.getState().markStatusLocally(s.id, 'rejected');
      await useSuggestionStore.getState().postStatusToBackend(s.id, 'rejected');
    } finally { setWorking(false); }
  }

  return (
    <div
      data-testid={`ai-row-${s.id}`}
      style={{
        background: '#fff',
        border: '1px solid #e0d8c9',
        borderRadius: 4,
        padding: '8px 10px',
        marginBottom: 6,
        opacity: isSuperseded ? 0.5 : 1,
      }}
    >
      <div style={{ fontSize: 11, color: '#6b6258', marginBottom: 4 }}>
        {_blockPathLabel(s)} · {s.agentId}
      </div>
      <div style={{ fontSize: 12 }}>
        {_renderDiff(s)}
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
        <button
          onClick={onAccept}
          disabled={working || isStreaming || isSuperseded}
          style={_btnStyle(false)}
        >
          {isStreaming ? '✦ generating…' : '✓ Accept'}
        </button>
        <button
          onClick={onReject}
          disabled={working || isStreaming}
          style={_btnStyle(true)}
        >
          ✗ Reject
        </button>
      </div>
      {isSuperseded && (
        <div style={{ marginTop: 4, fontSize: 11, color: '#aa3333' }}>
          已被你修改 — 跳过
        </div>
      )}
    </div>
  );
}

function _renderDiff(s: Suggestion): string {
  switch (s.op) {
    case 'update':
      return `${_short(s.before)} → ${_short(s.after)}`;
    case 'insert':
      return `+ insert at ${s.parentId}[${s.atIndex}]`;
    case 'delete':
      return `− delete ${s.blockId}`;
    case 'move':
      return `↕ move ${s.blockId}`;
  }
}

function _short(v: unknown): string {
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  return JSON.stringify(v).slice(0, 60);
}

function _blockPathLabel(s: Suggestion): string {
  if (s.op === 'update') {
    if ('id' in s.field) return `${s.field.kind}:${s.field.id}`;
    return s.field.kind;
  }
  if (s.op === 'insert') return `insert into ${s.parentId}`;
  if (s.op === 'delete') return `delete ${s.blockId}`;
  return `move ${s.blockId}`;
}

function _btnStyle(reject: boolean): React.CSSProperties {
  return {
    background: reject ? '#aa3333' : '#1c6b1c',
    color: '#fff',
    border: 'none',
    borderRadius: 3,
    padding: '3px 8px',
    fontSize: 11,
    cursor: 'pointer',
  };
}
```

- [ ] **Step 5: Implement `frontend/src/components/ai/AISidebar.tsx`**

```tsx
// frontend/src/components/ai/AISidebar.tsx
'use client';
import { useEffect, useState } from 'react';
import { useAISidebarUIStore } from '@/stores/aiSidebarUI';
import { useSuggestionStore, type Suggestion, suggestionBlockId } from '@/stores/aiSuggestion';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { AISidebarRow } from './AISidebarRow';
import { applySuggestions } from './applySuggestion';

export function AISidebar() {
  const isOpen = useAISidebarUIStore((s) => s.isOpen);
  const close = useAISidebarUIStore((s) => s.close);
  const scope = useAISidebarUIStore((s) => s.scopedToBlockId);
  const byId = useSuggestionStore((s) => s.byId);
  const resume = useResumeStore((s) => s.resume);

  // Responsive: when narrow + open, body class lets AppShell collapse the left nav.
  useEffect(() => {
    function update() {
      const narrow = window.innerWidth < 1400;
      document.body.classList.toggle('ai-sidebar-open-narrow', isOpen && narrow);
    }
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      document.body.classList.remove('ai-sidebar-open-narrow');
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const allItems: Suggestion[] = Object.values(byId);
  const visible = scope
    ? allItems.filter((s) => _scopeMatches(s, scope, resume))
    : allItems;
  const pending = visible.filter((s) => s.status !== 'rejected');

  const [working, setWorking] = useState(false);

  async function onAcceptAll() {
    // ★ Scope-respecting Accept all: pass ONLY the currently-visible pending
    // ids. Without this, applyAllInRun(runId) would also accept Suggestions
    // that the current sidebar scope filters out — silent over-acceptance.
    const visiblePendingIds = pending
      .filter((s) => s.status === 'pending')
      .map((s) => s.id);
    setWorking(true);
    try { await applySuggestions(visiblePendingIds); }
    finally { setWorking(false); }
  }

  async function onRejectAll() {
    setWorking(true);
    try {
      for (const s of pending.filter((x) => x.status === 'pending')) {
        useSuggestionStore.getState().markStatusLocally(s.id, 'rejected');
        await useSuggestionStore.getState().postStatusToBackend(s.id, 'rejected');
      }
    } finally { setWorking(false); }
  }

  return (
    <aside
      data-testid="ai-sidebar"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        background: '#fbf6ee',
        borderLeft: '1px solid #c9c0b3',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.08)',
        zIndex: 100,
        padding: 12,
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>✦ AI · {pending.length} change{pending.length === 1 ? '' : 's'}</span>
        <button onClick={close} aria-label="Close sidebar" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
      </header>

      {pending.length === 0 && (
        <p style={{ color: '#6b6258', fontSize: 12 }}>No pending suggestions in scope.</p>
      )}

      {pending.map((s) => (
        <AISidebarRow key={s.id} suggestion={s} />
      ))}

      {pending.length > 0 && (
        <footer style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e0d8c9', display: 'flex', gap: 6 }}>
          <button onClick={onAcceptAll} disabled={working} style={{ background: '#1c6b1c', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 3, cursor: 'pointer' }}>
            ✓ Accept all
          </button>
          <button onClick={onRejectAll} disabled={working} style={{ background: '#aa3333', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 3, cursor: 'pointer' }}>
            ✗ Reject all
          </button>
        </footer>
      )}
    </aside>
  );
}

function _scopeMatches(s: Suggestion, scope: string, resume: ReturnType<typeof useResumeStore.getState>['resume']): boolean {
  const target = suggestionBlockId(s);
  if (target === scope) return true;
  // Also match if `scope` is an ancestor of the target (entry contains bullet, section contains entry).
  if (!resume) return false;
  for (const sec of resume.sections) {
    if (sec.id !== scope) continue;
    for (const e of sec.entries) {
      if (e.id === target) return true;
      for (const b of e.bullets) if (b.id === target) return true;
    }
  }
  for (const sec of resume.sections) for (const e of sec.entries) {
    if (e.id !== scope) continue;
    for (const b of e.bullets) if (b.id === target) return true;
  }
  return false;
}
```

- [ ] **Step 6: Add @testing-library/react if not present**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && cat package.json | grep -E "@testing-library/react"
# If missing:
# npm install --save-dev @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run src/components/ai/__tests__/AISidebar.test.tsx 2>&1 | tail
```
Expected: `5 passed`.

- [ ] **Step 8: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add frontend/src/stores/aiSidebarUI.ts frontend/src/components/ai/AISidebar.tsx frontend/src/components/ai/AISidebarRow.tsx frontend/src/components/ai/__tests__/AISidebar.test.tsx
[ -f /Users/fred/Desktop/CareerOps-Pro/frontend/package.json ] && git -C /Users/fred/Desktop/CareerOps-Pro add frontend/package.json frontend/package-lock.json 2>/dev/null
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: AISidebar + AISidebarRow + responsive body class hook"
```

---

## Task 19: Frontend — Soft lock visual + DragController/keyboard/structural guards

**Files** (every file Step 5 enumerates — DO NOT skip any. Step 5 is intentionally exhaustive per spec § 6.2's mandate that EVERY mutation entry point check the lock):
- Modify: `frontend/src/components/resume/v2/interaction/DragController.ts`
- Modify: `frontend/src/components/resume/v2/interaction/DragController.test.ts`
- Modify: `frontend/src/components/resume/v2/layers/AtomContentLayer.tsx`
- Modify: `frontend/src/components/resume/v2/tokens/resume-styles.css` — add `@keyframes ai-lock-pulse`
- Modify: `frontend/src/components/resume/v2/extensions/AtomKeyboardNav.ts`
- Modify: `frontend/src/components/resume/v2/extensions/SingleLineKeyboardNav.ts`
- Modify: `frontend/src/components/resume/v2/interaction/keyboard-router.ts` (if structural delete routes through it — Step 5c verifies)
- Modify: `frontend/src/components/resume/v2/interaction/SelectionManager.ts` (if batch delete present — Step 5d verifies)
- Modify: `frontend/src/components/resume/v2/extensions/SlashCommand.ts` (if it triggers structural inserts — Step 5e verifies)
- Modify: `frontend/src/components/resume/v2/store/actions/deleteBlock.ts` — top-of-action lock guard (void return)
- Modify: `frontend/src/components/resume/v2/store/actions/moveBullet.ts` — top-of-action lock guard (void)
- Modify: `frontend/src/components/resume/v2/store/actions/moveEntry.ts` — top-of-action lock guard (void)
- Modify: `frontend/src/components/resume/v2/store/actions/moveSection.ts` — top-of-action lock guard (void)
- Modify: `frontend/src/components/resume/v2/store/actions/moveHeaderRow.ts` — top-of-action lock guard (void)
- Modify: `frontend/src/components/resume/v2/store/actions/setBulletKind.ts` — top-of-action lock guard (void)
- Modify: `frontend/src/components/resume/v2/store/actions/duplicateBlock.ts` — top-of-action lock guard (returns null on guard — already nullable)
- **NOT modified:** `insertBlock.ts` (insert* return non-null types — UI guards in 5a/5b/5e are the protection; see 5g rationale)
- Modify: any toolbar component invoking structural actions (Step 5f enumerates via grep — list at execution time)
- Create: `frontend/src/components/resume/v2/store/actions/__tests__/aiLockGuard.test.ts`

Per spec § 6.2: lock check at `DragController.startDrag` (return no-op session) + at structural mutation entry points (delete via keyboard). Visual treatment: opacity 0.55 + slow ✦ pulse + accent border on locked atoms (in AtomContentLayer's per-atom render).

- [ ] **Step 1: Add failing tests for lock-blocks-drag**

Open `frontend/src/components/resume/v2/interaction/DragController.test.ts` and append (inside the outer describe blocks — examine current structure):

```typescript
import { useAILockStore } from '@/stores/aiLock';

describe('AI lock blocks drag (spec § 6.2)', () => {
  beforeEach(() => {
    useResumeStore.setState({ resume: structuredClone(RESUME), bulletMeta: {} });
    useAILockStore.setState({ lockedBlockIds: new Set() });
  });

  it('startDrag returns a no-op session when block is locked', () => {
    useAILockStore.getState().lock(['e1']);
    // Build a fake handle element + pointer event:
    const handleEl = document.createElement('div');
    document.body.appendChild(handleEl);
    handleEl.setPointerCapture = () => {};
    handleEl.releasePointerCapture = () => {};
    const session = startDrag(
      { pointerId: 1, clientX: 0, clientY: 0 } as PointerEvent,
      handleEl,
      { kind: 'entry', id: 'e1', sectionId: 's1' },
      () => {},
    );
    // Move + up — nothing should happen, no preview / no selection / no commit.
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    // No undo entry should have appeared:
    expect(useResumeStore.getState()._undo.canUndo()).toBe(false);
    handleEl.remove();
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npx vitest run src/components/resume/v2/interaction/DragController.test.ts -t "AI lock" 2>&1 | tail
```
Expected: lock check missing → drag still proceeds; assertions fail.

- [ ] **Step 3: Modify `DragController.ts`** — add lock check at top of `startDrag`

In `frontend/src/components/resume/v2/interaction/DragController.ts`, near the top of `startDrag`, before `handleEl.setPointerCapture(...)`:

```typescript
import { useAILockStore } from '@/stores/aiLock';

export function startDrag(
  e: PointerEvent,
  handleEl: HTMLElement,
  block: SelectableBlock,
  onDropIndicator: (payload: DropIndicatorPayload) => void,
): DragSession {
  // ★ AI lock guard (spec § 6.2): if the source block is locked by an in-flight
  // AI run, return a no-op session — pointer events are ignored, no preview,
  // no commit. This prevents the user from dragging blocks AI is mutating.
  const locked = useAILockStore.getState();
  if (locked.isLocked(block.id) ||
      (block.kind === 'entry' && locked.isLocked(block.sectionId)) ||
      (block.kind === 'bullet' && locked.isLocked(block.entryId))) {
    return { cancel: () => {} };
  }

  handleEl.setPointerCapture(e.pointerId);
  // ... rest of existing function unchanged ...
```

(Note: the existing `startDrag` function continues unchanged below this guard.)

Also at the top of `commitDrop`, add a defensive lock check:

```typescript
export function commitDrop(block: SelectableBlock, target: DropTarget, origin: UpdateOrigin): void {
  // ★ AI lock guard: defensive — UI guard above should catch it, but if a
  // race somehow gets here, no-op rather than mutate.
  const locked = useAILockStore.getState();
  const targetParentId =
    target.kind === 'entry-slot' ? target.sectionId :
    target.kind === 'bullet-slot' ? target.entryId :
    target.kind === 'header-row-slot' ? target.headerId :
    null;
  if (locked.isLocked(block.id) || (targetParentId && locked.isLocked(targetParentId))) {
    return;
  }
  // ... rest of existing function unchanged ...
```

- [ ] **Step 4: Modify `AtomContentLayer.tsx`** — soft lock visual

Locate the per-atom render block in `AtomContentLayer.tsx` (the one inside `atoms.map((atom, idx) => {...})`). Add lock-derived style:

```tsx
import { useAILockStore } from '@/stores/aiLock';
// ... inside the component:
const lockedSet = useAILockStore((s) => s.lockedBlockIds);
// ... inside the map:
const isLocked = lockedSet.has(atom.sourceBlockId);
const lockStyle: React.CSSProperties = isLocked ? {
  opacity: 0.55,
  outline: '1px solid #d49b5e',
  outlineOffset: 2,
  // animation pulses border opacity slightly:
  animation: 'ai-lock-pulse 1.6s ease-in-out infinite',
  // ★ Do NOT set `pointerEvents: 'none'`. Spec § 6.2: "Locked blocks remain
  // selectable; cursor visible but inert." We want users to still be able to
  // click into a locked block (cursor visible, selection works) — just no
  // typing or structural mutation. Input gating happens at the editor layer
  // via `editor.setEditable(false)` (TipTap field config) and at the
  // structural-mutation entry points enumerated in Step 5 below.
} : {};
// merge into the existing style spread on the atom div:
//   ...(justDropped ? {} : { transform: ... }),
//   ...animationStyle,
//   ...settleStyle,
//   ...lockStyle,   // ★ NEW
```

And in `frontend/src/components/resume/v2/tokens/resume-styles.css`, append the keyframe:

```css
@keyframes ai-lock-pulse {
  0%, 100% { outline-color: rgba(212, 155, 94, 0.4); }
  50%      { outline-color: rgba(212, 155, 94, 1.0); }
}
```

- [ ] **Step 5: Enumerate every structural-mutation entry point and add lock check**

Spec § 6.2 mandates lock guards at EVERY structural mutation entry point. Per-file enumeration (do these in this order; each is a small targeted edit):

**5a. `frontend/src/components/resume/v2/extensions/AtomKeyboardNav.ts`**
- Locate the `insertBullet(...)` call (currently around line 134 per `grep -n "insertBullet" ...`)
- Add immediately before it:
  ```typescript
  import { useAILockStore } from '@/stores/aiLock';
  // ... inside the handler, before insertBullet(...):
  const targetEntryId = /* the entry id passed to insertBullet */;
  if (useAILockStore.getState().isLocked(targetEntryId)) return; // ai-locked: suppress
  ```

**5b. `frontend/src/components/resume/v2/extensions/SingleLineKeyboardNav.ts`**
- Same pattern at the `insertEntry(...)` call (~line 181) and `insertBullet(...)` call (~line 193).
- Lock check key: the parent's id (sectionId for insertEntry; entryId for insertBullet).

**5c. `frontend/src/components/resume/v2/interaction/keyboard-router.ts`** (if it routes Backspace/Cmd+D to structural delete)
```bash
grep -n "deleteBlock\|deleteBullet\|deleteEntry\|deleteSection\|moveBullet\|moveEntry\|duplicate" frontend/src/components/resume/v2/interaction/keyboard-router.ts
```
For each match: add `if (useAILockStore.getState().isLocked(<targetId>)) return;` immediately before the call.

**5d. `frontend/src/components/resume/v2/interaction/SelectionManager.ts`** — if `extendBlockSelection` / batch delete touches structural ops, gate them similarly. Inspect:
```bash
grep -n "delete\|insert\|move" frontend/src/components/resume/v2/interaction/SelectionManager.ts
```
Selection itself stays unguarded (per spec § 6.2: "locked blocks remain selectable"). Only mutation triggered FROM selection state needs the guard.

**5e. `frontend/src/components/resume/v2/extensions/SlashCommand.ts`** — if it triggers `insertBullet`/`insertEntry`/`insertSection`, gate the parent's id.
```bash
grep -n "insert" frontend/src/components/resume/v2/extensions/SlashCommand.ts
```

**5f. Toolbar structural buttons** — locate any toolbar action that invokes structural store actions (delete-block / duplicate / etc.):
```bash
grep -rn "deleteBlock\|deleteBullet\|deleteEntry\|deleteSection\|duplicateBlock" frontend/src/components/resume/v2/ --include="*.tsx" --include="*.ts" | grep -v "\.test\.\|store/actions/"
```
For each call site: add the same `if (useAILockStore.getState().isLocked(<id>)) return;` guard. Toolbar buttons that match a locked block in their target should also render `disabled` (use `useAILockStore((s) => s.isLocked(currentBlockId))` selector).

**5g. Defensive store-action top-of-action guards** (last line of defense — VOID / NULLABLE-RETURN actions only):

Top-of-action `return;` is only safe on functions whose return type is `void` (where bare `return` is type-correct) or `T | null` (where we can return `null`). The `insert*` actions return non-nullable `BlockId` / `InsertEntryResult` / `number` — adding a `return;` would either fail TypeScript or force signature widening to nullable, which violates "existing actions semantics frozen" (§ 0.5). **Insert lock protection lives entirely at the UI/apply layer (5a / 5b / 5e — keyboard handlers, slash command).** The store's apply layer (Task 16's `applySuggestion`) doesn't need a store-level guard either — it gates explicitly via the optimistic concurrency check + the lock check happens at agent.started time.

Apply top-of-action guards to these files only:

- `frontend/src/components/resume/v2/store/actions/deleteBlock.ts` — every export returns `void`
- `frontend/src/components/resume/v2/store/actions/moveSection.ts` — `void`
- `frontend/src/components/resume/v2/store/actions/moveEntry.ts` — `void`
- `frontend/src/components/resume/v2/store/actions/moveBullet.ts` — `void`
- `frontend/src/components/resume/v2/store/actions/moveHeaderRow.ts` — `void`
- `frontend/src/components/resume/v2/store/actions/setBulletKind.ts` — `void`
- `frontend/src/components/resume/v2/store/actions/duplicateBlock.ts` — returns `BlockId | null` (already nullable; return `null` on guard)

Pattern for `void` actions (e.g. `moveBullet`):

```typescript
import { useAILockStore } from '@/stores/aiLock';
// ... at top of action function, after `if (!r) return;`:
const lock = useAILockStore.getState();
if (lock.isLocked(blockId) || (newParentEntryId && lock.isLocked(newParentEntryId))) {
  console.warn(`[ai-lock] suppressed moveBullet(${blockId}) — locked`);
  return;
}
```

Pattern for `duplicateBlock` (returns `BlockId | null`):

```typescript
const lock = useAILockStore.getState();
if (lock.isLocked(id)) {
  console.warn(`[ai-lock] suppressed duplicateBullet(${id}) — locked`);
  return null;
}
```

**`insertBullet`, `insertEntry`, `insertContactLine`, `insertSection` — DO NOT modify.** Their signatures return non-null. UI guards in 5a/5b/5e are sufficient. (If a future path needs the store-level guard for inserts, add it as a deliberate signature change in that future PR — not as a side effect of this task.)

This is the explicitly-allowed additive change to existing void/nullable structural actions per spec § 0.5 rule #7.

- [ ] **Step 5 verification**

Add a regression test asserting that with `useAILockStore` containing the target id, every guarded action no-ops:

`frontend/src/components/resume/v2/store/actions/__tests__/aiLockGuard.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useResumeStore } from '../../useResumeStore';
import { useAILockStore } from '@/stores/aiLock';
import { insertBullet, insertEntry } from '../insertBlock';
import { deleteBullet, deleteEntry } from '../deleteBlock';
import { moveBullet } from '../moveBullet';
import { moveEntry } from '../moveEntry';
import { makeOrigin } from '../../source-of-truth';
import type { ResumeDoc } from '../../../types';

const FIXTURE: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: '', meta: '', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
        { id: 'b2', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
      { id: 'e2', title: '', meta: '', bullets: [
        { id: 'b3', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
    ]},
    { id: 's2', role: 'skills', heading: 'Skills', entries: [] },
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(FIXTURE), bulletMeta: {} });
  useResumeStore.getState()._undo.clear();
  useAILockStore.setState({ lockedBlockIds: new Set() });
});

const ORIGIN = () => makeOrigin('ai-apply');

describe('AI lock blocks structural mutations (defensive store-action guard, void/nullable returns only)', () => {
  // ★ Insert actions (insertBullet/insertEntry/insertContactLine/insertSection)
  //   are NOT guarded at the store level — their non-null return types make
  //   bare `return;` unsafe. Insert lock protection lives at the UI layer
  //   (keyboard / slash command handlers — Task 19 Step 5a/5b/5e).

  it('deleteBullet is no-op when bullet is locked', () => {
    useAILockStore.getState().lock(['b1']);
    deleteBullet('b1', ORIGIN());
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets.find(b => b.id === 'b1')).toBeTruthy();
  });

  it('deleteBullet succeeds when not locked', () => {
    deleteBullet('b1', ORIGIN());
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets.find(b => b.id === 'b1')).toBeUndefined();
  });

  it('deleteEntry is no-op when entry is locked', () => {
    useAILockStore.getState().lock(['e1']);
    deleteEntry('e1', ORIGIN());
    expect(useResumeStore.getState().resume!.sections[0].entries.find(e => e.id === 'e1')).toBeTruthy();
  });

  it('moveBullet is no-op when source bullet is locked', () => {
    useAILockStore.getState().lock(['b1']);
    moveBullet('b1', 'e2', 0, ORIGIN());
    const r = useResumeStore.getState().resume!;
    expect(r.sections[0].entries[0].bullets.find(b => b.id === 'b1')).toBeTruthy();
    expect(r.sections[0].entries[1].bullets.find(b => b.id === 'b1')).toBeUndefined();
  });

  it('moveBullet is no-op when destination entry is locked', () => {
    useAILockStore.getState().lock(['e2']);
    moveBullet('b1', 'e2', 0, ORIGIN());
    const r = useResumeStore.getState().resume!;
    expect(r.sections[0].entries[0].bullets.find(b => b.id === 'b1')).toBeTruthy();
  });

  it('moveEntry is no-op when entry is locked', () => {
    useAILockStore.getState().lock(['e1']);
    moveEntry('e1', 's2', 0, ORIGIN());
    const r = useResumeStore.getState().resume!;
    expect(r.sections[0].entries.find(e => e.id === 'e1')).toBeTruthy();
    expect(r.sections[1].entries.find(e => e.id === 'e1')).toBeUndefined();
  });

  it('insertBullet is NOT gated at store level (returns BlockId, can\'t no-op return) — UI guard in keyboard handler is the protection', () => {
    // This test documents the design decision so a future regression that
    // adds a store-level insert guard fails loudly.
    useAILockStore.getState().lock(['e1']);
    const newId = insertBullet('e1', 0, { type: 'doc', content: [{ type: 'paragraph' }] }, ORIGIN());
    expect(typeof newId).toBe('string');  // returned a real id, not no-op
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets[0].id).toBe(newId);
  });
});
```

- [ ] **Step 6: Run tests + full v2 regression**

```bash
npx vitest run src/components/resume/v2/interaction/DragController.test.ts 2>&1 | tail
# Expected: all tests pass incl. new lock test
npx vitest run src/components/resume/v2 2>&1 | tail -3
# Expected: ≥ baseline + 1 new (lock test)
```

- [ ] **Step 7: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add \
  frontend/src/components/resume/v2/interaction/DragController.ts \
  frontend/src/components/resume/v2/interaction/DragController.test.ts \
  frontend/src/components/resume/v2/layers/AtomContentLayer.tsx \
  frontend/src/components/resume/v2/tokens/resume-styles.css \
  frontend/src/components/resume/v2/extensions/AtomKeyboardNav.ts \
  frontend/src/components/resume/v2/extensions/SingleLineKeyboardNav.ts \
  frontend/src/components/resume/v2/interaction/keyboard-router.ts \
  frontend/src/components/resume/v2/interaction/SelectionManager.ts \
  frontend/src/components/resume/v2/extensions/SlashCommand.ts \
  frontend/src/components/resume/v2/store/actions/deleteBlock.ts \
  frontend/src/components/resume/v2/store/actions/moveBullet.ts \
  frontend/src/components/resume/v2/store/actions/moveEntry.ts \
  frontend/src/components/resume/v2/store/actions/moveSection.ts \
  frontend/src/components/resume/v2/store/actions/moveHeaderRow.ts \
  frontend/src/components/resume/v2/store/actions/setBulletKind.ts \
  frontend/src/components/resume/v2/store/actions/duplicateBlock.ts \
  frontend/src/components/resume/v2/store/actions/__tests__/aiLockGuard.test.ts
# If Step 5c/5d/5e/5f find no structural ops to gate in their respective
# files, those files won't be modified — `git add` of unmodified paths is
# a no-op, safe. Toolbar files identified at execution time per Step 5f's
# grep — add them to the `git add` line above before commit.
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: soft lock — DragController + keyboard + slash + selection + 8 store action guards + visual"
```

---

## Task 20: Frontend — EditorPage wiring (pageContext + sidebar mount + ⋮⋮ double-click)

**Files:**
- Modify: `frontend/src/components/resume/v2/EditorPage.tsx`
- Modify: `frontend/src/components/resume/v2/atoms/HeaderRowInteractionOverlay.tsx`
- Modify: `frontend/src/components/resume/v2/atoms/EntryRowInteractionOverlay.tsx`
- Modify: `frontend/src/components/resume/v2/atoms/BulletInteractionOverlay.tsx`
- Modify: `frontend/src/components/resume/v2/store/useResumeStore.ts` — register suggestion-store callback for AI undo dispatch
- Modify: `frontend/src/stores/aiSuggestion.ts` — install undo callback that flips status

Per spec § 2: double-click ⋮⋮ → select + open sidebar scoped to that block. Single click stays the existing behavior (drag handle / select). EditorPage registers `usePageContext({page: 'resume_editor', summary: ...})` so the global AI panel knows which resume the user is editing. Also wires the Suggestion store's undo callback to the resume store so Cmd+Z on AI applies flips suggestion statuses (Task 12 left this as a TODO — wire it here).

- [ ] **Step 1: Modify `frontend/src/stores/aiSuggestion.ts`** — register undo callback

Add to the bottom of the file (outside the store create call):

```typescript
import { _registerAiApplyUndoCallback, type AiApplyUndoDirection } from '@/components/resume/v2/store/useResumeStore';

/** Install the AI-apply undo callback once on module load. Called by:
 *  - undo() after popping an aiApply entry (direction='undo'): flip suggestions back to 'pending'
 *  - redo() before swap (direction='redo:precheck'): return true iff all are pending
 *  - redo() after swap (direction='redo'): flip back to 'accepted'
 */
_registerAiApplyUndoCallback((suggestionIds: string[], direction: AiApplyUndoDirection) => {
  const store = useSuggestionStore.getState();
  if (direction === 'redo:precheck') {
    return store.allInRunArePending(suggestionIds);
  }
  const targetStatus = direction === 'undo' ? 'pending' : 'accepted';
  for (const id of suggestionIds) {
    store.markStatusLocally(id, targetStatus);
    // Fire-and-forget the backend status update:
    store.postStatusToBackend(id, targetStatus).catch(() => {});
  }
});
```

- [ ] **Step 2: Modify `EditorPage.tsx`** — pageContext + sidebar mount

Open `frontend/src/components/resume/v2/EditorPage.tsx` and add:

```tsx
import { usePageContext } from '@/hooks/usePageContext';
import { AISidebar } from '@/components/ai/AISidebar';
import { useSuggestionStore } from '@/stores/aiSuggestion';
import { useEffect } from 'react';
// ... near top of the component function:
const resume = useResumeStore((s) => s.resume);

// Register page context for the global AI panel:
usePageContext({
  page: 'resume_editor',
  summary: resume
    ? `正在编辑「${resume.title || '未命名'}」简历，目标 ${resume.metadata?.target_company ?? resume.metadata?.target_role ?? '未指定'}`
    : '加载中…',
  data: resume ? { resumeId: resume.id, title: resume.title } : undefined,
});

// Hydrate suggestions when resume changes:
useEffect(() => {
  if (resume) useSuggestionStore.getState().hydrate(resume.id);
}, [resume?.id]);
```

And mount `<AISidebar />` somewhere outside the editor content tree (so it can overlay):

```tsx
return (
  <>
    {/* ... existing editor JSX ... */}
    <AISidebar />
  </>
);
```

- [ ] **Step 3: Modify the three Overlay components** — add double-click handler

In each of `HeaderRowInteractionOverlay.tsx`, `EntryRowInteractionOverlay.tsx`, `BulletInteractionOverlay.tsx` (you'll find the existing ⋮⋮ DragHandle render), wrap or compose the handle with an `onDoubleClick`:

```tsx
import { useAISidebarUIStore } from '@/stores/aiSidebarUI';
// ... inside the JSX, on the handle wrapper div:
<div
  onDoubleClick={(e) => {
    e.stopPropagation();
    // For HeaderRow: scope is the rowKey; for entry: entryId; for bullet: bulletId
    const scope = /* the block id this handle belongs to */;
    useAISidebarUIStore.getState().open(scope);
  }}
>
  {/* existing DragHandle */}
</div>
```

Pick the correct `scope` per overlay:
- HeaderRowInteractionOverlay → `headerId` (or pass the row's id if more useful)
- EntryRowInteractionOverlay → `entryId`
- BulletInteractionOverlay → `bulletId`

- [ ] **Step 4: Smoke test — full v2 regression must stay green**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/components/resume/v2 2>&1 | tail -3
# Expected: ≥ baseline (no regression)
npx vitest run src/components/ai src/stores 2>&1 | tail -3
# Expected: AI tests still pass
```

- [ ] **Step 5: Manual smoke (optional but recommended)**

Start dev server and verify in browser:
1. Open `/resume/<id>` — sidebar is closed by default
2. Double-click ⋮⋮ on a bullet → sidebar opens scoped to that bullet (empty if no suggestions)
3. Hit close (✕) → sidebar closes
4. Sidebar's `body.classList.toggle('ai-sidebar-open-narrow', ...)` works at narrow viewport
5. Page context populated when AI panel opens (visible in dev tools store inspector)

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npm run dev
# Visit http://localhost:3000/resume/<some-id>
```

- [ ] **Step 6: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add frontend/src/components/resume/v2/EditorPage.tsx frontend/src/components/resume/v2/atoms/HeaderRowInteractionOverlay.tsx frontend/src/components/resume/v2/atoms/EntryRowInteractionOverlay.tsx frontend/src/components/resume/v2/atoms/BulletInteractionOverlay.tsx frontend/src/stores/aiSuggestion.ts
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: EditorPage wires pageContext + sidebar + ⋮⋮ double-click; suggestion store wires undo callback"
```

---

## Task 21: Frontend — Wire AIChatPanel send → `/api/ai/run` + narration + button

**Files:**
- Modify: `frontend/src/components/layout/AIChatPanel/index.tsx`

Per spec § 6.4: chat-triggered run → chat shows brief assistant reply + appends in-place narration during run + emits "📋 View in sidebar" message on completion. Replace the panel's existing mock send with a real call to `POST /api/ai/run`, then open SSE via `runSSEStream` (Task 17).

The panel already uses `useConversationStore` for messages and `useAiPanelStore` for height state — both unchanged. Only the send handler is rewired.

- [ ] **Step 1: Identify the existing send handler**

```bash
grep -n "send\|onSend\|appendMessage\|mock" /Users/fred/Desktop/CareerOps-Pro/frontend/src/components/layout/AIChatPanel/index.tsx | head -20
```

Locate where user input is currently dispatched (look for the function that handles input submission).

- [ ] **Step 2: Replace the send handler**

In `frontend/src/components/layout/AIChatPanel/index.tsx`, replace the existing send-to-mock logic with:

```tsx
import { runSSEStream } from '@/components/ai/AISessionClient';
import { useAISidebarUIStore } from '@/stores/aiSidebarUI';
import { usePageContextStore } from '@/stores/pageContext';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { useSelectionStore } from '@/components/resume/v2/store/useSelectionStore'; // adjust path if differs

async function sendToAI(userText: string) {
  const append = useConversationStore.getState().appendMessage;
  append({ role: 'user', content: userText, ts: Date.now() });

  const ctx = usePageContextStore.getState().context;
  const resume = useResumeStore.getState().resume;
  if (!ctx || ctx.page !== 'resume_editor' || !resume) {
    append({ role: 'assistant', content: 'AI 仅在简历编辑页可用。', ts: Date.now() });
    return;
  }

  const selection = useSelectionStore.getState().selectedBlockIds ?? [];
  const chatHistory = useConversationStore.getState().messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  // Optimistic immediate ack:
  const ackId = Date.now();
  append({ role: 'assistant', content: '好的，正在处理…', ts: ackId });

  // Fire the run — POST /run returns IMMEDIATELY with runId; orchestration
  // runs in a backend daemon thread (Task 11). We connect SSE right after to
  // see live events as they happen.
  let runId: string;
  try {
    const r = await fetch('/api/ai/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeId: resume.id, userInput: userText,
        selection, chatHistory: chatHistory.slice(-10),
      }),
    });
    if (!r.ok) throw new Error(`/api/ai/run returned ${r.status}`);
    runId = (await r.json()).runId;
  } catch (err) {
    append({ role: 'assistant', content: `AI 调用失败：${String(err)}`, ts: Date.now() });
    return;
  }

  // Open SSE — live tail of events as the orchestrator emits them.
  // narrations append in real time; on run.completed show summary + button.
  runSSEStream(runId, {
    onNarration: (text, agentId) => {
      append({ role: 'assistant', content: `${agentId}: ${text}`, ts: Date.now() });
    },
    onCompleted: (rid, suggestionIds) => {
      if (suggestionIds.length === 0) return;  // pure answer, no review needed
      append({
        role: 'assistant',
        content: `提议了 ${suggestionIds.length} 处改动。`,
        ts: Date.now(),
        // Render a "view in sidebar" button alongside this message
        // (MessageList renders if action present):
        action: {
          label: '📋 查看详情',
          onClick: () => useAISidebarUIStore.getState().open(),
        },
      });
    },
    onError: (err) => {
      append({ role: 'assistant', content: `SSE 错误：${String(err)}`, ts: Date.now() });
    },
  });
}
```

(Adjust `useSelectionStore` import path to match the actual file in v2.)

- [ ] **Step 3: Update message renderer to support an optional `action` button**

Open `frontend/src/components/layout/AIChatPanel/MessageList.tsx`. Find where assistant messages render. Add support for an optional inline button:

```tsx
{m.action && (
  <button
    onClick={m.action.onClick}
    style={{
      marginTop: 6, padding: '3px 8px', background: '#d49b5e', color: '#2a1f12',
      border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer',
    }}
  >
    {m.action.label}
  </button>
)}
```

And update `frontend/src/stores/conversation.ts` `Message` type to allow optional `action`:

```typescript
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  action?: { label: string; onClick: () => void };  // ★ NEW
}
```

(Note: callbacks in zustand state aren't ideal for serialization. For v0 it's acceptable — messages with actions are session-scoped and the panel doesn't persist conversation state across reloads. If conversation IS persisted, mark `action` as `transient` or use an action registry keyed by runId — defer to plan time.)

- [ ] **Step 4: Smoke test — full v2 regression + new AI tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/components/resume/v2 2>&1 | tail -3
# Expected: ≥ baseline (no regression)
npx vitest run src/components/ai src/stores src/components/layout 2>&1 | tail -3
# Expected: all green
```

- [ ] **Step 5: Manual end-to-end smoke**

```bash
# Backend:
python -m uvicorn api.main:app --reload --port 8000 &
# Frontend:
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npm run dev
```

In browser at `http://localhost:3000/resume/<id>`:
1. Open AI panel, type "how many bullets in experience?", send → assistant replies with count
2. Type "make this bullet shorter" with a bullet selected → see narration, then "📋 查看详情" button
3. Click button → sidebar opens with one Suggestion
4. ✓ Accept → bullet content changes, undo entry pushed
5. Cmd+Z → bullet reverts, suggestion flips back to pending in sidebar
6. Drag a different bullet during AI run → soft-locked block doesn't drag
7. Verify drag still works on non-locked blocks (regression check)

- [ ] **Step 6: Commit**

```bash
git -C /Users/fred/Desktop/CareerOps-Pro add frontend/src/components/layout/AIChatPanel/index.tsx frontend/src/components/layout/AIChatPanel/MessageList.tsx frontend/src/stores/conversation.ts
git -C /Users/fred/Desktop/CareerOps-Pro commit -m "v0 ai: wire AIChatPanel send to /api/ai/run + SSE narration + view-in-sidebar button"
```

---

## Task 22: Final regression sweep + AC walkthrough (per spec § 11)

**Files:** none — verification only.

Per spec § 0.5 mandate: a final regression sweep is REQUIRED before merge. This task runs the full v2 + AI test suites, then walks through every AC item in spec § 11 with a manual smoke.

- [ ] **Step 1: Full backend test suite**

```bash
cd /Users/fred/Desktop/CareerOps-Pro && pytest tests/ -v 2>&1 | tail -20
```
Expected: ALL tests pass (jobs routes + AI routes + suggestions + read_tools + write_tools + context + llm + agents + runs + orchestrator).

- [ ] **Step 2: Full v2 frontend test suite**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/components/resume/v2 2>&1 | tail -3
```
Expected: ≥ Task 0 step 2 baseline count. **Per spec § 0.5 rule #10, this is a non-negotiable floor.**

- [ ] **Step 3: Full new AI surface test suite**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx vitest run src/components/ai src/stores 2>&1 | tail -3
```
Expected: all green.

- [ ] **Step 4: TypeScript check (no new errors)**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npx tsc --noEmit 2>&1 | grep -v "MarkdownInputRules.test.ts" | tail -10
```
Expected: only the pre-existing `MarkdownInputRules.test.ts` error (carried from before this feature). NO new errors.

- [ ] **Step 5: Run dev servers + manual AC walkthrough (spec § 11)**

```bash
# Backend:
cd /Users/fred/Desktop/CareerOps-Pro && python -m uvicorn api.main:app --reload --port 8000 &
# Frontend:
cd /Users/fred/Desktop/CareerOps-Pro/frontend && npm run dev
```

Walk through each AC item from spec § 11. Mark ✓ after manually verifying each:

- [ ] **AC 1 — Read-only chat:** type "我现在简历里 experience 有几条 bullet?" → Coordinator answers correctly using `get_current_resume`. No sidebar opens.
- [ ] **AC 2 — Polish single bullet:** select a bullet via ⋮⋮; type "改写得更动作化"; sidebar opens via [📋 查看详情] button; one Suggestion appears with correct `before`/`after`; Accept → bullet content updates, Cmd+Z undoes the accept.
- [ ] **AC 3 — Tailor experience section:** type "按这段 JD tailor 整个 experience: <paste>"; experience section soft-locks during run (~10–30 s); chat narration progresses; sidebar opens to show ≥3 Suggestions of mixed types (update + insert + delete); Accept all → all applied as one undo unit.
- [ ] **AC 4 — Optimistic supersede:** after a Suggestion is `pending`, edit the affected block manually; Suggestion row dims and shows "已被你修改 — 跳过"; Accept button disabled.
- [ ] **AC 5 — Application history query:** type "我最近申请过哪些 PM 岗？"; Coordinator calls `get_application_history` and answers correctly.
- [ ] **AC 6 — Persistence:** start a run; reload page mid-flight; orphan run marked error after 60s; pending Suggestions from completed runs survive reload (visible in sidebar).
- [ ] **AC 7 — Concurrent agents (deferred verification):** v0 only one agent runs at a time per turn. Skip — preparatory for v0.1 ReviewerAgent / parallel section dispatch.
- [ ] **AC 8 — Soft lock UX:** during an agent run, locked section is visibly dimmed with ✦ pulse; non-locked sections fully editable; lock releases at `agent.completed`.
- [ ] **AC 9 — Backend new routes:** `curl http://localhost:8000/api/jobs/` returns the job list; `curl http://localhost:8000/api/jobs/<id>` returns one.
- [ ] **AC 10 — No regressions:** Manual smoke checklist below. Sidebar open-state does not affect any of these.
  - [ ] Drag section / entry / bullet / header-row, including same-section adjacent swap and cross-page
  - [ ] Notion-style Backspace on empty single-line; bullet outdent two-step
  - [ ] Font picker
  - [ ] Color / highlight
  - [ ] Text alignment
  - [ ] IME composition (Chinese pinyin into name + bullet)
  - [ ] Soft-lock acquire → release → resume editing on same block
  - [ ] Drag works while sidebar is open

- [ ] **Step 6: If all AC items pass, the v0 feature is done. No commit on this task.**

If anything fails, file a follow-up task (or fix in place if trivial) before declaring v0 complete.

---

## Self-Review (post-write check)

**Spec coverage scan** — every spec section maps to a task:

| Spec section | Task(s) |
|---|---|
| § 0.5 Non-Regression Mandate | Tasks 12, 13, 19 implement additive extensions; Task 22 is the regression sweep |
| § 1 Architecture overview | Tasks 10, 11, 14, 17 wire the boundary |
| § 2 Trigger model (chat only + selection focus) | Tasks 20, 21 |
| § 3.1 Read tools (6 tools) | Task 3 |
| § 3.2 Deferred (search/profile) | Out of scope — explicit |
| § 3.3 Write tools (10 tools) | Task 4 |
| § 3.4 jobs route | Task 2 |
| § 4.1 Agent inventory (Coordinator/Polish/Experience) | Tasks 7, 8, 9 |
| § 4.2 contextContract | Task 5 (context builder) + each agent task |
| § 4.3 LangGraph orchestration shape | Task 10 |
| § 4.4 SSE events | Task 11 (route) + Task 17 (consumer) |
| § 5.1 Schema (discriminated union) | Tasks 1 (backend) + 14 (frontend mirror) |
| § 5.2 Apply semantics + status route | Tasks 11, 16 |
| § 5.3 Persistence + retention | Task 1 |
| § 6.1 Sidebar | Task 18 |
| § 6.2 Soft lock | Task 19 |
| § 6.3 Inline marks | NOT YET implemented in v0 — see Open Items below |
| § 6.4 Chat integration | Task 21 |
| § 6.5 Selection ↔ Sidebar coupling | Task 18 (filter) + Task 20 (⋮⋮ open) |
| § 7 Concurrency (supersede + lock) | Tasks 16 (supersede) + 19 (lock) |
| § 8 Undo integration | Tasks 12, 16 |
| § 9 Persistence summary | Tasks 1, 10 (runs sidecar) |
| § 10 Error handling | Tasks 11 (SSE error event), 16 (rollback in transaction), 17 (onError callback) |
| § 11 Acceptance criteria | Task 22 |
| § 12 Out of scope | Documented |
| § 13 Decision Record | Documented |
| § 14 Open Questions | LLM provider locked (Anthropic) in Task 0; chat history budget set at "last 10 turns" in Task 21 |

**Open items intentionally deferred to follow-up tasks (acknowledged gaps):**

- **§ 6.3 Inline marks (post-acceptance fade window).** v0 ships without the per-block "✦ + accent border for 5min after accept" decoration. The structural undo path works (Cmd+Z restores) — this is purely visual polish. **Add as a post-v0 task** when reviewing user feedback (likely Task 23 in a follow-up plan).
- **Live streaming during the run.** v0 dispatches orchestration to a daemon thread (POST /run returns immediately) and emits events to a per-run `event_queue` (Task 10 Step 3.5) that the SSE handler tails in real time. Soft lock visual + narration progress work *during* the run as spec § 6.2 requires. The "burst at end of agent" approximation in `_emit_streamed_suggestions_for_run` is the only remaining time-spread gap (suggestion.streamed events fire when the agent's tool-call burst finishes rather than per individual tool call) — true per-tool streaming is a v0.1 polish; v0 still satisfies all spec ACs.
- **search_user_data + get_user_profile read tools.** Explicitly deferred per spec § 3.2.

**Placeholder scan** — none. Every code step contains complete code or a precise existing-file modification with surrounding context. Acceptance criteria in Task 22 reference concrete commands.

**Type consistency** — verified across tasks:
- `Suggestion` shape matches between `services/ai/types.py` (Task 1), `frontend/src/stores/aiSuggestion.ts` (Task 14), and the discriminated-union check in `concurrencyCheck.ts` (Task 15)
- `forcedId` parameter signatures consistent: Task 13 adds them; Tasks 16 + 4 use them; the optional position is consistent (last param)
- `_aiApplyTransaction(label, meta, fn)` signature consistent: Task 12 defines, Task 16 calls
- `AiApplyUndoCallback` signature consistent: Task 12 defines, Task 20 step 1 wires it via Task 14's store
- API routes use `/api/resume` (singular, mounted at app level) and `/api/ai/...` consistently throughout (Tasks 11, 14, 16, 21)

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-28-resume-editor-ai.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good for: a 23-task plan with strict regression requirements (every commit must keep the v2 test suite green).

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Good for: lighter coordination overhead, but with 23 tasks the context will get heavy.

**Which approach?**
