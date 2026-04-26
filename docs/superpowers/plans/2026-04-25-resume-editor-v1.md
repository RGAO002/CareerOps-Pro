# Resume Editor v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 Resume Editor — usable end-to-end on a real user's PDF resume, with structural ops, multi-page visualization, real persistence, multi-resume support, save status, real PDF export, doc-level history, and minimal AI bullet rewrite.

**Architecture:** Next.js 16 App Router + TipTap 3 frontend; FastAPI backend with file-based JSON storage under `saved_sessions/resumes/`. PDF export uses `window.print()` (Chromium renders both editor canvas AND PDF — guaranteed visual fidelity). PDF parsing reuses `services/resume_parser.py`. AI calls go through a multi-agent-compatible orchestrator from day one.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Zustand 5, `@tiptap/react` v3, FastAPI, pytest (added), pypdf/pymupdf, langchain (existing).

**Reference spec:** `docs/superpowers/specs/2026-04-25-resume-editor-v1-design.md`

**Branch:** New feature branch `feature/resume-editor-v1` off `main`. **No worktree** (user preference) — branch is checked out in `/Users/fred/Desktop/CareerOps-Pro/` directly.

---

## Conventions

- **TypeScript strictness:** Repo has a pre-existing type error in `LandingHero.tsx:238` (framer-motion). Ignore only that one. Any new error is a regression.
- **Verification per task:** Run `cd frontend && npx tsc --noEmit` after frontend tasks; `cd /Users/fred/Desktop/CareerOps-Pro && python -m pytest tests/api -q` after backend tasks.
- **Commits:** Imperative mood, no `feat:` prefix. Match existing repo style (`git log --oneline`).
- **API base URL:** Frontend uses `process.env.NEXT_PUBLIC_API_BASE` (default `http://localhost:8000`).
- **No worktree:** Always operate on files in `/Users/fred/Desktop/CareerOps-Pro/`, not worktree paths (per `CLAUDE.md`).

---

## File Structure

### Backend (Python)

**Created:**
- `api/converters/__init__.py`
- `api/converters/resume.py` — `legacy_json_to_tiptap_doc()` pure function
- `api/services/__init__.py` (separate from `services/`; this lives under `api/`)
- `api/services/resume_store.py` — file CRUD on `saved_sessions/resumes/{id}.json`
- `api/services/snapshot_store.py` — snapshot CRUD + retention
- `api/services/ai_orchestrator.py` — multi-agent-compatible tool dispatch
- `api/services/ai_tools.py` — `rewrite_bullet` tool implementation
- `api/models/__init__.py`
- `api/models/resume.py` — Pydantic models for Resume, Snapshot, ToolCall, ToolResult
- `tests/__init__.py`
- `tests/api/__init__.py`
- `tests/api/test_resume_store.py`
- `tests/api/test_snapshot_store.py`
- `tests/api/test_legacy_converter.py`
- `tests/api/test_orchestrator.py`
- `tests/conftest.py` — fixtures (tmp `saved_sessions` dir, etc.)

**Modified:**
- `requirements.txt` — add `pytest`, `httpx` (FastAPI test client)
- `api/routes/resume.py` — replace single-purpose router with v1 endpoints

### Frontend (TypeScript / React)

**Created:**
- `frontend/src/lib/resumeApi.ts` — typed API client
- `frontend/src/lib/relativeTime.ts` — "3 min ago" formatter
- `frontend/src/components/resume/SaveBadge.tsx` — extracted, with relative time
- `frontend/src/components/resume/ResumeDropdown.tsx` — top-bar variant switcher
- `frontend/src/components/resume/NewVariantModal.tsx` — fork dialog
- `frontend/src/components/resume/ImportBanner.tsx` — orange "just imported" banner
- `frontend/src/components/resume/PageBreakOverlay.tsx` — dashed lines + page badges
- `frontend/src/components/resume/HistoryPanel.tsx` — snapshot list + restore
- `frontend/src/components/resume/AIRewriteBulletPopover.tsx` — AI rewrite UI
- `frontend/src/components/resume/AddSectionPopover.tsx` — section type chooser
- `frontend/src/components/resume/HoverAffordance.tsx` — shared drag handle + button cluster
- `frontend/src/components/resume/extensions/nodeViews/SectionNodeView.tsx`
- `frontend/src/components/resume/extensions/nodeViews/EntryNodeView.tsx`
- `frontend/src/components/resume/extensions/nodeViews/BulletNodeView.tsx`
- `frontend/src/components/upload/PdfUploader.tsx` — drag-drop upload component
- `frontend/src/app/upload/page.tsx` — dedicated upload page

**Modified:**
- `frontend/src/components/resume/types.ts` — add `ResumeSnapshot`, `RewriteRequest` types
- `frontend/src/components/resume/seed.ts` — keep for type validation; runtime no longer uses
- `frontend/src/components/resume/ResumeEditor.tsx` — switch from localStorage → API; wire history, banner, AI
- `frontend/src/components/resume/EditorTopBar.tsx` — embed `ResumeDropdown`, `SaveBadge`, `History` button
- `frontend/src/components/resume/EditorCanvas.tsx` — render `PageBreakOverlay`
- `frontend/src/components/resume/extensions/createResumeEditor.ts` — register NodeViews; fix duplicate `link` warning
- `frontend/src/components/resume/extensions/ResumeSectionNode.ts` — add NodeView attachment
- `frontend/src/components/resume/extensions/EntryNode.ts` — add NodeView attachment
- `frontend/src/components/resume/extensions/BulletNode.ts` — add NodeView attachment
- `frontend/src/components/resume/resume-editor.css` — print rules + hover affordance styles
- `frontend/src/stores/resumeEditor.ts` — replace localStorage with API operations
- `frontend/src/lib/localResumeStore.ts` — delete (no longer used) OR repurpose as offline buffer (see Task 13)
- `frontend/src/app/page.tsx` (landing) — wire upload CTA to real flow

---

## Task List Overview

```
Phase 0: Branch + dev hygiene                 (Tasks 0–2)
Phase 1: Backend foundation                   (Tasks 3–7)
Phase 2: Backend API endpoints                (Tasks 8–13)
Phase 3: Frontend API client + store          (Tasks 14–17)
Phase 4: Save status + dropdown + variants    (Tasks 18–21)
Phase 5: PDF upload + import banner           (Tasks 22–24)
Phase 6: Editor UX (NodeViews + drag + add)   (Tasks 25–30)
Phase 7: Multi-page visualization             (Tasks 31–32)
Phase 8: PDF export polish                    (Tasks 33–34)
Phase 9: History panel                        (Tasks 35–37)
Phase 10: AI bullet rewrite                   (Tasks 38–42)
Phase 11: Acceptance walkthrough              (Task 43)
```

---

## Phase 0: Branch + Dev Hygiene

### Task 0: Create branch + verify clean baseline

**Files:** none (git only)

- [ ] **Step 1: Verify clean working tree on main**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
git status --short
```
Expected: empty output (no modified files).

- [ ] **Step 2: Create feature branch off main**

```bash
git checkout -b feature/resume-editor-v1
```
Expected: `Switched to a new branch 'feature/resume-editor-v1'`.

- [ ] **Step 3: Verify dev server starts cleanly**

```bash
cd frontend && npx next dev -p 3000
```
Open `http://localhost:3000/resume/test` in browser. Confirm editor renders (with seed data) without build errors. Stop server (Ctrl+C) before continuing.

- [ ] **Step 4: Verify backend starts**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
uvicorn api.main:app --reload --port 8000
```
Open `http://localhost:8000/api/health` — expect `{"status":"ok"}`. Stop server.

- [ ] **Step 5: Note baseline tsc error count**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -5
```
Note the exact count (should be **1 pre-existing error** in `LandingHero.tsx`).

---

### Task 1: Fix existing TipTap warnings (link duplicate, hydration)

**Files:**
- Modify: `frontend/src/components/resume/extensions/createResumeEditor.ts`
- Modify: `frontend/src/app/resume/[id]/page.tsx`

The current editor logs two warnings on every load:
1. `Duplicate extension names found: ['link']` — `StarterKit` already includes link; `extension-link` is added separately.
2. Hydration mismatch — server renders without localStorage, client renders with it.

These are non-blocking but pollute the console and cause first-paint flicker. Fix before adding more.

- [ ] **Step 1: Read current `createResumeEditor.ts`**

```bash
cat frontend/src/components/resume/extensions/createResumeEditor.ts
```

- [ ] **Step 2: Disable starter-kit's bundled link extension**

In `createResumeEditor.ts`, add `link: false` to the `StarterKit.configure({...})` block. Final relevant section:

```ts
StarterKit.configure({
  document: false,
  heading: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  codeBlock: false,
  blockquote: false,
  horizontalRule: false,
  link: false,  // we add Link extension separately below
}),
```

- [ ] **Step 3: Verify warning is gone**

Run dev server, open `/resume/test`, check browser console — no `Duplicate extension names` warning.

- [ ] **Step 4: Wrap ResumeEditor in dynamic import to avoid SSR**

Replace `frontend/src/app/resume/[id]/page.tsx` with:

```tsx
// frontend/src/app/resume/[id]/page.tsx
import { AppShell } from "@/components/layout/AppShell";
import dynamic from "next/dynamic";

const ResumeEditor = dynamic(
  () => import("@/components/resume/ResumeEditor").then((m) => m.ResumeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center text-neutral-400">
        Loading editor…
      </div>
    ),
  },
);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResumeEditorPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <AppShell>
      <ResumeEditor id={id} />
    </AppShell>
  );
}
```

- [ ] **Step 5: Verify hydration warning is gone**

Reload `/resume/test`. Open DevTools console. Should see no "Hydration failed" warning.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/resume/extensions/createResumeEditor.ts frontend/src/app/resume/\[id\]/page.tsx
git commit -m "Fix TipTap link-extension duplicate + SSR hydration mismatch"
```

---

### Task 2: Add pytest + httpx to backend deps

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Append test deps to `requirements.txt`**

Add at the end of `requirements.txt`:

```
# Testing
pytest>=8.0
httpx>=0.27
```

- [ ] **Step 2: Install**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
pip install -r requirements.txt
```
Expected: pytest + httpx install successfully.

- [ ] **Step 3: Verify pytest runs**

```bash
python -m pytest --version
```
Expected: pytest version printed.

- [ ] **Step 4: Commit**

```bash
git add requirements.txt
git commit -m "Add pytest + httpx to dev deps"
```

---

## Phase 1: Backend Foundation

### Task 3: Pydantic models for Resume + Snapshot

**Files:**
- Create: `api/models/__init__.py`
- Create: `api/models/resume.py`
- Create: `tests/__init__.py`
- Create: `tests/api/__init__.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Create empty `__init__.py` files**

```bash
touch api/models/__init__.py tests/__init__.py tests/api/__init__.py
```

- [ ] **Step 2: Write `tests/conftest.py`**

```python
# tests/conftest.py
"""Shared pytest fixtures."""
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def tmp_resumes_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Provide a temporary saved_sessions/resumes directory.

    Patches the resume_store module's RESUMES_DIR so any code under test
    operating on it uses the tmp dir instead of the real saved_sessions/.
    """
    resumes_dir = tmp_path / "resumes"
    resumes_dir.mkdir(parents=True)
    (resumes_dir / "snapshots").mkdir()

    # Patch happens lazily — the modules import this at construct time,
    # so test code does `monkeypatch.setattr` against the module attribute.
    yield resumes_dir
```

- [ ] **Step 3: Write `api/models/resume.py`**

```python
# api/models/resume.py
"""Pydantic models for the Resume Editor v1 API."""
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


SnapshotTrigger = Literal["auto", "manual_save", "ai_edit", "checkpoint"]


class ResumeMeta(BaseModel):
    """Metadata about a resume — everything except the doc content."""
    id: str
    user_id: str = "current-user"  # single-user assumption in v1
    parent_id: Optional[str] = None
    is_base: bool = True
    title: str
    schema_version: int = 1
    created_at: int  # epoch ms
    updated_at: int

    # Tailoring context
    target_company: Optional[str] = None
    target_company_domain: Optional[str] = None
    target_role: Optional[str] = None

    # Data strategy (PRODUCT_NOTES §4)
    is_user_consented_for_benchmark: bool = False


class Resume(ResumeMeta):
    """Full resume record: meta + doc."""
    doc: dict[str, Any] = Field(default_factory=lambda: {"type": "doc", "content": []})


class ResumeSnapshot(BaseModel):
    """One historical snapshot of a resume."""
    id: str
    resume_id: str
    created_at: int
    trigger: SnapshotTrigger
    label: Optional[str] = None
    ai_message_id: Optional[str] = None
    diff_summary: Optional[str] = None
    doc: dict[str, Any]


class ToolCall(BaseModel):
    """One AI tool invocation. Designed to be batched (PRODUCT_NOTES §13)."""
    name: str  # e.g. "rewrite_bullet"
    arguments: dict[str, Any]


class ToolResult(BaseModel):
    """Result of one tool call."""
    name: str
    success: bool
    data: Optional[dict[str, Any]] = None
    error: Optional[str] = None
```

- [ ] **Step 4: Verify imports work**

```bash
python -c "from api.models.resume import Resume, ResumeSnapshot, ToolCall, ToolResult; print('ok')"
```
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add api/models/ tests/__init__.py tests/api/__init__.py tests/conftest.py
git commit -m "Add Pydantic models for Resume, Snapshot, ToolCall + pytest scaffolding"
```

---

### Task 4: Resume store — file CRUD with tests

**Files:**
- Create: `api/services/__init__.py`
- Create: `api/services/resume_store.py`
- Create: `tests/api/test_resume_store.py`

- [ ] **Step 1: Create `api/services/__init__.py`**

```bash
touch api/services/__init__.py
```

- [ ] **Step 2: Write the failing test**

`tests/api/test_resume_store.py`:

```python
# tests/api/test_resume_store.py
"""Tests for the file-based resume store."""
from pathlib import Path

import pytest

from api.models.resume import Resume
from api.services import resume_store


@pytest.fixture(autouse=True)
def isolate_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect resume_store.RESUMES_DIR to a temp dir for each test."""
    d = tmp_path / "resumes"
    d.mkdir()
    monkeypatch.setattr(resume_store, "RESUMES_DIR", d)
    return d


def _make_resume(rid: str = "abc", title: str = "Test") -> Resume:
    return Resume(
        id=rid,
        title=title,
        created_at=1000,
        updated_at=1000,
    )


def test_save_then_get_returns_same_resume():
    r = _make_resume("r1", "Base")
    resume_store.save(r)
    loaded = resume_store.get("r1")
    assert loaded is not None
    assert loaded.id == "r1"
    assert loaded.title == "Base"


def test_get_missing_returns_none():
    assert resume_store.get("nonexistent") is None


def test_list_returns_all_in_updated_at_desc():
    resume_store.save(Resume(id="a", title="A", created_at=100, updated_at=100))
    resume_store.save(Resume(id="b", title="B", created_at=200, updated_at=200))
    resume_store.save(Resume(id="c", title="C", created_at=150, updated_at=150))

    listed = resume_store.list_all()
    assert [r.id for r in listed] == ["b", "c", "a"]


def test_save_overwrites_existing():
    resume_store.save(_make_resume("x", "Original"))
    resume_store.save(_make_resume("x", "Updated"))
    assert resume_store.get("x").title == "Updated"


def test_delete_removes_file():
    resume_store.save(_make_resume("y"))
    assert resume_store.get("y") is not None
    resume_store.delete("y")
    assert resume_store.get("y") is None
```

- [ ] **Step 3: Run test — confirm it fails**

```bash
python -m pytest tests/api/test_resume_store.py -v
```
Expected: ImportError (resume_store doesn't exist yet).

- [ ] **Step 4: Implement `api/services/resume_store.py`**

```python
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
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
python -m pytest tests/api/test_resume_store.py -v
```
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add api/services/__init__.py api/services/resume_store.py tests/api/test_resume_store.py
git commit -m "Add file-based resume store with full CRUD + tests"
```

---

### Task 5: Snapshot store — CRUD + retention with tests

**Files:**
- Create: `api/services/snapshot_store.py`
- Create: `tests/api/test_snapshot_store.py`

- [ ] **Step 1: Write the failing tests**

`tests/api/test_snapshot_store.py`:

```python
# tests/api/test_snapshot_store.py
"""Tests for snapshot CRUD + retention."""
from pathlib import Path

import pytest

from api.models.resume import ResumeSnapshot
from api.services import snapshot_store


@pytest.fixture(autouse=True)
def isolate_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    snap_dir = tmp_path / "snapshots"
    snap_dir.mkdir()
    monkeypatch.setattr(snapshot_store, "SNAPSHOTS_DIR", snap_dir)
    return snap_dir


def _snap(sid: str, rid: str, ts: int, trigger: str = "auto") -> ResumeSnapshot:
    return ResumeSnapshot(
        id=sid,
        resume_id=rid,
        created_at=ts,
        trigger=trigger,
        doc={"type": "doc", "content": []},
    )


def test_save_then_list_for_resume():
    snapshot_store.save(_snap("s1", "r1", 100))
    snapshot_store.save(_snap("s2", "r1", 200))
    snapshot_store.save(_snap("s3", "r2", 150))

    r1_snaps = snapshot_store.list_for_resume("r1")
    assert [s.id for s in r1_snaps] == ["s2", "s1"]  # newest first


def test_get_specific_snapshot():
    snapshot_store.save(_snap("s1", "r1", 100, "ai_edit"))
    s = snapshot_store.get("s1")
    assert s is not None
    assert s.trigger == "ai_edit"


def test_get_missing_returns_none():
    assert snapshot_store.get("does_not_exist") is None


def test_retention_keeps_ai_edit_and_checkpoint_forever():
    """Adding 60 auto snapshots must NOT remove ai_edit / checkpoint snapshots."""
    snapshot_store.save(_snap("ai1", "r1", 1, "ai_edit"))
    snapshot_store.save(_snap("ck1", "r1", 2, "checkpoint"))
    for i in range(60):
        snapshot_store.save(_snap(f"auto{i}", "r1", 1000 + i, "auto"))

    snapshot_store.enforce_retention("r1")

    snaps = snapshot_store.list_for_resume("r1")
    ids = {s.id for s in snaps}
    assert "ai1" in ids
    assert "ck1" in ids
    # auto + manual_save: rolling 50 most recent (combined cap)
    rolling = [s for s in snaps if s.trigger in ("auto", "manual_save")]
    assert len(rolling) == 50


def test_retention_combined_cap_for_auto_and_manual():
    for i in range(30):
        snapshot_store.save(_snap(f"a{i}", "r1", i, "auto"))
    for i in range(30):
        snapshot_store.save(_snap(f"m{i}", "r1", 1000 + i, "manual_save"))

    snapshot_store.enforce_retention("r1")

    snaps = snapshot_store.list_for_resume("r1")
    rolling = [s for s in snaps if s.trigger in ("auto", "manual_save")]
    assert len(rolling) == 50
```

- [ ] **Step 2: Run — fails (no module)**

```bash
python -m pytest tests/api/test_snapshot_store.py -v
```
Expected: ImportError.

- [ ] **Step 3: Implement `api/services/snapshot_store.py`**

```python
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
    to_delete = rolling[ROLLING_LIMIT:]  # everything past the limit (oldest)
    for s in to_delete:
        path = _resume_dir(s.resume_id) / f"{s.id}.json"
        if path.exists():
            path.unlink()
```

- [ ] **Step 4: Run — pass**

```bash
python -m pytest tests/api/test_snapshot_store.py -v
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add api/services/snapshot_store.py tests/api/test_snapshot_store.py
git commit -m "Add snapshot store with retention policy + tests"
```

---

### Task 6: legacy → TipTap doc converter with tests

**Files:**
- Create: `api/converters/__init__.py`
- Create: `api/converters/resume.py`
- Create: `tests/api/test_legacy_converter.py`

- [ ] **Step 1: Create `__init__.py`**

```bash
touch api/converters/__init__.py
```

- [ ] **Step 2: Write the failing test**

`tests/api/test_legacy_converter.py`:

```python
# tests/api/test_legacy_converter.py
"""Tests for legacy parser JSON → TipTap doc conversion."""
from api.converters.resume import legacy_json_to_tiptap_doc


def test_minimal_resume_yields_header_and_no_sections():
    legacy = {
        "name": "Alex Chen",
        "role": "SWE",
        "contact": ["alex@example.com"],
    }
    doc = legacy_json_to_tiptap_doc(legacy)

    assert doc["type"] == "doc"
    header = doc["content"][0]
    assert header["type"] == "resumeHeader"
    # Name is inline content
    assert header["content"][0]["text"] == "Alex Chen"
    # Contacts are an attribute array
    assert "alex@example.com" in header["attrs"]["contacts"]


def test_experience_becomes_section_with_entries_and_bullets():
    legacy = {
        "name": "Alex",
        "contact": [],
        "experience": [
            {
                "company": "Snapbrillia",
                "role": "Founding Engineer",
                "date": "Jan 2024 – Present",
                "bullets": ["Built the API", "Led the architecture"],
            }
        ],
    }
    doc = legacy_json_to_tiptap_doc(legacy)
    sections = [n for n in doc["content"] if n["type"] == "resumeSection"]
    exp = next(s for s in sections if s["attrs"]["heading"] == "Experience")

    entry = exp["content"][0]
    assert entry["type"] == "entry"
    assert "Snapbrillia" in entry["attrs"]["title"]
    assert "Founding Engineer" in entry["attrs"]["title"]
    assert "Jan 2024" in entry["attrs"]["meta"]
    assert len(entry["content"]) == 2
    assert entry["content"][0]["type"] == "bullet"
    assert entry["content"][0]["content"][0]["text"] == "Built the API"


def test_skills_becomes_section_with_one_entry_per_category():
    legacy = {
        "name": "X",
        "contact": [],
        "skills": {
            "Languages": "Python, Go, TypeScript",
            "Cloud": "AWS, GCP",
        },
    }
    doc = legacy_json_to_tiptap_doc(legacy)
    skills = next(s for s in doc["content"] if s.get("attrs", {}).get("heading") == "Skills")
    headings = [e["attrs"]["title"] for e in skills["content"]]
    assert "Languages" in headings
    assert "Cloud" in headings


def test_summary_string_becomes_one_entry_one_bullet():
    legacy = {
        "name": "X",
        "contact": [],
        "summary": "Experienced backend engineer with 5 years in Python.",
    }
    doc = legacy_json_to_tiptap_doc(legacy)
    summary = next(s for s in doc["content"] if s.get("attrs", {}).get("heading") == "Summary")
    bullet_text = summary["content"][0]["content"][0]["content"][0]["text"]
    assert "backend engineer" in bullet_text


def test_section_order_is_summary_skills_experience_projects_education():
    legacy = {
        "name": "X",
        "contact": [],
        "summary": "S",
        "skills": {"Lang": "Py"},
        "experience": [{"company": "A", "role": "R", "date": "D", "bullets": ["b"]}],
        "projects": [{"name": "P", "tech": "T", "bullets": ["b"]}],
        "education": [{"school": "S", "degree": "D", "date": "D"}],
    }
    doc = legacy_json_to_tiptap_doc(legacy)
    headings = [n["attrs"]["heading"] for n in doc["content"] if n["type"] == "resumeSection"]
    assert headings == ["Summary", "Skills", "Experience", "Projects", "Education"]


def test_empty_legacy_still_returns_valid_doc():
    doc = legacy_json_to_tiptap_doc({})
    assert doc["type"] == "doc"
    # At minimum must have a header (TipTap schema requires it)
    assert doc["content"][0]["type"] == "resumeHeader"
```

- [ ] **Step 3: Run — fails**

```bash
python -m pytest tests/api/test_legacy_converter.py -v
```
Expected: ImportError.

- [ ] **Step 4: Implement converter**

`api/converters/resume.py`:

```python
# api/converters/resume.py
"""Convert legacy parser JSON (RESUME_SCHEMA) → TipTap doc JSON.

The legacy schema (services/resume_parser.py) outputs a flat dict with
keys: name, role, contact, skills, summary, experience, projects, education.

The TipTap schema (frontend/src/components/resume/extensions/) uses 4
node types: resumeHeader, resumeSection, entry, bullet.
"""
from typing import Any


def legacy_json_to_tiptap_doc(legacy: dict[str, Any]) -> dict[str, Any]:
    """Pure function. Order of sections in output: Summary, Skills, Experience, Projects, Education."""
    content: list[dict[str, Any]] = []

    # Header (always present, even if name is missing)
    name = (legacy.get("name") or "").strip()
    contacts = legacy.get("contact") or []
    if not isinstance(contacts, list):
        contacts = [str(contacts)]
    contacts = [str(c) for c in contacts if c]

    header_node: dict[str, Any] = {
        "type": "resumeHeader",
        "attrs": {"contacts": contacts},
        "content": [],
    }
    if name:
        header_node["content"].append({"type": "text", "text": name})
    content.append(header_node)

    # Summary
    summary = (legacy.get("summary") or "").strip()
    if summary:
        content.append(_section("Summary", [
            _entry(title="Summary", meta="", bullets=[summary]),
        ]))

    # Skills (one entry per category)
    skills = legacy.get("skills") or {}
    if isinstance(skills, dict) and skills:
        entries = []
        for category, items in skills.items():
            items_str = items if isinstance(items, str) else ", ".join(map(str, items))
            entries.append(_entry(title=str(category), meta="", bullets=[items_str]))
        content.append(_section("Skills", entries))

    # Experience
    exp_items = legacy.get("experience") or []
    if exp_items:
        entries = [_experience_entry(item) for item in exp_items if isinstance(item, dict)]
        if entries:
            content.append(_section("Experience", entries))

    # Projects
    proj_items = legacy.get("projects") or []
    if proj_items:
        entries = [_project_entry(item) for item in proj_items if isinstance(item, dict)]
        if entries:
            content.append(_section("Projects", entries))

    # Education
    edu_items = legacy.get("education") or []
    if edu_items:
        entries = [_education_entry(item) for item in edu_items if isinstance(item, dict)]
        if entries:
            content.append(_section("Education", entries))

    return {"type": "doc", "content": content}


def _section(heading: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    # TipTap schema requires entries+ ; if empty, insert a placeholder entry
    if not entries:
        entries = [_entry(title="", meta="", bullets=[""])]
    return {
        "type": "resumeSection",
        "attrs": {"heading": heading},
        "content": entries,
    }


def _entry(title: str, meta: str, bullets: list[str]) -> dict[str, Any]:
    bullet_nodes = [_bullet_node(text) for text in bullets] if bullets else [_bullet_node("")]
    return {
        "type": "entry",
        "attrs": {"title": title, "meta": meta},
        "content": bullet_nodes,
    }


def _bullet_node(text: str) -> dict[str, Any]:
    node: dict[str, Any] = {"type": "bullet", "content": []}
    if text:
        node["content"].append({"type": "text", "text": text})
    return node


def _experience_entry(item: dict[str, Any]) -> dict[str, Any]:
    company = (item.get("company") or "").strip()
    role = (item.get("role") or "").strip()
    title = " @ ".join(p for p in (role, company) if p) or company or role or "(untitled)"
    date = (item.get("date") or "").strip()
    bullets = [str(b) for b in (item.get("bullets") or []) if b]
    return _entry(title=title, meta=date, bullets=bullets)


def _project_entry(item: dict[str, Any]) -> dict[str, Any]:
    name = (item.get("name") or "").strip()
    tech = (item.get("tech") or "").strip()
    title = name or "(untitled project)"
    meta = tech
    bullets = [str(b) for b in (item.get("bullets") or []) if b]
    return _entry(title=title, meta=meta, bullets=bullets)


def _education_entry(item: dict[str, Any]) -> dict[str, Any]:
    school = (item.get("school") or "").strip()
    degree = (item.get("degree") or "").strip()
    title = " · ".join(p for p in (degree, school) if p) or school or degree or "(untitled)"
    date = (item.get("date") or "").strip()
    gpa = (item.get("gpa") or "").strip()
    meta = " · ".join(p for p in (date, f"GPA {gpa}" if gpa else "") if p)
    coursework = item.get("coursework") or []
    bullets = []
    if isinstance(coursework, list) and coursework:
        bullets.append("Coursework: " + ", ".join(map(str, coursework)))
    note = (item.get("note") or "").strip()
    if note:
        bullets.append(note)
    return _entry(title=title, meta=meta, bullets=bullets or [""])
```

- [ ] **Step 5: Run — pass**

```bash
python -m pytest tests/api/test_legacy_converter.py -v
```
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add api/converters/ tests/api/test_legacy_converter.py
git commit -m "Add legacy_json_to_tiptap_doc converter + tests"
```

---

### Task 7: AI orchestrator skeleton (multi-agent compatible)

**Files:**
- Create: `api/services/ai_orchestrator.py`
- Create: `api/services/ai_tools.py`
- Create: `tests/api/test_orchestrator.py`

Per spec §7.4, all AI tool invocation goes through a list-based dispatcher even though v1 only ever invokes one tool at a time. This locks in the contract for the multi-agent phase.

- [ ] **Step 1: Write the failing test**

`tests/api/test_orchestrator.py`:

```python
# tests/api/test_orchestrator.py
"""Tests for the AI orchestrator + tool registry."""
import pytest

from api.models.resume import ToolCall
from api.services import ai_orchestrator, ai_tools


def _stub_tool(args: dict) -> dict:
    return {"echo": args.get("text", "")}


def test_register_and_dispatch_single_tool():
    ai_orchestrator.TOOL_REGISTRY.clear()
    ai_orchestrator.register("echo", _stub_tool)
    results = ai_orchestrator.execute_tool_calls(
        resume_id="r1",
        calls=[ToolCall(name="echo", arguments={"text": "hi"})],
    )
    assert len(results) == 1
    assert results[0].success is True
    assert results[0].data == {"echo": "hi"}


def test_unknown_tool_returns_error_result():
    ai_orchestrator.TOOL_REGISTRY.clear()
    results = ai_orchestrator.execute_tool_calls(
        resume_id="r1",
        calls=[ToolCall(name="missing", arguments={})],
    )
    assert len(results) == 1
    assert results[0].success is False
    assert "missing" in (results[0].error or "").lower()


def test_dispatches_multiple_tools_in_order():
    ai_orchestrator.TOOL_REGISTRY.clear()
    log: list[str] = []
    ai_orchestrator.register("a", lambda args: (log.append("a"), {"ok": True})[1])
    ai_orchestrator.register("b", lambda args: (log.append("b"), {"ok": True})[1])

    results = ai_orchestrator.execute_tool_calls(
        resume_id="r1",
        calls=[ToolCall(name="a", arguments={}), ToolCall(name="b", arguments={})],
    )
    assert log == ["a", "b"]
    assert all(r.success for r in results)


def test_one_failing_tool_does_not_abort_others():
    ai_orchestrator.TOOL_REGISTRY.clear()

    def boom(args):
        raise ValueError("kaboom")

    ai_orchestrator.register("bad", boom)
    ai_orchestrator.register("good", lambda args: {"ok": True})

    results = ai_orchestrator.execute_tool_calls(
        resume_id="r1",
        calls=[ToolCall(name="bad", arguments={}), ToolCall(name="good", arguments={})],
    )
    assert results[0].success is False
    assert "kaboom" in (results[0].error or "")
    assert results[1].success is True
```

- [ ] **Step 2: Run — fails**

```bash
python -m pytest tests/api/test_orchestrator.py -v
```
Expected: ImportError.

- [ ] **Step 3: Implement orchestrator**

`api/services/ai_orchestrator.py`:

```python
# api/services/ai_orchestrator.py
"""Multi-agent-compatible AI tool dispatcher.

v1 only ever receives a single ToolCall (rewrite_bullet). The list-based
interface exists so the multi-agent phase can dispatch parallel calls from
a LangGraph node without API changes (PRODUCT_NOTES §13).
"""
from typing import Any, Callable

from api.models.resume import ToolCall, ToolResult


# Registry: tool name → callable that takes (arguments dict) and returns dict.
# Tools that need resume context should accept it via their args dict.
TOOL_REGISTRY: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {}


def register(name: str, fn: Callable[[dict[str, Any]], dict[str, Any]]) -> None:
    """Register a tool implementation."""
    TOOL_REGISTRY[name] = fn


def execute_tool_calls(resume_id: str, calls: list[ToolCall]) -> list[ToolResult]:
    """Run a list of tool calls in order. Failures are isolated per-call."""
    results: list[ToolResult] = []
    for call in calls:
        fn = TOOL_REGISTRY.get(call.name)
        if fn is None:
            results.append(ToolResult(
                name=call.name,
                success=False,
                error=f"Unknown tool: {call.name}",
            ))
            continue
        # Inject resume_id into args so tools can fetch context if needed
        args = {**call.arguments, "_resume_id": resume_id}
        try:
            data = fn(args)
            results.append(ToolResult(name=call.name, success=True, data=data))
        except Exception as exc:  # noqa: BLE001 — intentional broad catch per call
            results.append(ToolResult(name=call.name, success=False, error=str(exc)))
    return results
```

- [ ] **Step 4: Stub `ai_tools.py` (real implementation in Task 38)**

`api/services/ai_tools.py`:

```python
# api/services/ai_tools.py
"""AI tool implementations registered with ai_orchestrator.

v1 ships exactly one tool: rewrite_bullet. Real implementation lands in
Task 38. This module exists now as the registration entry point.
"""
from api.services import ai_orchestrator


def _placeholder_rewrite_bullet(args: dict) -> dict:
    """Placeholder. Real implementation in Task 38."""
    raise NotImplementedError("rewrite_bullet not yet implemented (Task 38)")


def register_all() -> None:
    """Idempotently register all v1 tools."""
    ai_orchestrator.register("rewrite_bullet", _placeholder_rewrite_bullet)
```

- [ ] **Step 5: Run tests — pass**

```bash
python -m pytest tests/api/test_orchestrator.py -v
```
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add api/services/ai_orchestrator.py api/services/ai_tools.py tests/api/test_orchestrator.py
git commit -m "Add AI orchestrator (multi-agent-compatible) with tool registry + tests"
```

---

## Phase 2: Backend API Endpoints

### Task 8: Replace `api/routes/resume.py` with v1 endpoints — list + get

**Files:**
- Modify: `api/routes/resume.py`
- Create: `tests/api/test_routes_resume.py`

The current `resume.py` only has session-based endpoints (legacy). Replace with the v1 surface. This task covers `GET /` (list) and `GET /:id`.

- [ ] **Step 1: Write the failing test**

`tests/api/test_routes_resume.py`:

```python
# tests/api/test_routes_resume.py
"""Integration tests for /api/resume routes."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.models.resume import Resume
from api.services import resume_store, snapshot_store


@pytest.fixture(autouse=True)
def isolate_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    rdir = tmp_path / "resumes"
    rdir.mkdir()
    sdir = rdir / "snapshots"
    sdir.mkdir()
    monkeypatch.setattr(resume_store, "RESUMES_DIR", rdir)
    monkeypatch.setattr(snapshot_store, "SNAPSHOTS_DIR", sdir)


@pytest.fixture
def client():
    return TestClient(app)


def _seed_resume(rid: str, title: str, ts: int = 1000) -> None:
    resume_store.save(Resume(id=rid, title=title, created_at=ts, updated_at=ts))


def test_list_returns_empty_when_no_resumes(client):
    resp = client.get("/api/resume/")
    assert resp.status_code == 200
    assert resp.json() == {"resumes": []}


def test_list_returns_summary_fields_only(client):
    _seed_resume("a", "A", 100)
    _seed_resume("b", "B", 200)
    resp = client.get("/api/resume/")
    assert resp.status_code == 200
    items = resp.json()["resumes"]
    assert len(items) == 2
    assert items[0]["id"] == "b"  # newest first
    assert "title" in items[0]
    assert "doc" not in items[0]  # summary view, not full


def test_get_one_returns_full_resume(client):
    _seed_resume("x", "X")
    resp = client.get("/api/resume/x")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "x"
    assert "doc" in body


def test_get_missing_returns_404(client):
    resp = client.get("/api/resume/nope")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run — fails (old routes don't return shape we expect)**

```bash
python -m pytest tests/api/test_routes_resume.py -v
```

- [ ] **Step 3: Replace `api/routes/resume.py`**

```python
# api/routes/resume.py
"""Resume Editor v1 API.

Endpoints:
  GET    /                  list user's resumes (summary)
  GET    /:id              full resume
  PUT    /:id              update doc + meta
  POST   /                 create blank resume
  POST   /parse            upload PDF, parse, return new resume
  POST   /:id/variant      fork variant
  POST   /:id/snapshot     create explicit snapshot
  GET    /:id/snapshots    list snapshots
  POST   /:id/restore      restore from snapshot id
  POST   /:id/ai/rewrite-bullet   AI tool dispatch
"""
from fastapi import APIRouter, HTTPException

from api.models.resume import Resume
from api.services import resume_store


router = APIRouter()


@router.get("/")
async def list_resumes() -> dict:
    """List the current user's resumes (summary view, no doc)."""
    resumes = resume_store.list_all()
    return {
        "resumes": [
            {
                "id": r.id,
                "title": r.title,
                "parent_id": r.parent_id,
                "is_base": r.is_base,
                "target_company": r.target_company,
                "target_role": r.target_role,
                "updated_at": r.updated_at,
            }
            for r in resumes
        ],
    }


@router.get("/{resume_id}")
async def get_resume(resume_id: str) -> Resume:
    """Get one resume in full (meta + doc)."""
    r = resume_store.get(resume_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return r
```

- [ ] **Step 4: Run — pass**

```bash
python -m pytest tests/api/test_routes_resume.py -v
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add api/routes/resume.py tests/api/test_routes_resume.py
git commit -m "Replace resume routes with v1 GET list + GET one"
```

---

### Task 9: PUT /:id — save resume

**Files:**
- Modify: `api/routes/resume.py`
- Modify: `tests/api/test_routes_resume.py`

- [ ] **Step 1: Append test**

Add to `tests/api/test_routes_resume.py`:

```python
def test_put_creates_or_replaces_resume(client):
    payload = {
        "id": "new1",
        "title": "Brand new",
        "created_at": 1000,
        "updated_at": 1000,
        "doc": {"type": "doc", "content": []},
    }
    resp = client.put("/api/resume/new1", json=payload)
    assert resp.status_code == 200
    assert resp.json()["id"] == "new1"

    # Verify persisted
    got = client.get("/api/resume/new1")
    assert got.status_code == 200
    assert got.json()["title"] == "Brand new"


def test_put_with_mismatched_id_uses_url_id(client):
    """URL :id wins if body id differs (defensive)."""
    payload = {
        "id": "bodyid",
        "title": "T",
        "created_at": 1,
        "updated_at": 1,
        "doc": {"type": "doc", "content": []},
    }
    resp = client.put("/api/resume/urlid", json=payload)
    assert resp.status_code == 200
    assert resp.json()["id"] == "urlid"
    assert resume_store.get("urlid") is not None
    assert resume_store.get("bodyid") is None
```

- [ ] **Step 2: Run — fails (no PUT)**

```bash
python -m pytest tests/api/test_routes_resume.py -v -k put
```

- [ ] **Step 3: Add PUT handler in `api/routes/resume.py`**

```python
@router.put("/{resume_id}")
async def upsert_resume(resume_id: str, payload: Resume) -> Resume:
    """Create or replace a resume. URL id always wins."""
    payload.id = resume_id
    payload.updated_at = max(payload.updated_at, _now_ms())
    resume_store.save(payload)
    return payload


def _now_ms() -> int:
    import time
    return int(time.time() * 1000)
```

- [ ] **Step 4: Run — pass**

```bash
python -m pytest tests/api/test_routes_resume.py -v -k put
```

- [ ] **Step 5: Commit**

```bash
git add api/routes/resume.py tests/api/test_routes_resume.py
git commit -m "Add PUT /api/resume/:id endpoint"
```

---

### Task 10: POST / — create blank resume

**Files:**
- Modify: `api/routes/resume.py`
- Modify: `tests/api/test_routes_resume.py`

- [ ] **Step 1: Append test**

```python
def test_post_creates_blank_resume(client):
    resp = client.post("/api/resume/", json={"title": "Empty"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Empty"
    assert body["id"]
    assert body["doc"]["type"] == "doc"
    # Verify persisted
    assert resume_store.get(body["id"]) is not None
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Add POST handler**

In `api/routes/resume.py`, add:

```python
import uuid

from pydantic import BaseModel


class CreateResumeRequest(BaseModel):
    title: str = "Untitled resume"


@router.post("/")
async def create_blank_resume(body: CreateResumeRequest) -> Resume:
    """Create a new blank resume."""
    rid = str(uuid.uuid4())
    now = _now_ms()
    blank_doc = {
        "type": "doc",
        "content": [
            {"type": "resumeHeader", "attrs": {"contacts": []}, "content": []},
            {
                "type": "resumeSection",
                "attrs": {"heading": "Experience"},
                "content": [
                    {
                        "type": "entry",
                        "attrs": {"title": "", "meta": ""},
                        "content": [{"type": "bullet", "content": []}],
                    }
                ],
            },
        ],
    }
    r = Resume(id=rid, title=body.title, created_at=now, updated_at=now, doc=blank_doc)
    resume_store.save(r)
    return r
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add api/routes/resume.py tests/api/test_routes_resume.py
git commit -m "Add POST /api/resume/ — create blank resume"
```

---

### Task 11: POST /parse — PDF upload + parse

**Files:**
- Modify: `api/routes/resume.py`
- Modify: `requirements.txt` (ensure `python-multipart` present)
- Modify: `tests/api/test_routes_resume.py`

- [ ] **Step 1: Verify python-multipart installed**

```bash
pip show python-multipart || pip install python-multipart
```
If installed, fine. If not, add `python-multipart>=0.0.9` to `requirements.txt` and `pip install -r requirements.txt`.

- [ ] **Step 2: Append test (uses a small fixture PDF)**

```python
import io


def test_parse_pdf_creates_resume(client, monkeypatch):
    """Mock the parser so the test doesn't need a real LLM."""
    from api.routes import resume as routes

    def fake_parse(text: str, model_choice: str, api_key: str) -> dict:
        return {
            "name": "Test User",
            "contact": ["test@example.com"],
            "experience": [
                {"company": "Acme", "role": "Eng", "date": "2024", "bullets": ["Built X"]}
            ],
        }

    monkeypatch.setattr(routes, "parse_resume", fake_parse)
    monkeypatch.setattr(routes, "_extract_pdf_text", lambda b: "Some PDF text")

    fake_pdf = b"%PDF-1.4\n...not really a pdf..."
    resp = client.post(
        "/api/resume/parse",
        files={"file": ("test.pdf", io.BytesIO(fake_pdf), "application/pdf")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"]  # auto-titled
    # Doc should contain a header with the parsed name
    header = body["doc"]["content"][0]
    assert header["type"] == "resumeHeader"
    assert any(c.get("text") == "Test User" for c in header.get("content", []))


def test_parse_rejects_non_pdf(client):
    resp = client.post(
        "/api/resume/parse",
        files={"file": ("test.txt", io.BytesIO(b"not a pdf"), "text/plain")},
    )
    assert resp.status_code == 400
```

- [ ] **Step 3: Add POST /parse handler**

In `api/routes/resume.py`, add:

```python
import os

from fastapi import UploadFile, File

from services.resume_parser import parse_resume, is_scanned_pdf
from api.converters.resume import legacy_json_to_tiptap_doc


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes via pypdf. Returns empty string on failure."""
    import io
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        chunks = []
        for page in reader.pages:
            text = page.extract_text() or ""
            chunks.append(text)
        return "\n".join(chunks)
    except Exception:
        return ""


@router.post("/parse")
async def parse_pdf(file: UploadFile = File(...)) -> Resume:
    """Upload a PDF, parse it, persist as a new Resume."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be a PDF")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF too large (max 10 MB)")

    text = _extract_pdf_text(pdf_bytes)
    # Use whatever LLM the user has configured; v1 reads from env
    model_choice = os.environ.get("CAREEROPS_MODEL", "gpt-4o-mini")
    api_key = os.environ.get("OPENAI_API_KEY", "")

    if not text or is_scanned_pdf(text):
        # Vision fallback — out of MVP scope to wire fully; for now reject
        raise HTTPException(
            status_code=422,
            detail="Scanned PDFs not yet supported in v1 — please use a text-based PDF",
        )

    try:
        legacy = parse_resume(text, model_choice, api_key)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parse failed: {exc}") from exc

    if not isinstance(legacy, dict):
        raise HTTPException(status_code=500, detail="Parser returned invalid shape")

    doc = legacy_json_to_tiptap_doc(legacy)
    rid = str(uuid.uuid4())
    now = _now_ms()
    title = (legacy.get("name") or file.filename or "Imported resume").strip()
    if title.lower().endswith(".pdf"):
        title = title[:-4]

    r = Resume(id=rid, title=title or "Imported resume", created_at=now, updated_at=now, doc=doc)
    resume_store.save(r)
    return r
```

- [ ] **Step 4: Run — pass**

```bash
python -m pytest tests/api/test_routes_resume.py -v -k parse
```

- [ ] **Step 5: Commit**

```bash
git add api/routes/resume.py tests/api/test_routes_resume.py requirements.txt
git commit -m "Add POST /api/resume/parse — PDF upload + parse + persist"
```

---

### Task 12: Snapshot endpoints — create, list, restore

**Files:**
- Modify: `api/routes/resume.py`
- Modify: `tests/api/test_routes_resume.py`

- [ ] **Step 1: Append tests**

```python
def test_post_snapshot_creates_record(client):
    _seed_resume("r1", "T")
    resp = client.post("/api/resume/r1/snapshot", json={"trigger": "checkpoint", "label": "v1.0"})
    assert resp.status_code == 200
    snap = resp.json()
    assert snap["resume_id"] == "r1"
    assert snap["trigger"] == "checkpoint"
    assert snap["label"] == "v1.0"


def test_get_snapshots_lists_newest_first(client):
    _seed_resume("r2", "T")
    client.post("/api/resume/r2/snapshot", json={"trigger": "auto"})
    client.post("/api/resume/r2/snapshot", json={"trigger": "checkpoint", "label": "L"})

    resp = client.get("/api/resume/r2/snapshots")
    assert resp.status_code == 200
    snaps = resp.json()["snapshots"]
    assert len(snaps) == 2
    assert snaps[0]["created_at"] >= snaps[1]["created_at"]


def test_restore_replaces_doc_and_creates_pre_restore_snapshot(client):
    _seed_resume("r3", "T")
    # Edit doc to something, snapshot, then edit again
    r = resume_store.get("r3")
    r.doc = {"type": "doc", "content": [{"type": "resumeHeader", "attrs": {"contacts": []}, "content": [{"type": "text", "text": "v1"}]}]}
    resume_store.save(r)
    snap_resp = client.post("/api/resume/r3/snapshot", json={"trigger": "checkpoint", "label": "before"})
    snap_id = snap_resp.json()["id"]

    r = resume_store.get("r3")
    r.doc = {"type": "doc", "content": [{"type": "resumeHeader", "attrs": {"contacts": []}, "content": [{"type": "text", "text": "v2"}]}]}
    resume_store.save(r)

    restore_resp = client.post(f"/api/resume/r3/restore", json={"snapshot_id": snap_id})
    assert restore_resp.status_code == 200
    restored = resume_store.get("r3")
    # Doc should be back to "v1"
    assert restored.doc["content"][0]["content"][0]["text"] == "v1"

    # Should have created an auto snapshot of the v2 state before restoring
    snaps = client.get("/api/resume/r3/snapshots").json()["snapshots"]
    pre_restore = [s for s in snaps if s.get("diff_summary", "").startswith("Pre-restore")]
    assert len(pre_restore) == 1
```

- [ ] **Step 2: Implement endpoints**

Add to `api/routes/resume.py`:

```python
from api.services import snapshot_store
from api.models.resume import ResumeSnapshot, SnapshotTrigger


class SnapshotRequest(BaseModel):
    trigger: SnapshotTrigger = "manual_save"
    label: str | None = None
    diff_summary: str | None = None
    ai_message_id: str | None = None


@router.post("/{resume_id}/snapshot")
async def create_snapshot(resume_id: str, body: SnapshotRequest) -> ResumeSnapshot:
    r = resume_store.get(resume_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    snap = ResumeSnapshot(
        id=str(uuid.uuid4()),
        resume_id=resume_id,
        created_at=_now_ms(),
        trigger=body.trigger,
        label=body.label,
        diff_summary=body.diff_summary,
        ai_message_id=body.ai_message_id,
        doc=r.doc,
    )
    snapshot_store.save(snap)
    snapshot_store.enforce_retention(resume_id)
    return snap


@router.get("/{resume_id}/snapshots")
async def list_snapshots(resume_id: str) -> dict:
    snaps = snapshot_store.list_for_resume(resume_id)
    return {"snapshots": [s.model_dump() for s in snaps]}


class RestoreRequest(BaseModel):
    snapshot_id: str


@router.post("/{resume_id}/restore")
async def restore_snapshot(resume_id: str, body: RestoreRequest) -> Resume:
    r = resume_store.get(resume_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    snap = snapshot_store.get(body.snapshot_id)
    if snap is None or snap.resume_id != resume_id:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    # Capture the pre-restore state so the restore itself is undoable
    pre = ResumeSnapshot(
        id=str(uuid.uuid4()),
        resume_id=resume_id,
        created_at=_now_ms(),
        trigger="auto",
        diff_summary=f"Pre-restore checkpoint (restored to {body.snapshot_id})",
        doc=r.doc,
    )
    snapshot_store.save(pre)

    r.doc = snap.doc
    r.updated_at = _now_ms()
    resume_store.save(r)
    snapshot_store.enforce_retention(resume_id)
    return r
```

- [ ] **Step 3: Run — pass**

```bash
python -m pytest tests/api/test_routes_resume.py -v -k "snapshot or restore"
```

- [ ] **Step 4: Commit**

```bash
git add api/routes/resume.py tests/api/test_routes_resume.py
git commit -m "Add snapshot create/list + restore-with-undoable endpoints"
```

---

### Task 13: POST /:id/variant — fork

**Files:**
- Modify: `api/routes/resume.py`
- Modify: `tests/api/test_routes_resume.py`

- [ ] **Step 1: Append test**

```python
def test_variant_forks_a_new_independent_copy(client):
    _seed_resume("base1", "Base")
    r = resume_store.get("base1")
    r.doc = {"type": "doc", "content": [{"type": "resumeHeader", "attrs": {"contacts": []}, "content": [{"type": "text", "text": "Base name"}]}]}
    resume_store.save(r)

    resp = client.post("/api/resume/base1/variant", json={
        "title": "Stripe Backend",
        "target_company": "Stripe",
        "target_role": "Backend SWE",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] != "base1"
    assert body["title"] == "Stripe Backend"
    assert body["parent_id"] == "base1"
    assert body["is_base"] is False
    assert body["target_company"] == "Stripe"

    # Editing the variant must NOT affect the base
    variant = resume_store.get(body["id"])
    variant.doc = {"type": "doc", "content": []}
    resume_store.save(variant)
    base = resume_store.get("base1")
    assert len(base.doc["content"]) == 1  # unchanged
```

- [ ] **Step 2: Implement**

Add to `api/routes/resume.py`:

```python
import copy


class VariantRequest(BaseModel):
    title: str
    target_company: str | None = None
    target_company_domain: str | None = None
    target_role: str | None = None


@router.post("/{resume_id}/variant")
async def create_variant(resume_id: str, body: VariantRequest) -> Resume:
    parent = resume_store.get(resume_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="Parent resume not found")

    new_id = str(uuid.uuid4())
    now = _now_ms()
    variant = Resume(
        id=new_id,
        user_id=parent.user_id,
        parent_id=parent.id,
        is_base=False,
        title=body.title,
        schema_version=parent.schema_version,
        created_at=now,
        updated_at=now,
        target_company=body.target_company,
        target_company_domain=body.target_company_domain,
        target_role=body.target_role,
        doc=copy.deepcopy(parent.doc),
    )
    resume_store.save(variant)
    return variant
```

- [ ] **Step 3: Run — pass**

```bash
python -m pytest tests/api/test_routes_resume.py -v -k variant
```

- [ ] **Step 4: Commit**

```bash
git add api/routes/resume.py tests/api/test_routes_resume.py
git commit -m "Add POST /api/resume/:id/variant — fork"
```

---

## Phase 3: Frontend API client + store rewrite

### Task 14: Typed API client

**Files:**
- Create: `frontend/src/lib/resumeApi.ts`

- [ ] **Step 1: Write the client**

```ts
// frontend/src/lib/resumeApi.ts
"use client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type SnapshotTrigger = "auto" | "manual_save" | "ai_edit" | "checkpoint";

export interface ResumeSummary {
  id: string;
  title: string;
  parent_id: string | null;
  is_base: boolean;
  target_company: string | null;
  target_role: string | null;
  updated_at: number;
}

export interface Resume extends ResumeSummary {
  user_id: string;
  schema_version: number;
  created_at: number;
  target_company_domain: string | null;
  is_user_consented_for_benchmark: boolean;
  doc: { type: "doc"; content: unknown[] };
}

export interface ResumeSnapshot {
  id: string;
  resume_id: string;
  created_at: number;
  trigger: SnapshotTrigger;
  label: string | null;
  ai_message_id: string | null;
  diff_summary: string | null;
  doc: { type: "doc"; content: unknown[] };
}

async function _json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${text || resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

export const resumeApi = {
  list: () =>
    fetch(`${API_BASE}/api/resume/`).then((r) => _json<{ resumes: ResumeSummary[] }>(r)),

  get: (id: string) => fetch(`${API_BASE}/api/resume/${id}`).then((r) => _json<Resume>(r)),

  upsert: (resume: Resume) =>
    fetch(`${API_BASE}/api/resume/${resume.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resume),
    }).then((r) => _json<Resume>(r)),

  createBlank: (title: string) =>
    fetch(`${API_BASE}/api/resume/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).then((r) => _json<Resume>(r)),

  parsePdf: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${API_BASE}/api/resume/parse`, { method: "POST", body: fd }).then((r) =>
      _json<Resume>(r),
    );
  },

  createVariant: (
    parentId: string,
    body: { title: string; target_company?: string; target_role?: string },
  ) =>
    fetch(`${API_BASE}/api/resume/${parentId}/variant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => _json<Resume>(r)),

  createSnapshot: (
    id: string,
    body: {
      trigger?: SnapshotTrigger;
      label?: string;
      diff_summary?: string;
      ai_message_id?: string;
    },
  ) =>
    fetch(`${API_BASE}/api/resume/${id}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => _json<ResumeSnapshot>(r)),

  listSnapshots: (id: string) =>
    fetch(`${API_BASE}/api/resume/${id}/snapshots`).then((r) =>
      _json<{ snapshots: ResumeSnapshot[] }>(r),
    ),

  restore: (id: string, snapshotId: string) =>
    fetch(`${API_BASE}/api/resume/${id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot_id: snapshotId }),
    }).then((r) => _json<Resume>(r)),

  rewriteBullet: (
    id: string,
    body: { bullet_text: string; preset: string; custom_instructions?: string },
  ) =>
    fetch(`${API_BASE}/api/resume/${id}/ai/rewrite-bullet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => _json<{ rewritten: string }>(r)),
};
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 1 pre-existing error only.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/resumeApi.ts
git commit -m "Add typed API client for resume endpoints"
```

---

### Task 15: Replace localStorage with API in editor store

**Files:**
- Modify: `frontend/src/stores/resumeEditor.ts`

- [ ] **Step 1: Replace contents**

```ts
// frontend/src/stores/resumeEditor.ts
import { create } from "zustand";

import type { Resume, ResumeSummary } from "@/lib/resumeApi";

type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

interface ResumeEditorStore {
  current: Resume | null;
  available: ResumeSummary[];
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  setCurrent: (r: Resume) => void;
  setAvailable: (s: ResumeSummary[]) => void;
  setDoc: (doc: Resume["doc"]) => void;
  setMeta: (patch: Partial<Resume>) => void;
  setSaveStatus: (s: SaveStatus) => void;
  markSaved: () => void;
}

export const useResumeEditorStore = create<ResumeEditorStore>((set) => ({
  current: null,
  available: [],
  saveStatus: "idle",
  lastSavedAt: null,
  setCurrent: (r) => set({ current: r, saveStatus: "saved", lastSavedAt: r.updated_at }),
  setAvailable: (s) => set({ available: s }),
  setDoc: (doc) =>
    set((s) => (s.current ? { current: { ...s.current, doc } } : {})),
  setMeta: (patch) =>
    set((s) => (s.current ? { current: { ...s.current, ...patch } } : {})),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  markSaved: () => set({ saveStatus: "saved", lastSavedAt: Date.now() }),
}));
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```
Note: this will trigger errors in `ResumeEditor.tsx` that consumes the old store API. Those errors are expected — they get fixed in Task 16. List them but don't fix yet.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/resumeEditor.ts
git commit -m "Rewrite resumeEditor store around the API client (Resume type)"
```

---

### Task 16: Rewrite ResumeEditor — load from API, debounced PUT

**Files:**
- Modify: `frontend/src/components/resume/ResumeEditor.tsx`

- [ ] **Step 1: Replace contents**

```tsx
// frontend/src/components/resume/ResumeEditor.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";

import { usePageContext } from "@/hooks/usePageContext";
import { resumeApi, type Resume } from "@/lib/resumeApi";
import { useResumeEditorStore } from "@/stores/resumeEditor";

import { EditorCanvas } from "./EditorCanvas";
import { EditorTopBar } from "./EditorTopBar";

const AUTOSAVE_DEBOUNCE_MS = 500;

export function ResumeEditor({ id }: { id: string }) {
  const current = useResumeEditorStore((s) => s.current);
  const available = useResumeEditorStore((s) => s.available);
  const saveStatus = useResumeEditorStore((s) => s.saveStatus);
  const lastSavedAt = useResumeEditorStore((s) => s.lastSavedAt);
  const setCurrent = useResumeEditorStore((s) => s.setCurrent);
  const setAvailable = useResumeEditorStore((s) => s.setAvailable);
  const setDoc = useResumeEditorStore((s) => s.setDoc);
  const setSaveStatus = useResumeEditorStore((s) => s.setSaveStatus);
  const markSaved = useResumeEditorStore((s) => s.markSaved);

  const [editor, setEditor] = useState<Editor | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load current + list of all
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([resumeApi.get(id), resumeApi.list()])
      .then(([resume, list]) => {
        if (cancelled) return;
        setCurrent(resume);
        setAvailable(list.resumes);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, setCurrent, setAvailable]);

  // Debounced PUT on doc changes
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChange = (newDoc: Resume["doc"]) => {
    setDoc(newDoc);
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const c = useResumeEditorStore.getState().current;
      if (!c) return;
      resumeApi
        .upsert({ ...c, doc: newDoc })
        .then(() => markSaved())
        .catch(() => setSaveStatus("error"));
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  // Page context for AI panel
  usePageContext({
    page: "resume_editor",
    summary: current
      ? `正在编辑「${current.title}」简历${
          current.target_company
            ? `，目标 ${current.target_company} · ${current.target_role ?? ""}`
            : ""
        }`
      : "Resume editor loading",
    data: { resume_id: id },
  });

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-neutral-600">
        <div>Couldn’t load resume: {loadError}</div>
        <a href="/upload" className="text-sm text-blue-600 underline">
          Upload a resume
        </a>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-400">
        Loading resume…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-[240px]">
      <EditorTopBar
        current={current}
        available={available}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        editor={editor}
      />
      <EditorCanvas doc={current.doc} onChange={handleChange} onReady={setEditor} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check (will still error — EditorTopBar signature changed)**

```bash
cd frontend && npx tsc --noEmit
```
Errors expected in `EditorTopBar.tsx` consumers — fixed in Task 18.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/ResumeEditor.tsx
git commit -m "Switch ResumeEditor to API-backed load + debounced PUT"
```

---

### Task 17: Delete obsolete `localResumeStore.ts`

**Files:**
- Delete: `frontend/src/lib/localResumeStore.ts`

- [ ] **Step 1: Confirm it has no other importers**

```bash
grep -rn "localResumeStore\|loadFromLocal\|saveToLocal" frontend/src/ | grep -v "lib/localResumeStore.ts"
```
Expected: empty (only Task 16 removed the references).

- [ ] **Step 2: Delete**

```bash
rm frontend/src/lib/localResumeStore.ts
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/lib/
git commit -m "Remove obsolete localResumeStore — replaced by API client"
```

---

## Phase 4: Save status + dropdown + variants

### Task 18: SaveBadge component (always-visible, relative time)

**Files:**
- Create: `frontend/src/lib/relativeTime.ts`
- Create: `frontend/src/components/resume/SaveBadge.tsx`

- [ ] **Step 1: Write `relativeTime.ts`**

```ts
// frontend/src/lib/relativeTime.ts
/**
 * Format a past timestamp as a short relative phrase.
 * Returns "just now" / "3 sec ago" / "5 min ago" / "2 hr ago" / "yesterday" / "Apr 21".
 */
export function formatRelative(ts: number, now: number = Date.now()): string {
  const diffMs = now - ts;
  if (diffMs < 5_000) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
```

- [ ] **Step 2: Write `SaveBadge.tsx`**

```tsx
// frontend/src/components/resume/SaveBadge.tsx
"use client";

import { useEffect, useState } from "react";

import { formatRelative } from "@/lib/relativeTime";

type Status = "idle" | "saving" | "saved" | "error" | "offline";

interface Props {
  status: Status;
  lastSavedAt: number | null;
  onRetry?: () => void;
}

export function SaveBadge({ status, lastSavedAt, onRetry }: Props) {
  // Tick every 30s so relative time stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const dot = (cls: string) => (
    <span className={`mr-1.5 inline-block size-2 rounded-full ${cls}`} aria-hidden />
  );

  const tooltip = lastSavedAt ? new Date(lastSavedAt).toLocaleString() : undefined;

  if (status === "saving") {
    return (
      <span className="flex items-center text-[11px] text-neutral-600">
        {dot("animate-pulse bg-blue-500")}Saving…
      </span>
    );
  }
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center text-[11px] text-red-600 hover:underline"
      >
        {dot("bg-red-500")}Save failed · Retry
      </button>
    );
  }
  if (status === "offline") {
    return (
      <span className="flex items-center text-[11px] text-amber-700" title={tooltip}>
        {dot("bg-amber-500")}Offline · changes kept locally
      </span>
    );
  }
  // idle or saved
  if (lastSavedAt == null) {
    return null;
  }
  return (
    <span className="flex items-center text-[11px] text-neutral-500" title={tooltip}>
      {dot("bg-emerald-500")}Saved · {formatRelative(lastSavedAt)}
    </span>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/relativeTime.ts frontend/src/components/resume/SaveBadge.tsx
git commit -m "Add SaveBadge with always-visible relative-time status"
```

---

### Task 19: ResumeDropdown — variant switcher

**Files:**
- Create: `frontend/src/components/resume/ResumeDropdown.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/resume/ResumeDropdown.tsx
"use client";

import { ChevronDown, FilePlus2, Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { Resume, ResumeSummary } from "@/lib/resumeApi";

interface Props {
  current: Resume;
  available: ResumeSummary[];
  onNewVariant: () => void;
}

export function ResumeDropdown({ current, available, onNewVariant }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
      >
        {current.title}
        <ChevronDown className="size-3.5 text-neutral-500" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          {available.map((r) => {
            const isCurrent = r.id === current.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!isCurrent) router.push(`/resume/${r.id}`);
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-50 ${
                  isCurrent ? "text-neutral-900" : "text-neutral-700"
                }`}
              >
                <span className="truncate">{r.title}</span>
                {isCurrent && <span className="text-xs text-emerald-600">✓</span>}
              </button>
            );
          })}
          <div className="my-1 border-t border-neutral-100" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNewVariant();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <FilePlus2 className="size-3.5" /> New variant from this
          </button>
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <Upload className="size-3.5" /> Upload another PDF
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/ResumeDropdown.tsx
git commit -m "Add ResumeDropdown for variant switching"
```

---

### Task 20: NewVariantModal

**Files:**
- Create: `frontend/src/components/resume/NewVariantModal.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/resume/NewVariantModal.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { resumeApi } from "@/lib/resumeApi";

interface Props {
  parentId: string;
  parentTitle: string;
  onClose: () => void;
}

export function NewVariantModal({ parentId, parentTitle, onClose }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(`Copy of ${parentTitle}`);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const variant = await resumeApi.createVariant(parentId, {
        title: title.trim() || `Copy of ${parentTitle}`,
        target_company: company.trim() || undefined,
        target_role: role.trim() || undefined,
      });
      router.push(`/resume/${variant.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[400px] rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-neutral-900">
          New variant from this resume
        </h2>
        <div className="space-y-3">
          <Field label="Variant name">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              autoFocus
            />
          </Field>
          <Field label="Target company (optional)">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Stripe"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Target role (optional)">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Backend SWE"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
        {error && <div className="mt-3 text-xs text-red-600">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create variant"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/NewVariantModal.tsx
git commit -m "Add NewVariantModal for forking variants"
```

---

### Task 21: Replace EditorTopBar with v1 surface

**Files:**
- Modify: `frontend/src/components/resume/EditorTopBar.tsx`

- [ ] **Step 1: Replace contents**

```tsx
// frontend/src/components/resume/EditorTopBar.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { Download, History as HistoryIcon } from "lucide-react";
import { useState } from "react";

import type { Resume, ResumeSummary } from "@/lib/resumeApi";

import { FormatToolbar } from "./FormatToolbar";
import { NewVariantModal } from "./NewVariantModal";
import { ResumeDropdown } from "./ResumeDropdown";
import { SaveBadge } from "./SaveBadge";

interface Props {
  current: Resume;
  available: ResumeSummary[];
  saveStatus: "idle" | "saving" | "saved" | "error" | "offline";
  lastSavedAt: number | null;
  editor: Editor | null;
  onOpenHistory?: () => void;
}

export function EditorTopBar({
  current,
  available,
  saveStatus,
  lastSavedAt,
  editor,
  onOpenHistory,
}: Props) {
  const [showNewVariant, setShowNewVariant] = useState(false);

  const tailoringLabel =
    current.target_company && current.target_role
      ? `${current.target_company} · ${current.target_role}`
      : current.target_company
      ? current.target_company
      : null;

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur-md">
        <ResumeDropdown
          current={current}
          available={available}
          onNewVariant={() => setShowNewVariant(true)}
        />

        <div className="h-5 w-px bg-neutral-200" />

        <FormatToolbar editor={editor} />

        <div className="flex-1 text-center">
          {tailoringLabel && (
            <>
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                Tailoring for
              </span>
              <span className="ml-2 truncate text-sm text-neutral-800">{tailoringLabel}</span>
            </>
          )}
        </div>

        <SaveBadge status={saveStatus} lastSavedAt={lastSavedAt} />

        <button
          type="button"
          onClick={onOpenHistory}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
          title="History (snapshots)"
        >
          <HistoryIcon className="size-3.5" />
          History
        </button>

        <button
          type="button"
          onClick={() => {
            (document.activeElement as HTMLElement | null)?.blur?.();
            window.print();
          }}
          className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
        >
          <Download className="size-3.5" strokeWidth={2} />
          Export PDF
        </button>
      </div>

      {showNewVariant && (
        <NewVariantModal
          parentId={current.id}
          parentTitle={current.title}
          onClose={() => setShowNewVariant(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check — should clear all errors from Tasks 15-16**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 1 pre-existing error only.

- [ ] **Step 3: Visual check**

```bash
cd frontend && npx next dev -p 3000
```
Open `/resume/<some-id>` (need a seeded resume from backend; use curl: `curl -X POST http://localhost:8000/api/resume/ -H 'Content-Type: application/json' -d '{"title":"Test"}'` then navigate to its id). Verify:
- Top bar renders dropdown, format toolbar, save badge, History button, Export PDF
- Save badge shows "Saved · just now" after typing

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/EditorTopBar.tsx
git commit -m "Rebuild EditorTopBar with dropdown, save badge, history, export"
```

---

## Phase 5: PDF upload + import banner

### Task 22: PdfUploader component

**Files:**
- Create: `frontend/src/components/upload/PdfUploader.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/upload/PdfUploader.tsx
"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { resumeApi } from "@/lib/resumeApi";

export function PdfUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("PDF too large (max 10 MB).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await resumeApi.parsePdf(file);
      router.push(`/resume/${r.id}?just_imported=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex w-full flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-colors ${
        dragOver ? "border-blue-400 bg-blue-50" : "border-neutral-300 bg-white"
      }`}
    >
      {busy ? (
        <>
          <Loader2 className="size-8 animate-spin text-neutral-400" />
          <div className="text-sm text-neutral-600">Parsing your resume…</div>
        </>
      ) : (
        <>
          <Upload className="size-8 text-neutral-400" />
          <div className="text-center">
            <div className="text-sm font-medium text-neutral-900">
              Drop a PDF here, or
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="ml-1 text-blue-600 underline"
              >
                browse
              </button>
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Max 10 MB · text-based PDFs only (scanned PDFs not yet supported)
            </div>
          </div>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/upload/PdfUploader.tsx
git commit -m "Add PdfUploader (drag-drop + browse + size/type validation)"
```

---

### Task 23: /upload route

**Files:**
- Create: `frontend/src/app/upload/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/upload/page.tsx
"use client";

import { AppShell } from "@/components/layout/AppShell";
import { PdfUploader } from "@/components/upload/PdfUploader";

export default function UploadPage() {
  return (
    <AppShell>
      <div className="mx-auto mt-12 max-w-2xl px-4">
        <h1 className="mb-2 text-xl font-semibold text-neutral-900">
          Import a resume
        </h1>
        <p className="mb-6 text-sm text-neutral-600">
          Upload your PDF and we’ll parse it into the editor. You can review and edit
          everything afterwards.
        </p>
        <PdfUploader />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Visual check**

```bash
cd frontend && npx next dev -p 3000
```
Open `http://localhost:3000/upload`. Drop a real PDF — should parse and redirect to `/resume/<new_id>?just_imported=1`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/upload/page.tsx
git commit -m "Add /upload page"
```

---

### Task 24: ImportBanner — orange "Just imported" notice

**Files:**
- Create: `frontend/src/components/resume/ImportBanner.tsx`
- Modify: `frontend/src/components/resume/ResumeEditor.tsx`

- [ ] **Step 1: Write the banner**

```tsx
// frontend/src/components/resume/ImportBanner.tsx
"use client";

import { X } from "lucide-react";

interface Props {
  onDismiss: () => void;
}

export function ImportBanner({ onDismiss }: Props) {
  return (
    <div className="sticky top-14 z-20 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">
      <span className="text-base">📥</span>
      <span className="flex-1">
        Just imported — please review for parse errors. Names, dates, and bullet structure
        may need light cleanup.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 hover:bg-amber-100"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into ResumeEditor**

In `frontend/src/components/resume/ResumeEditor.tsx`, add:

- import: `import { ImportBanner } from "./ImportBanner";`
- import: `import { useSearchParams, useRouter } from "next/navigation";`
- inside the component, before `return`:

```tsx
const searchParams = useSearchParams();
const router = useRouter();
const [showBanner, setShowBanner] = useState(searchParams.get("just_imported") === "1");

function dismissBanner() {
  setShowBanner(false);
  // Clear query param so reload doesn't re-show
  const params = new URLSearchParams(searchParams.toString());
  params.delete("just_imported");
  router.replace(`/resume/${id}${params.toString() ? "?" + params.toString() : ""}`);
}
```

- in the returned JSX, between `<EditorTopBar ... />` and `<EditorCanvas ... />`, insert:

```tsx
{showBanner && <ImportBanner onDismiss={dismissBanner} />}
```

- [ ] **Step 3: Visual check**

Upload a PDF (Task 23). After redirect, banner should appear. Click ✕ to dismiss; URL should drop `just_imported`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/ImportBanner.tsx frontend/src/components/resume/ResumeEditor.tsx
git commit -m "Add ImportBanner shown after PDF import"
```

---

## Phase 6: Editor UX (NodeViews + drag + add)

### Task 25: HoverAffordance shared component

**Files:**
- Create: `frontend/src/components/resume/HoverAffordance.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/resume/HoverAffordance.tsx
"use client";

import { GripVertical, Plus, Sparkles, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  onAdd?: () => void;
  onDelete?: () => void;
  onRewrite?: () => void;
  /** Forwards a ref-callback that should be set as drag handle. */
  dragHandleRef?: (el: HTMLElement | null) => void;
  /** Layout: "left" puts handle outside content; "right" puts buttons after. */
  children?: ReactNode;
}

export function HoverAffordance({
  onAdd,
  onDelete,
  onRewrite,
  dragHandleRef,
  children,
}: Props) {
  return (
    <div className="group/affordance relative">
      {/* Left-side drag handle */}
      <div
        ref={dragHandleRef}
        contentEditable={false}
        className="absolute left-[-28px] top-1 hidden cursor-grab text-neutral-300 group-hover/affordance:flex active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </div>

      {children}

      {/* Right-side button cluster */}
      <div
        contentEditable={false}
        className="pointer-events-none absolute right-[-92px] top-0 flex gap-0.5 opacity-0 transition-opacity group-hover/affordance:pointer-events-auto group-hover/affordance:opacity-100"
      >
        {onRewrite && (
          <IconButton onClick={onRewrite} title="AI rewrite (✨)">
            <Sparkles className="size-3.5" />
          </IconButton>
        )}
        {onAdd && (
          <IconButton onClick={onAdd} title="Add below">
            <Plus className="size-3.5" />
          </IconButton>
        )}
        {onDelete && (
          <IconButton onClick={onDelete} title="Delete">
            <Trash2 className="size-3.5" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function IconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex size-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/HoverAffordance.tsx
git commit -m "Add HoverAffordance — shared drag handle + button cluster"
```

---

### Task 26: BulletNode NodeView

**Files:**
- Create: `frontend/src/components/resume/extensions/nodeViews/BulletNodeView.tsx`
- Modify: `frontend/src/components/resume/extensions/BulletNode.ts`

- [ ] **Step 1: Write the NodeView**

```tsx
// frontend/src/components/resume/extensions/nodeViews/BulletNodeView.tsx
"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { HoverAffordance } from "../../HoverAffordance";

export function BulletNodeView(props: NodeViewProps) {
  const { editor, getPos } = props;

  function addBelow() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    const after = pos + props.node.nodeSize;
    editor
      .chain()
      .focus()
      .insertContentAt(after, { type: "bullet", content: [] })
      .run();
  }

  function rewrite() {
    // Dispatched via window event so AIRewriteBulletPopover (Task 40) can pick up
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    window.dispatchEvent(
      new CustomEvent("resume:rewrite-bullet", {
        detail: { from: pos, to: pos + props.node.nodeSize, text: props.node.textContent },
      }),
    );
  }

  function del() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + props.node.nodeSize })
      .run();
  }

  return (
    <NodeViewWrapper as="li" className="resume-bullet" data-resume-bullet="">
      <HoverAffordance onAdd={addBelow} onRewrite={rewrite} onDelete={del}>
        <NodeViewContent as="span" />
      </HoverAffordance>
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 2: Attach NodeView in `BulletNode.ts`**

Replace `frontend/src/components/resume/extensions/BulletNode.ts`:

```ts
// frontend/src/components/resume/extensions/BulletNode.ts
import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { BulletNodeView } from "./nodeViews/BulletNodeView";

export const BulletNode = Node.create({
  name: "bullet",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "li[data-resume-bullet]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(HTMLAttributes, { "data-resume-bullet": "", class: "resume-bullet" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BulletNodeView);
  },
});
```

- [ ] **Step 3: Type-check + visual**

```bash
cd frontend && npx tsc --noEmit
```
Then start dev server and verify hover over a bullet shows the affordance buttons.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/extensions/nodeViews/BulletNodeView.tsx frontend/src/components/resume/extensions/BulletNode.ts
git commit -m "Add BulletNodeView with hover affordance (add/rewrite/delete)"
```

---

### Task 27: EntryNode NodeView

**Files:**
- Create: `frontend/src/components/resume/extensions/nodeViews/EntryNodeView.tsx`
- Modify: `frontend/src/components/resume/extensions/EntryNode.ts`

- [ ] **Step 1: Write the NodeView**

```tsx
// frontend/src/components/resume/extensions/nodeViews/EntryNodeView.tsx
"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { HoverAffordance } from "../../HoverAffordance";

export function EntryNodeView(props: NodeViewProps) {
  const { editor, node, getPos } = props;
  const title = (node.attrs.title as string) ?? "";
  const meta = (node.attrs.meta as string) ?? "";

  function addBulletBelow() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    // Insert bullet at end of this entry
    const end = pos + node.nodeSize - 1;
    editor.chain().focus().insertContentAt(end, { type: "bullet", content: [] }).run();
  }

  function del() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }

  function updateAttr(key: "title" | "meta", value: string) {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeAttribute(pos, key, value);
        return true;
      })
      .run();
  }

  return (
    <NodeViewWrapper className="resume-entry" data-resume-entry="">
      <HoverAffordance onAdd={addBulletBelow} onDelete={del}>
        <input
          contentEditable={false}
          value={title}
          onChange={(e) => updateAttr("title", e.target.value)}
          className="resume-entry-title w-full bg-transparent outline-none"
          placeholder="Title (e.g. Software Engineer @ Acme)"
        />
        <input
          contentEditable={false}
          value={meta}
          onChange={(e) => updateAttr("meta", e.target.value)}
          className="resume-entry-meta w-full bg-transparent outline-none"
          placeholder="Date · Location"
        />
        <NodeViewContent as="ul" className="resume-entry-bullets" />
      </HoverAffordance>
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 2: Attach in EntryNode.ts**

Replace `frontend/src/components/resume/extensions/EntryNode.ts`:

```ts
// frontend/src/components/resume/extensions/EntryNode.ts
import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { EntryNodeView } from "./nodeViews/EntryNodeView";

export const EntryNode = Node.create({
  name: "entry",
  group: "block",
  content: "bullet+",
  defining: true,

  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") ?? "",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
      meta: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-meta") ?? "",
        renderHTML: (attrs) => ({ "data-meta": attrs.meta }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-resume-entry]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-resume-entry": "", class: "resume-entry" }),
      ["div", { class: "resume-entry-title" }, node.attrs.title as string],
      ["div", { class: "resume-entry-meta" }, node.attrs.meta as string],
      ["ul", { class: "resume-entry-bullets" }, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EntryNodeView);
  },
});
```

- [ ] **Step 3: Type-check + visual**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/extensions/nodeViews/EntryNodeView.tsx frontend/src/components/resume/extensions/EntryNode.ts
git commit -m "Add EntryNodeView (editable title/meta + hover affordance)"
```

---

### Task 28: ResumeSection NodeView with drag

**Files:**
- Create: `frontend/src/components/resume/extensions/nodeViews/SectionNodeView.tsx`
- Modify: `frontend/src/components/resume/extensions/ResumeSectionNode.ts`

- [ ] **Step 1: Write the NodeView (uses ProseMirror commands for reorder)**

```tsx
// frontend/src/components/resume/extensions/nodeViews/SectionNodeView.tsx
"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { HoverAffordance } from "../../HoverAffordance";

export function SectionNodeView(props: NodeViewProps) {
  const { editor, node, getPos } = props;
  const heading = (node.attrs.heading as string) ?? "Section";

  function addEntryBelow() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    const end = pos + node.nodeSize - 1;
    editor
      .chain()
      .focus()
      .insertContentAt(end, {
        type: "entry",
        attrs: { title: "", meta: "" },
        content: [{ type: "bullet", content: [] }],
      })
      .run();
  }

  function del() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }

  function updateHeading(value: string) {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeAttribute(pos, "heading", value);
        return true;
      })
      .run();
  }

  return (
    <NodeViewWrapper as="section" className="resume-section" data-resume-section="">
      <HoverAffordance onAdd={addEntryBelow} onDelete={del}>
        <input
          contentEditable={false}
          value={heading}
          onChange={(e) => updateHeading(e.target.value)}
          className="resume-section-heading w-full bg-transparent uppercase outline-none"
          placeholder="SECTION HEADING"
        />
        <NodeViewContent as="div" className="resume-section-body" />
      </HoverAffordance>
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 2: Attach in ResumeSectionNode.ts**

Replace `frontend/src/components/resume/extensions/ResumeSectionNode.ts`:

```ts
// frontend/src/components/resume/extensions/ResumeSectionNode.ts
import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { SectionNodeView } from "./nodeViews/SectionNodeView";

export const ResumeSectionNode = Node.create({
  name: "resumeSection",
  group: "block",
  content: "entry+",
  defining: true,

  addAttributes() {
    return {
      heading: {
        default: "Section",
        parseHTML: (el) => el.getAttribute("data-heading") ?? "Section",
        renderHTML: (attrs) => ({ "data-heading": attrs.heading }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-resume-section]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, { "data-resume-section": "", class: "resume-section" }),
      ["h2", { class: "resume-section-heading" }, node.attrs.heading as string],
      ["div", { class: "resume-section-body" }, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SectionNodeView);
  },
});
```

- [ ] **Step 3: Type-check + visual**

```bash
cd frontend && npx tsc --noEmit
cd frontend && npx next dev -p 3000
```
Open `/resume/<id>` — sections should render via NodeView; heading should be an editable input.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/extensions/nodeViews/SectionNodeView.tsx frontend/src/components/resume/extensions/ResumeSectionNode.ts
git commit -m "Add SectionNodeView (editable heading + hover affordance)"
```

---

### Task 29: Section drag-to-reorder

**Files:**
- Modify: `frontend/src/components/resume/extensions/nodeViews/SectionNodeView.tsx`

For v1, implement drag-reorder using HTML5 drag-and-drop directly on the section wrapper (no extra library). Each section is draggable; drop zones are the inter-section gaps. ProseMirror's `tr.replace` moves the node.

- [ ] **Step 1: Update SectionNodeView**

```tsx
// frontend/src/components/resume/extensions/nodeViews/SectionNodeView.tsx
"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useRef, useState } from "react";

import { HoverAffordance } from "../../HoverAffordance";

export function SectionNodeView(props: NodeViewProps) {
  const { editor, node, getPos } = props;
  const heading = (node.attrs.heading as string) ?? "Section";
  const handleRef = useRef<HTMLElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function addEntryBelow() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    const end = pos + node.nodeSize - 1;
    editor
      .chain()
      .focus()
      .insertContentAt(end, {
        type: "entry",
        attrs: { title: "", meta: "" },
        content: [{ type: "bullet", content: [] }],
      })
      .run();
  }

  function del() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }

  function updateHeading(value: string) {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeAttribute(pos, "heading", value);
        return true;
      })
      .run();
  }

  function onDragStart(e: React.DragEvent) {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    e.dataTransfer.setData("application/x-resume-section-pos", String(pos));
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("application/x-resume-section-pos")) {
      e.preventDefault();
      setDragOver(true);
    }
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const sourcePosStr = e.dataTransfer.getData("application/x-resume-section-pos");
    if (!sourcePosStr) return;
    const sourcePos = parseInt(sourcePosStr, 10);
    const targetPos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    if (sourcePos === targetPos) return;

    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const sourceNode = state.doc.nodeAt(sourcePos);
        if (!sourceNode) return false;
        // Delete source first, then insert before target (adjust target pos if source < target)
        const sourceSize = sourceNode.nodeSize;
        tr.delete(sourcePos, sourcePos + sourceSize);
        const adjusted = sourcePos < targetPos ? targetPos - sourceSize : targetPos;
        tr.insert(adjusted, sourceNode);
        return true;
      })
      .run();
  }

  return (
    <NodeViewWrapper
      as="section"
      className={`resume-section ${dragOver ? "ring-2 ring-blue-300" : ""}`}
      data-resume-section=""
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <HoverAffordance
        onAdd={addEntryBelow}
        onDelete={del}
        dragHandleRef={(el) => {
          handleRef.current = el;
          if (el) {
            el.draggable = true;
            el.addEventListener("dragstart", onDragStart as unknown as EventListener);
          }
        }}
      >
        <input
          contentEditable={false}
          value={heading}
          onChange={(e) => updateHeading(e.target.value)}
          className="resume-section-heading w-full bg-transparent uppercase outline-none"
          placeholder="SECTION HEADING"
        />
        <NodeViewContent as="div" className="resume-section-body" />
      </HoverAffordance>
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 2: Visual check — drag sections to reorder**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/extensions/nodeViews/SectionNodeView.tsx
git commit -m "Add HTML5 drag-and-drop section reorder"
```

---

### Task 30: AddSectionPopover (between sections)

**Files:**
- Create: `frontend/src/components/resume/AddSectionPopover.tsx`
- Modify: `frontend/src/components/resume/EditorCanvas.tsx`

- [ ] **Step 1: Write the popover**

```tsx
// frontend/src/components/resume/AddSectionPopover.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { useState } from "react";

interface Props {
  editor: Editor | null;
}

const PRESETS = ["Experience", "Projects", "Education", "Skills", "Awards", "Publications"];

export function AddSectionPopover({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  if (!editor) return null;

  function add(heading: string) {
    if (!editor) return;
    const docEnd = editor.state.doc.content.size;
    editor
      .chain()
      .focus()
      .insertContentAt(docEnd, {
        type: "resumeSection",
        attrs: { heading },
        content: [
          {
            type: "entry",
            attrs: { title: "", meta: "" },
            content: [{ type: "bullet", content: [] }],
          },
        ],
      })
      .run();
    setOpen(false);
    setCustom("");
  }

  return (
    <div className="my-4 flex justify-center">
      {open ? (
        <div className="w-72 rounded-md border border-neutral-200 bg-white p-3 shadow-md">
          <div className="mb-2 text-xs font-medium text-neutral-700">Add section</div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => add(p)}
                className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom heading"
              className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) add(custom.trim());
              }}
            />
            <button
              type="button"
              disabled={!custom.trim()}
              onClick={() => custom.trim() && add(custom.trim())}
              className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-30"
            >
              Add
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full text-center text-[11px] text-neutral-400 hover:text-neutral-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
        >
          + Add section
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render below the canvas in `EditorCanvas.tsx`**

In `frontend/src/components/resume/EditorCanvas.tsx`, after the `<div className="resume-canvas">`, render:

```tsx
<AddSectionPopover editor={editor} />
```

…and import it at top: `import { AddSectionPopover } from "./AddSectionPopover";`

- [ ] **Step 3: Visual check**

Click "+ Add section" → preset buttons appear → click Awards → new empty section appears.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/AddSectionPopover.tsx frontend/src/components/resume/EditorCanvas.tsx
git commit -m "Add AddSectionPopover (preset chooser + custom heading)"
```

---

## Phase 7: Multi-page visualization

### Task 31: PageBreakOverlay component

**Files:**
- Create: `frontend/src/components/resume/PageBreakOverlay.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/resume/PageBreakOverlay.tsx
"use client";

import { useEffect, useState } from "react";

const PAGE_HEIGHT_PX = 11 * 96; // 11 inch * 96 dpi = 1056 px

interface Props {
  /** A ref-like getter that returns the canvas DOM element. */
  getCanvas: () => HTMLElement | null;
}

export function PageBreakOverlay({ getCanvas }: Props) {
  const [breaks, setBreaks] = useState<number[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const update = () => {
      const el = getCanvas();
      if (!el) return;
      const h = el.scrollHeight;
      const pages = Math.max(1, Math.ceil(h / PAGE_HEIGHT_PX));
      const positions: number[] = [];
      for (let i = 1; i < pages; i++) positions.push(i * PAGE_HEIGHT_PX);
      setBreaks(positions);
      setTotalPages(pages);
    };

    update();
    const el = getCanvas();
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [getCanvas]);

  return (
    <div className="page-break-overlay pointer-events-none absolute inset-0">
      {breaks.map((y, i) => (
        <div key={i} style={{ top: `${y}px` }} className="absolute left-0 right-0">
          <div className="border-t border-dashed border-neutral-300" />
          <div className="absolute right-2 top-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
            Page {i + 2} of {totalPages}
          </div>
        </div>
      ))}
      {totalPages > 1 && (
        <div className="absolute right-2 top-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
          Page 1 of {totalPages}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into EditorCanvas**

In `frontend/src/components/resume/EditorCanvas.tsx`, wrap the canvas in a relative container and render the overlay:

```tsx
import { useRef } from "react";
import { PageBreakOverlay } from "./PageBreakOverlay";

// Inside EditorCanvas:
const canvasRef = useRef<HTMLDivElement>(null);

// Replace the existing top-level <div className="resume-canvas"> with:
return (
  <div className="relative mx-auto w-fit">
    <div ref={canvasRef} className="resume-canvas">
      <EditorContent editor={editor} />
    </div>
    <PageBreakOverlay getCanvas={() => canvasRef.current} />
    <AddSectionPopover editor={editor} />
  </div>
);
```

- [ ] **Step 3: Visual check**

Add enough content to span 2 pages (paste a long bullet a few times). Dashed line + "Page 2 of 2" should appear at exactly 1056 px from top of canvas.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/PageBreakOverlay.tsx frontend/src/components/resume/EditorCanvas.tsx
git commit -m "Add PageBreakOverlay (dashed lines + page badges via ResizeObserver)"
```

---

### Task 32: CSS break rules + print stylesheet

**Files:**
- Modify: `frontend/src/components/resume/resume-editor.css`

- [ ] **Step 1: Append print + break-avoid rules**

Add to `frontend/src/components/resume/resume-editor.css`:

```css
/* ========== Page-break behavior (print + visual alignment) ========== */
.resume-entry { break-inside: avoid; page-break-inside: avoid; }
.resume-section-heading { break-after: avoid; page-break-after: avoid; }
.resume-bullet { break-inside: avoid; page-break-inside: avoid; }

/* ========== Print stylesheet ========== */
@media print {
  @page { size: Letter; margin: 0; }

  /* Hide everything except the canvas */
  body * { visibility: hidden; }
  .resume-canvas, .resume-canvas * { visibility: visible; }

  /* Strip canvas chrome */
  .resume-canvas {
    box-shadow: none !important;
    margin: 0 !important;
    padding: 0.75in 0.9in !important;
    width: 100% !important;
    min-height: auto !important;
    position: absolute;
    left: 0;
    top: 0;
  }

  /* Hide overlays + chrome */
  .page-break-overlay { display: none !important; }
  .resume-canvas [contenteditable="false"]:not(input) { display: none !important; }

  /* Show value of input fields as plain text */
  .resume-entry-title, .resume-entry-meta, .resume-section-heading {
    /* the input element prints its current value via the `value` attribute */
  }
  .resume-canvas input.resume-entry-title,
  .resume-canvas input.resume-entry-meta,
  .resume-canvas input.resume-section-heading {
    border: none !important;
    background: transparent !important;
    padding: 0 !important;
    color: inherit !important;
  }

  /* Hide ProseMirror cursor */
  .ProseMirror { caret-color: transparent !important; }
  .ProseMirror-focused { outline: none !important; }
}
```

- [ ] **Step 2: Visual check — print preview**

Open `/resume/<id>` with content > 1 page. Press ⌘P (or click Export PDF) → preview should:
- Show only the resume content (no top bar, no AI panel, no overlays)
- Break at the same positions as the editor's dashed lines
- Hover affordance buttons NOT visible

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/resume-editor.css
git commit -m "Add @media print rules + break-inside: avoid for entries/bullets"
```

---

## Phase 8: PDF export polish

### Task 33: Export PDF button — wired check

**Files:** none (verification)

The Export PDF button already exists from earlier work and calls `window.print()` after blurring active element (in `EditorTopBar.tsx` Task 21).

- [ ] **Step 1: Smoke test the export flow end-to-end**

```bash
cd frontend && npx next dev -p 3000
```
1. Upload a real PDF via `/upload`
2. Edit one bullet
3. Click "Export PDF"
4. Verify the print dialog opens; save as PDF
5. Open the saved PDF and confirm visual match

- [ ] **Step 2: Document any visual discrepancies in `docs/superpowers/plans/FOLLOWUPS-resume-editor-v1.md` (only if found)**

If discrepancies are found, append findings; otherwise skip.

- [ ] **Step 3: Commit (empty if no follow-ups)**

```bash
git commit --allow-empty -m "Verify Export PDF end-to-end visual fidelity"
```

---

### Task 34: Empty placeholder text — UX polish

**Files:**
- Modify: `frontend/src/components/resume/resume-editor.css`

When an entry has no title/meta/bullets, the canvas looks broken. Add CSS placeholders.

- [ ] **Step 1: Append placeholder rules**

```css
/* ========== Empty state placeholders ========== */
.resume-canvas input::placeholder {
  color: #cbd5e1;
  font-style: italic;
}
.resume-bullet:empty::before,
.resume-bullet > .ProseMirror-trailingBreak:only-child::after {
  content: "Type a bullet…";
  color: #cbd5e1;
  font-style: italic;
  position: absolute;
  pointer-events: none;
}
```

- [ ] **Step 2: Visual check**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/resume-editor.css
git commit -m "Add placeholder text for empty bullets / inputs"
```

---

## Phase 9: History panel

### Task 35: HistoryPanel UI

**Files:**
- Create: `frontend/src/components/resume/HistoryPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/resume/HistoryPanel.tsx
"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { resumeApi, type ResumeSnapshot } from "@/lib/resumeApi";
import { formatRelative } from "@/lib/relativeTime";

interface Props {
  resumeId: string;
  onClose: () => void;
  onRestored: () => void;
}

export function HistoryPanel({ resumeId, onClose, onRestored }: Props) {
  const [snaps, setSnaps] = useState<ResumeSnapshot[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resumeApi
      .listSnapshots(resumeId)
      .then((r) => {
        if (!cancelled) setSnaps(r.snapshots);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  async function restore(snapshotId: string) {
    setRestoring(snapshotId);
    try {
      await resumeApi.restore(resumeId, snapshotId);
      onRestored();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setRestoring(null);
    }
  }

  return (
    <div className="fixed right-0 top-0 z-40 flex h-screen w-[360px] flex-col border-l border-neutral-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">History</h2>
        <button onClick={onClose} className="rounded p-1 hover:bg-neutral-100">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {error && <div className="mb-3 text-xs text-red-600">{error}</div>}
        {snaps == null && <Loader2 className="mx-auto mt-8 size-5 animate-spin text-neutral-400" />}
        {snaps && snaps.length === 0 && (
          <div className="mt-8 text-center text-xs text-neutral-400">
            No snapshots yet — keep editing.
          </div>
        )}
        {snaps && (
          <ul className="space-y-1">
            {snaps.map((s) => (
              <li
                key={s.id}
                className="rounded border border-neutral-200 p-2 hover:border-neutral-300"
              >
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>{formatRelative(s.created_at)}</span>
                  <TriggerBadge trigger={s.trigger} />
                </div>
                {s.label && <div className="mt-1 text-xs font-medium">{s.label}</div>}
                {s.diff_summary && (
                  <div className="mt-1 text-xs text-neutral-600">{s.diff_summary}</div>
                )}
                <button
                  type="button"
                  disabled={restoring === s.id}
                  onClick={() => restore(s.id)}
                  className="mt-2 rounded bg-neutral-900 px-2 py-1 text-[11px] text-white disabled:opacity-50"
                >
                  {restoring === s.id ? "Restoring…" : "Restore this version"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TriggerBadge({ trigger }: { trigger: ResumeSnapshot["trigger"] }) {
  const colors: Record<typeof trigger, string> = {
    auto: "bg-neutral-100 text-neutral-600",
    manual_save: "bg-blue-100 text-blue-700",
    ai_edit: "bg-purple-100 text-purple-700",
    checkpoint: "bg-emerald-100 text-emerald-700",
  };
  const labels: Record<typeof trigger, string> = {
    auto: "auto",
    manual_save: "save",
    ai_edit: "AI",
    checkpoint: "✓ checkpoint",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${colors[trigger]}`}>
      {labels[trigger]}
    </span>
  );
}
```

- [ ] **Step 2: Wire into ResumeEditor**

In `ResumeEditor.tsx`, add state + handler:

```tsx
const [showHistory, setShowHistory] = useState(false);
// ...
<EditorTopBar
  current={current}
  available={available}
  saveStatus={saveStatus}
  lastSavedAt={lastSavedAt}
  editor={editor}
  onOpenHistory={() => setShowHistory(true)}
/>
{/* ... */}
{showHistory && (
  <HistoryPanel
    resumeId={id}
    onClose={() => setShowHistory(false)}
    onRestored={() => {
      // Reload current resume after restore
      resumeApi.get(id).then(setCurrent);
    }}
  />
)}
```

Add import: `import { HistoryPanel } from "./HistoryPanel";`

- [ ] **Step 3: Visual check**

Click History → panel opens; existing snapshots render; click Restore → editor content reverts; banner badge in panel shows "auto" for the pre-restore checkpoint that gets created.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/HistoryPanel.tsx frontend/src/components/resume/ResumeEditor.tsx
git commit -m "Add HistoryPanel (slide-out, list snapshots, restore)"
```

---

### Task 36: Auto-snapshot on idle

**Files:**
- Modify: `frontend/src/components/resume/ResumeEditor.tsx`

Auto-create a snapshot when the user has been idle (no edits) for 30 seconds AND the doc has changed since the last snapshot.

- [ ] **Step 1: Add idle-snapshot logic in ResumeEditor**

In `ResumeEditor.tsx`, add:

```tsx
// At top with other refs:
const lastSnapshotDocRef = useRef<string>("");
const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// Modify handleChange:
const handleChange = (newDoc: Resume["doc"]) => {
  setDoc(newDoc);
  setSaveStatus("saving");
  if (saveTimer.current) clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(() => {
    const c = useResumeEditorStore.getState().current;
    if (!c) return;
    resumeApi
      .upsert({ ...c, doc: newDoc })
      .then(() => markSaved())
      .catch(() => setSaveStatus("error"));
  }, AUTOSAVE_DEBOUNCE_MS);

  // Schedule auto-snapshot 30s after last change, only if doc actually differs
  if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  idleTimerRef.current = setTimeout(() => {
    const docStr = JSON.stringify(newDoc);
    if (docStr !== lastSnapshotDocRef.current) {
      resumeApi
        .createSnapshot(id, { trigger: "auto" })
        .then(() => {
          lastSnapshotDocRef.current = docStr;
        })
        .catch(() => {/* silent — snapshots are best-effort */});
    }
  }, 30_000);
};
```

- [ ] **Step 2: Visual check**

Edit content, wait 30s without typing — open History → new "auto" snapshot present.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/ResumeEditor.tsx
git commit -m "Auto-create snapshot after 30s idle (only if doc changed)"
```

---

### Task 37: Manual checkpoint button

**Files:**
- Modify: `frontend/src/components/resume/EditorTopBar.tsx`

- [ ] **Step 1: Add a "Checkpoint" button next to History in the top bar**

In `EditorTopBar.tsx`, add a button before the History button:

```tsx
<button
  type="button"
  onClick={async () => {
    const label = window.prompt("Checkpoint label (optional):") ?? undefined;
    try {
      await resumeApi.createSnapshot(current.id, {
        trigger: "checkpoint",
        label: label?.trim() || undefined,
      });
    } catch {
      /* ignore */
    }
  }}
  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
  title="Save a labeled checkpoint"
>
  ✓ Checkpoint
</button>
```

Add import: `import { resumeApi } from "@/lib/resumeApi";`

- [ ] **Step 2: Visual check**

Click Checkpoint → prompt → enter label → snapshot appears in History panel with "checkpoint" badge.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/EditorTopBar.tsx
git commit -m "Add manual Checkpoint button in top bar"
```

---

## Phase 10: AI bullet rewrite

### Task 38: rewrite_bullet tool implementation

**Files:**
- Modify: `api/services/ai_tools.py`
- Create: `tests/api/test_ai_tools.py`

- [ ] **Step 1: Write the test (with mocked LLM)**

`tests/api/test_ai_tools.py`:

```python
# tests/api/test_ai_tools.py
"""Tests for AI tools — uses mocked LLM."""
from unittest.mock import patch

import pytest

from api.services import ai_tools, ai_orchestrator
from api.models.resume import ToolCall


@pytest.fixture(autouse=True)
def reset_registry():
    ai_orchestrator.TOOL_REGISTRY.clear()
    ai_tools.register_all()


def test_rewrite_bullet_returns_rewritten_text():
    with patch.object(ai_tools, "_call_llm", return_value="Built 12 REST APIs, cut p95 latency 40%."):
        results = ai_orchestrator.execute_tool_calls(
            resume_id="r1",
            calls=[ToolCall(
                name="rewrite_bullet",
                arguments={
                    "bullet_text": "Built APIs",
                    "preset": "add_quantitative_impact",
                },
            )],
        )
        assert results[0].success is True
        assert "p95" in results[0].data["rewritten"]


def test_rewrite_bullet_unknown_preset_uses_default():
    with patch.object(ai_tools, "_call_llm", return_value="rewritten") as mock_llm:
        ai_orchestrator.execute_tool_calls(
            resume_id="r1",
            calls=[ToolCall(
                name="rewrite_bullet",
                arguments={"bullet_text": "X", "preset": "totally_made_up"},
            )],
        )
        # Should still call LLM (with default prompt), not error
        assert mock_llm.called


def test_rewrite_bullet_empty_text_errors():
    results = ai_orchestrator.execute_tool_calls(
        resume_id="r1",
        calls=[ToolCall(name="rewrite_bullet", arguments={"bullet_text": "", "preset": "default"})],
    )
    assert results[0].success is False
    assert "empty" in (results[0].error or "").lower()
```

- [ ] **Step 2: Implement `rewrite_bullet` in `api/services/ai_tools.py`**

Replace the file's contents:

```python
# api/services/ai_tools.py
"""AI tool implementations registered with ai_orchestrator.

v1 ships exactly one tool: rewrite_bullet.
"""
import os

from langchain_core.messages import SystemMessage, HumanMessage

from services.llm import get_llm

from api.services import ai_orchestrator


PRESET_PROMPTS = {
    "default": (
        "Rewrite the bullet to be clearer and more concise. Preserve all factual content. "
        "Keep within 1.2x the original length."
    ),
    "add_quantitative_impact": (
        "Rewrite the bullet to add concrete quantitative impact (percentages, numbers, scale, time saved, "
        "cost reduced, users reached). If specific numbers are not in the original, suggest realistic "
        "placeholders the candidate can verify (e.g. 'cut p95 latency by ~40%'). "
        "Keep within 1.3x the original length."
    ),
    "stronger_ownership_verbs": (
        "Rewrite the bullet replacing weak verbs ('participated', 'helped', 'assisted', 'worked on') "
        "with strong ownership verbs ('led', 'built', 'designed', 'shipped', 'owned'). "
        "Do NOT inflate scope beyond what the original implies. "
        "This addresses a common pattern where Chinese international students underclaim contribution. "
        "Keep within 1.1x the original length."
    ),
    "tailored_to_variant": (
        "Rewrite the bullet to better match the target role's terminology and signals, while preserving "
        "the underlying facts. Use vocabulary the target company is known for. "
        "Keep within 1.2x the original length."
    ),
}


def _call_llm(prompt: str, bullet_text: str) -> str:
    """Real LLM call. Patched in tests."""
    model_choice = os.environ.get("CAREEROPS_MODEL", "gpt-4o-mini")
    api_key = os.environ.get("OPENAI_API_KEY", "")
    llm = get_llm(model_choice, api_key)
    messages = [
        SystemMessage(content=prompt),
        HumanMessage(content=f"Original bullet:\n{bullet_text}\n\nRewritten bullet (no preamble, just the text):"),
    ]
    res = llm.invoke(messages)
    text = (res.content if isinstance(res.content, str) else str(res.content)).strip()
    # Strip surrounding quotes if model wrapped output
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1]
    return text


def _rewrite_bullet(args: dict) -> dict:
    bullet_text = (args.get("bullet_text") or "").strip()
    preset = args.get("preset") or "default"
    custom = (args.get("custom_instructions") or "").strip()

    if not bullet_text:
        raise ValueError("bullet_text is empty")

    base_prompt = PRESET_PROMPTS.get(preset, PRESET_PROMPTS["default"])
    if custom:
        prompt = f"{base_prompt}\n\nAdditional user instructions:\n{custom}"
    else:
        prompt = base_prompt

    rewritten = _call_llm(prompt, bullet_text)
    return {"rewritten": rewritten}


def register_all() -> None:
    """Idempotently register all v1 tools."""
    ai_orchestrator.register("rewrite_bullet", _rewrite_bullet)
```

- [ ] **Step 3: Run test — pass**

```bash
python -m pytest tests/api/test_ai_tools.py -v
```
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add api/services/ai_tools.py tests/api/test_ai_tools.py
git commit -m "Implement rewrite_bullet tool with 4 presets (incl. ownership verbs for §3.1)"
```

---

### Task 39: rewrite-bullet endpoint

**Files:**
- Modify: `api/routes/resume.py`
- Modify: `tests/api/test_routes_resume.py`

- [ ] **Step 1: Append test**

```python
def test_rewrite_bullet_endpoint(client, monkeypatch):
    _seed_resume("r1", "T")
    from api.services import ai_tools
    monkeypatch.setattr(ai_tools, "_call_llm", lambda prompt, text: "Rewritten: " + text)
    ai_tools.register_all()

    resp = client.post(
        "/api/resume/r1/ai/rewrite-bullet",
        json={"bullet_text": "Built APIs", "preset": "default"},
    )
    assert resp.status_code == 200
    assert resp.json()["rewritten"].startswith("Rewritten:")


def test_rewrite_bullet_endpoint_propagates_error(client):
    _seed_resume("r2", "T")
    from api.services import ai_tools
    ai_tools.register_all()

    resp = client.post(
        "/api/resume/r2/ai/rewrite-bullet",
        json={"bullet_text": "", "preset": "default"},
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Add the endpoint and ensure tools are registered at app startup**

In `api/main.py`, add at the bottom (before `app.get("/api/health")`):

```python
from api.services import ai_tools
ai_tools.register_all()
```

In `api/routes/resume.py`, add:

```python
from api.models.resume import ToolCall


class RewriteBulletRequest(BaseModel):
    bullet_text: str
    preset: str = "default"
    custom_instructions: str | None = None


@router.post("/{resume_id}/ai/rewrite-bullet")
async def rewrite_bullet(resume_id: str, body: RewriteBulletRequest) -> dict:
    from api.services import ai_orchestrator

    results = ai_orchestrator.execute_tool_calls(
        resume_id=resume_id,
        calls=[ToolCall(
            name="rewrite_bullet",
            arguments={
                "bullet_text": body.bullet_text,
                "preset": body.preset,
                "custom_instructions": body.custom_instructions,
            },
        )],
    )
    res = results[0]
    if not res.success:
        raise HTTPException(status_code=422, detail=res.error or "rewrite failed")
    return res.data or {}
```

- [ ] **Step 3: Run tests — pass**

```bash
python -m pytest tests/api/test_routes_resume.py -v -k rewrite
```

- [ ] **Step 4: Commit**

```bash
git add api/main.py api/routes/resume.py tests/api/test_routes_resume.py
git commit -m "Add POST /api/resume/:id/ai/rewrite-bullet endpoint"
```

---

### Task 40: AIRewriteBulletPopover UI

**Files:**
- Create: `frontend/src/components/resume/AIRewriteBulletPopover.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/resume/AIRewriteBulletPopover.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { resumeApi } from "@/lib/resumeApi";

const PRESETS = [
  { value: "default", label: "Default" },
  { value: "add_quantitative_impact", label: "Add quantitative impact" },
  { value: "stronger_ownership_verbs", label: "Stronger ownership verbs" },
  { value: "tailored_to_variant", label: "Tailored to current variant" },
];

interface RewriteRequest {
  from: number;
  to: number;
  text: string;
}

interface Props {
  resumeId: string;
  editor: Editor | null;
}

export function AIRewriteBulletPopover({ resumeId, editor }: Props) {
  const [req, setReq] = useState<RewriteRequest | null>(null);
  const [preset, setPreset] = useState("default");
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onRewrite(e: Event) {
      const ce = e as CustomEvent<RewriteRequest>;
      setReq(ce.detail);
      setSuggestion(null);
      setError(null);
      setPreset("default");
      setCustom("");
    }
    window.addEventListener("resume:rewrite-bullet", onRewrite);
    return () => window.removeEventListener("resume:rewrite-bullet", onRewrite);
  }, []);

  if (!req || !editor) return null;

  async function generate() {
    if (!req) return;
    setLoading(true);
    setError(null);
    try {
      const r = await resumeApi.rewriteBullet(resumeId, {
        bullet_text: req.text,
        preset,
        custom_instructions: custom.trim() || undefined,
      });
      setSuggestion(r.rewritten);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }

  function accept() {
    if (!suggestion || !req || !editor) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: req.from + 1, to: req.to - 1 })
      .insertContentAt(req.from + 1, [{ type: "text", text: suggestion }])
      .run();
    // Snapshot the AI edit
    resumeApi
      .createSnapshot(resumeId, {
        trigger: "ai_edit",
        diff_summary: `Rewrote bullet via ${preset}`,
      })
      .catch(() => {/* silent */});
    close();
  }

  function close() {
    setReq(null);
    setSuggestion(null);
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[460px] rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-purple-500" />
            Rewrite this bullet
          </h3>
          <button onClick={close} className="rounded p-1 hover:bg-neutral-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="mb-3 max-h-20 overflow-y-auto rounded bg-neutral-50 p-2 text-xs text-neutral-700">
          {req.text || "(empty bullet)"}
        </div>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-neutral-600">Style</span>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-neutral-600">
            Custom instructions (optional)
          </span>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. Emphasize team leadership"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        {suggestion && (
          <div className="mb-3 rounded border border-purple-200 bg-purple-50 p-2 text-xs text-purple-900">
            <div className="mb-1 text-[10px] font-semibold uppercase text-purple-600">
              Suggested
            </div>
            {suggestion}
          </div>
        )}
        {error && <div className="mb-2 text-xs text-red-600">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            disabled={loading}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          {suggestion ? (
            <>
              <button
                onClick={generate}
                disabled={loading}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Try again
              </button>
              <button
                onClick={accept}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
              >
                Replace
              </button>
            </>
          ) : (
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              Generate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into ResumeEditor**

In `frontend/src/components/resume/ResumeEditor.tsx`, add:

- import: `import { AIRewriteBulletPopover } from "./AIRewriteBulletPopover";`
- before closing `</div>` of returned JSX: `<AIRewriteBulletPopover resumeId={id} editor={editor} />`

- [ ] **Step 3: Visual check end-to-end**

1. Hover bullet → click ✨
2. Modal opens with bullet text
3. Pick "Add quantitative impact" → Generate → wait → suggestion appears
4. Click Replace → bullet text updates
5. Open History → "AI" badged snapshot present

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/AIRewriteBulletPopover.tsx frontend/src/components/resume/ResumeEditor.tsx
git commit -m "Add AIRewriteBulletPopover (preset + custom + replace/try-again)"
```

---

## Phase 11: Acceptance Walkthrough

### Task 41: Walk all 15 ACs from spec § 11

**Files:** none (verification)

- [ ] **Step 1: Start fresh**

```bash
# Clear any existing resumes (optional clean slate)
rm -rf saved_sessions/resumes/

# Start backend
cd /Users/fred/Desktop/CareerOps-Pro
uvicorn api.main:app --reload --port 8000 &

# Start frontend
cd frontend && npx next dev -p 3000 &
```

- [ ] **Step 2: Walk each AC and record PASS/FAIL with one-line note**

For each AC1–AC15 from `docs/superpowers/specs/2026-04-25-resume-editor-v1-design.md` § 11, mark the result.

- [ ] **Step 3: If any failed, append to `docs/superpowers/plans/FOLLOWUPS-resume-editor-v1.md`**

- [ ] **Step 4: Commit verification result**

If all 15 pass:
```bash
git commit --allow-empty -m "Verified: Resume Editor v1 passes all 15 acceptance criteria"
```

If any failed:
```bash
git add docs/superpowers/plans/FOLLOWUPS-resume-editor-v1.md
git commit -m "Verified Resume Editor v1 — see FOLLOWUPS for failures"
```

---

## Self-review notes

**Spec coverage:**
- § 1.1 (9 IN scope items) → Tasks: PDF import (4, 6, 11, 22-24); Structural ops (25-30); Multi-page (31-32); Persistence (4, 8-13); Variants (13, 19-21); Save status (18, 21); PDF export (32-33); History (5, 12, 35-37); AI rewrite (7, 38-40)
- § 1.3 Constraints — `is_user_consented_for_benchmark` field in Pydantic model (Task 3); AI tool naming aligned with PRODUCT_NOTES §13 (Task 38: `rewrite_bullet`); pageContext in Chinese (Task 16); anti-anxiety copy in SaveBadge / banner (Tasks 18, 24); multi-agent compatible orchestrator (Task 7)
- § 2 PDF decision — captured by removing WeasyPrint pipeline; Tasks 32-33 ensure print fidelity via `@media print` + `break-inside: avoid`
- § 11 ACs — Task 41 walks every one

**Placeholder scan:** No "TBD"/"TODO"/"implement later" patterns. Every code block is complete or explicitly marked as a stub awaiting a later task (e.g., Task 7 placeholder replaced in Task 38).

**Type consistency:**
- `Resume`, `ResumeSnapshot`, `ToolCall`, `ToolResult` defined in Task 3, used identically in 4-13, 38-40
- Frontend `Resume` / `ResumeSummary` types defined in Task 14, used consistently
- `SaveStatus` union (`"idle" | "saving" | "saved" | "error" | "offline"`) consistent across store (Task 15), badge (Task 18), top bar (Task 21)
- API endpoint shapes match between backend (Tasks 8-13) and client (Task 14)

**Known accepted compromise:** Task 27 stores entry title/meta as input field values rather than as ProseMirror inline content. This is intentional (single-line, no marks) and matches the spec's TipTap schema decision documented in the previous Plan A (Task 7 of that plan). Print CSS in Task 32 explicitly addresses the input → text rendering.

**Plans deferred from this v1:** Phase 1.5 (two-column sidebar layout, Playwright server-side PDF, multi-canvas page rendering); Phase 2 (bubble menu, side drawer, per-element history); Multi-agent phase (Walkthrough, Debate, three-agent disagreement, bilingual capabilities). All explicitly listed in spec § 1.2 and § 10.
