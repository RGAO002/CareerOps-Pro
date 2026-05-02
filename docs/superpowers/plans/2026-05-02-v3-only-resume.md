# V3-Only Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate `ResumeDocV2` from the entire pipeline (disk, API, frontend hydration, print, AI). Single canonical shape: `ResumeDocV3`. Streamlit + `html_renderer.py` deleted in same change. Plain rows get a precise content-driven `effectiveGid` rule.

**Architecture:** Six phases, each with a checkpoint (system runnable + tests green) before advancing. Phase 0 lays the schema/helper foundations; Phase 1 builds and dry-runs the migration; Phase 2 cuts over backend; Phase 3 cuts over frontend hydration; Phase 4 rewires AI to v3; Phase 5 deletes legacy code.

**Tech Stack:** Backend: FastAPI + Pydantic. Frontend: Next.js + React + TipTap (ProseMirror) + Vitest. Migration: Node CLI invoking existing TS via `tsx`.

**Spec:** `docs/superpowers/specs/2026-05-02-v3-only-resume-design.md`

---

## File Inventory

### Created
- `frontend/src/components/resume/v3/schema/effectiveGid.ts` (Phase 0)
- `frontend/src/components/resume/v3/schema/__tests__/effectiveGid.test.ts` (Phase 0)
- `api/models/resume_v3.py` (Phase 0) — Pydantic models for ResumeV3
- `api/services/__tests__/test_resume_v3_models.py` (Phase 0) — model validation
- `scripts/migrate-v2-to-v3.ts` (Phase 1)
- `scripts/validate-v3-corpus.ts` (Phase 1)
- `scripts/run-migration.sh` (Phase 1)
- `tests/migration/__init__.py` (Phase 1)
- `tests/migration/test_migrate_v2_to_v3.py` (Phase 1)
- `tests/migration/fixtures/v2/` (Phase 1) — 5+ golden v2 JSONs
- `tests/migration/fixtures/v3/` (Phase 1) — expected v3 outputs
- `tests/api/test_resume_v3.py` (Phase 2) — backend API tests including backup
- `frontend/src/components/resume/v3/schema/__tests__/v3Roundtrip.test.ts` (Phase 3)

### Modified (heavy)
- `api/models/resume.py` — drop V2 classes (Phase 5)
- `api/routes/resume.py` — accept/return v3 only (Phase 2)
- `api/services/resume_store.py` — `save_v3_dict` + backup (Phase 2)
- `frontend/src/components/resume/v3/EditorPageV3.tsx` — hydrate v3 directly (Phase 3)
- `frontend/src/components/resume/v3/PrintCanvasClientV3.tsx` — fetch v3 (Phase 3)
- `frontend/src/components/resume/v3/nodeviews/rowContainer.tsx` — use effectiveGid for plain (Phase 3)
- `frontend/src/components/ai/applySuggestion.ts` — drop v2 store path (Phase 4)
- `frontend/src/components/ai/concurrencyCheck.ts` (Phase 4)
- `frontend/src/components/ai/assistant/poses/SidebarPose.tsx` (Phase 4)
- `frontend/src/components/ai/assistant/poses/BarPose.tsx` (Phase 4)
- `frontend/src/app/resume/[id]/page.tsx` (Phase 3)
- `frontend/src/app/resume/[id]/print/page.tsx` (Phase 3)
- `frontend/src/app/page.tsx` (Phase 3)
- `frontend/src/components/landing/LandingHero.tsx` (Phase 3)
- `frontend/src/components/resume/v3/interaction/keymap/enter.ts` — simplify (Phase 4)

### Deleted
- `frontend/src/components/resume/v2/` (entire directory) — Phase 5
- `frontend/src/components/resume/v3/schema/v2Adapter.ts` — Phase 5
- `frontend/src/components/resume/v3/schema/__tests__/v2Adapter.test.ts` — Phase 5
- `app.py` — Phase 5
- `utils/html_renderer.py` — Phase 5
- `templates/`, `pages/`, `training/` — Phase 5 (Streamlit only)
- `api/services/migration_v1_to_v2.py` — Phase 5

---

# Phase 0 — Foundations (effectiveGid + Pydantic V3 models)

**Checkpoint:** All Phase 0 tests pass; no other code paths touched. System still runs on v2 end-to-end.

---

### Task 0.1: effectiveGid helper — empty plain returns null

**Files:**
- Create: `frontend/src/components/resume/v3/schema/effectiveGid.ts`
- Test: `frontend/src/components/resume/v3/schema/__tests__/effectiveGid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/components/resume/v3/schema/__tests__/effectiveGid.test.ts
import { describe, it, expect } from 'vitest';
import type { ResumeDocV3, RowId, GroupId } from '../types';
import { effectiveGid } from '../effectiveGid';

describe('effectiveGid', () => {
  it('empty plain row returns null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'plain', content: { type: 'doc', content: [] } },
      ],
      groups: [],
    };
    expect(effectiveGid(doc, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/resume/v3/schema/__tests__/effectiveGid.test.ts`
Expected: FAIL with "Cannot find module '../effectiveGid'"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/components/resume/v3/schema/effectiveGid.ts
import type { ResumeDocV3, GroupId } from './types';

/**
 * Compute the effective semanticGroupId for a row at the given index.
 *
 * Rules (spec § 2.2):
 *  - Non-plain rows: return their stored semanticGroupId attribute
 *  - Empty plain rows: null (independent)
 *  - Typed plain rows: inherit the previous row's effectiveGid (recursive)
 *  - Doc start (i === 0) typed plain: null
 *
 * O(n) worst case (a chain of typed plains all the way back to the start).
 * For typical resume docs (<200 rows) this is acceptable on every read.
 */
export function effectiveGid(doc: ResumeDocV3, i: number): GroupId | null {
  if (i < 0 || i >= doc.rows.length) return null;
  const row = doc.rows[i];
  if (row.kind !== 'plain') {
    return ('semanticGroupId' in row && row.semanticGroupId) || null;
  }
  // Empty plain: independent.
  if (isPlainRowEmpty(row)) return null;
  // Typed plain: inherit from previous row.
  if (i === 0) return null;
  return effectiveGid(doc, i - 1);
}

function isPlainRowEmpty(row: { content: { content?: unknown[] } }): boolean {
  const docContent = row.content.content ?? [];
  // RichText shape: { type:'doc', content:[{type:'paragraph', content:[inline...]}, ...] }
  // Empty when no paragraphs OR all paragraphs have empty inline content.
  for (const node of docContent) {
    if (typeof node !== 'object' || node === null) continue;
    const inline = (node as { content?: unknown[] }).content ?? [];
    if (inline.length > 0) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/resume/v3/schema/__tests__/effectiveGid.test.ts`
Expected: PASS — 1 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v3/schema/effectiveGid.ts frontend/src/components/resume/v3/schema/__tests__/effectiveGid.test.ts
git commit -m "feat(v3): effectiveGid helper for plain row lazy gid (empty case)"
```

---

### Task 0.2: effectiveGid — typed plain inherits prev row

**Files:**
- Test: `frontend/src/components/resume/v3/schema/__tests__/effectiveGid.test.ts`

- [ ] **Step 1: Add failing tests for inheritance branches**

Add to the existing `describe('effectiveGid', ...)` block:

```ts
  it('typed plain after section.heading inherits section gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'section.heading', semanticGroupId: 'gSum' as GroupId, content: { text: 'Summary' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] } },
      ],
      groups: [{ id: 'gSum' as GroupId, kind: 'section', role: 'summary' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gSum');
  });

  it('typed plain after entry.title inherits entry gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'entry.title', semanticGroupId: 'gE' as GroupId, content: { text: 'Engineer' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }] } },
      ],
      groups: [{ id: 'gE' as GroupId, kind: 'entry' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gE');
  });

  it('typed plain after bullet inherits entry gid (bullet has entry gid)', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'bullet', semanticGroupId: 'gE' as GroupId, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'shipped X' }] }] } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'detail' }] }] } },
      ],
      groups: [{ id: 'gE' as GroupId, kind: 'entry' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gE');
  });

  it('typed plain at doc start has no predecessor → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'orphan' }] }] } },
      ],
      groups: [],
    };
    expect(effectiveGid(doc, 0)).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they pass (effectiveGid implementation already supports these via recursion)**

Run: `cd frontend && npx vitest run src/components/resume/v3/schema/__tests__/effectiveGid.test.ts`
Expected: PASS — 5 passed (1 from Task 0.1 + 4 new)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/v3/schema/__tests__/effectiveGid.test.ts
git commit -m "test(v3): effectiveGid inherits prev row gid for typed plain"
```

---

### Task 0.3: effectiveGid — chain + cascade behavior

**Files:**
- Test: `frontend/src/components/resume/v3/schema/__tests__/effectiveGid.test.ts`

- [ ] **Step 1: Add failing tests for chain and cascade**

Add to the existing describe block:

```ts
  it('typed plain chain: each inherits transitively', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'section.heading', semanticGroupId: 'gSum' as GroupId, content: { text: 'Summary' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] } },
        { id: 'r3' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] } },
        { id: 'r4' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'third' }] }] } },
      ],
      groups: [{ id: 'gSum' as GroupId, kind: 'section', role: 'summary' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gSum');
    expect(effectiveGid(doc, 2)).toBe('gSum');
    expect(effectiveGid(doc, 3)).toBe('gSum');
  });

  it('cascade: empty plain in middle of chain breaks inheritance for downstream typed plains', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'section.heading', semanticGroupId: 'gSum' as GroupId, content: { text: 'Summary' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] } },
        { id: 'r3' as RowId, kind: 'plain', content: { type: 'doc', content: [] } }, // empty
        { id: 'r4' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'after empty' }] }] } },
      ],
      groups: [{ id: 'gSum' as GroupId, kind: 'section', role: 'summary' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gSum');
    expect(effectiveGid(doc, 2)).toBeNull();
    // r4 looks at r3 (empty → null) → r4 inherits null
    expect(effectiveGid(doc, 3)).toBeNull();
  });

  it('typed plain after header.contact (which has no gid) → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'header.contact', content: { type: 'text', value: 'a@b.c' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'orphan body' }] }] } },
      ],
      groups: [],
    };
    expect(effectiveGid(doc, 1)).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/resume/v3/schema/__tests__/effectiveGid.test.ts`
Expected: PASS — 8 passed

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/v3/schema/__tests__/effectiveGid.test.ts
git commit -m "test(v3): effectiveGid chain + cascade + header-predecessor cases"
```

---

### Task 0.4: Pydantic ResumeV3 models — header + groups

**Files:**
- Create: `api/models/resume_v3.py`
- Create: `api/services/__tests__/__init__.py` (if missing)
- Test: `api/services/__tests__/test_resume_v3_models.py`

- [ ] **Step 1: Write the failing test**

```python
# api/services/__tests__/test_resume_v3_models.py
import pytest
from pydantic import ValidationError
from api.models.resume_v3 import ResumeV3, ResumeMetadataV3


def test_minimal_v3_doc_validates():
    doc = ResumeV3(
        schema_version=3,
        id="resume-1",
        title="Test",
        rows=[],
        groups=[],
        metadata=ResumeMetadataV3(
            created_at="2026-05-02T00:00:00Z",
            updated_at="2026-05-02T00:00:00Z",
        ),
    )
    assert doc.schema_version == 3
    assert doc.rows == []
    assert doc.groups == []


def test_rejects_schema_version_2():
    with pytest.raises(ValidationError):
        ResumeV3(
            schema_version=2,  # not allowed
            id="resume-1",
            title="Test",
            rows=[],
            groups=[],
            metadata=ResumeMetadataV3(
                created_at="2026-05-02T00:00:00Z",
                updated_at="2026-05-02T00:00:00Z",
            ),
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest api/services/__tests__/test_resume_v3_models.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'api.models.resume_v3'"

- [ ] **Step 3: Create `api/services/__tests__/__init__.py` if missing**

```bash
touch api/services/__tests__/__init__.py
```

- [ ] **Step 4: Write minimal implementation**

```python
# api/models/resume_v3.py
"""Pydantic models for the v3 resume schema.

Mirrors the frontend TypeScript types in
`frontend/src/components/resume/v3/schema/types.ts`. v3 is a flat row list
plus a separate semantic groups list — see spec
`docs/superpowers/specs/2026-05-02-v3-only-resume-design.md`.
"""
from typing import Any, List, Literal, Optional, Union

from pydantic import BaseModel, Field


# ---------- content shapes ----------

class PlainText(BaseModel):
    text: str
    align: Optional[Literal["left", "center", "right"]] = None


class ContactItemText(BaseModel):
    type: Literal["text"]
    value: str


class ContactItemLink(BaseModel):
    type: Literal["link"]
    label: str
    url: str


ContactItem = Union[ContactItemText, ContactItemLink]


# RichText is a ProseMirror doc JSON. We keep it loose (`dict[str, Any]`)
# because the inline content is determined by the PM schema and may evolve
# independently of this validator.
RichText = dict[str, Any]


# ---------- rows ----------

class HeaderNameRow(BaseModel):
    id: str
    kind: Literal["header.name"]
    content: PlainText
    align: Optional[Literal["left", "center", "right"]] = None


class HeaderContactRow(BaseModel):
    id: str
    kind: Literal["header.contact"]
    content: ContactItem
    align: Optional[Literal["left", "center", "right"]] = None


class SectionHeadingRow(BaseModel):
    id: str
    kind: Literal["section.heading"]
    content: PlainText
    align: Optional[Literal["left", "center", "right"]] = None
    semanticGroupId: str


class EntryTitleRow(BaseModel):
    id: str
    kind: Literal["entry.title"]
    content: PlainText
    align: Optional[Literal["left", "center", "right"]] = None
    semanticGroupId: str


class EntryMetaRow(BaseModel):
    id: str
    kind: Literal["entry.meta"]
    content: PlainText
    align: Optional[Literal["left", "center", "right"]] = None
    semanticGroupId: str


class PlainRow(BaseModel):
    id: str
    kind: Literal["plain"]
    content: RichText
    align: Optional[Literal["left", "center", "right"]] = None
    # NOTE: spec § 2.2 — plain rows may carry semanticGroupId for
    # backward compat, but the runtime treats it as null and computes
    # effectiveGid lazily. We accept either presence or absence.
    semanticGroupId: Optional[str] = None


class BulletRow(BaseModel):
    id: str
    kind: Literal["bullet"]
    content: RichText
    align: Optional[Literal["left", "center", "right"]] = None
    semanticGroupId: Optional[str] = None


ResumeRow = Union[
    HeaderNameRow,
    HeaderContactRow,
    SectionHeadingRow,
    EntryTitleRow,
    EntryMetaRow,
    PlainRow,
    BulletRow,
]


# ---------- groups ----------

SectionRoleV3 = Literal[
    "experience", "education", "skills", "projects",
    "awards", "publications", "volunteer", "summary", "custom",
]


class SectionGroup(BaseModel):
    id: str
    kind: Literal["section"]
    role: SectionRoleV3
    label: Optional[str] = None


class EntryGroup(BaseModel):
    id: str
    kind: Literal["entry"]
    parentSectionGroupId: Optional[str] = None


SemanticGroup = Union[SectionGroup, EntryGroup]


# ---------- top-level doc ----------

class ResumeMetadataV3(BaseModel):
    created_at: str
    updated_at: str
    target_company: Optional[str] = None
    target_role: Optional[str] = None
    parent_id: Optional[str] = None


class ResumeV3(BaseModel):
    schema_version: Literal[3] = 3
    id: str
    title: str
    template_id: str = "minimal-single-column"
    rows: List[ResumeRow] = Field(default_factory=list)
    groups: List[SemanticGroup] = Field(default_factory=list)
    metadata: ResumeMetadataV3
    # Per-row alignments may also live at row.align; this map is for
    # back-compat with v2 alignments[fieldKey] consumers.
    alignments: Optional[dict[str, str]] = None
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest api/services/__tests__/test_resume_v3_models.py -v`
Expected: PASS — 2 passed

- [ ] **Step 6: Commit**

```bash
git add api/models/resume_v3.py api/services/__tests__/test_resume_v3_models.py api/services/__tests__/__init__.py
git commit -m "feat(api): Pydantic ResumeV3 models — minimal doc + version validation"
```

---

### Task 0.5: Pydantic ResumeV3 — full row + group validation

**Files:**
- Test: `api/services/__tests__/test_resume_v3_models.py`

- [ ] **Step 1: Add failing tests for each row kind + groups**

Append to existing test file:

```python
def test_all_row_kinds_validate():
    doc = ResumeV3(
        schema_version=3,
        id="r-2",
        title="Full",
        rows=[
            {"id": "h1", "kind": "header.name", "content": {"text": "Alice"}},
            {"id": "h2", "kind": "header.contact", "content": {"type": "text", "value": "a@b.c"}},
            {"id": "h3", "kind": "header.contact", "content": {"type": "link", "label": "site", "url": "https://x"}},
            {"id": "s1", "kind": "section.heading", "content": {"text": "Experience"}, "semanticGroupId": "gS"},
            {"id": "e1", "kind": "entry.title", "content": {"text": "Engineer"}, "semanticGroupId": "gE"},
            {"id": "e2", "kind": "entry.meta", "content": {"text": "2026"}, "semanticGroupId": "gE"},
            {"id": "b1", "kind": "bullet", "content": {"type": "doc", "content": []}, "semanticGroupId": "gE"},
            {"id": "p1", "kind": "plain", "content": {"type": "doc", "content": []}},
        ],
        groups=[
            {"id": "gS", "kind": "section", "role": "experience"},
            {"id": "gE", "kind": "entry", "parentSectionGroupId": "gS"},
        ],
        metadata=ResumeMetadataV3(
            created_at="2026-05-02T00:00:00Z",
            updated_at="2026-05-02T00:00:00Z",
        ),
    )
    assert len(doc.rows) == 8
    assert len(doc.groups) == 2


def test_rejects_unknown_row_kind():
    with pytest.raises(ValidationError):
        ResumeV3(
            schema_version=3, id="r", title="t",
            rows=[{"id": "x", "kind": "bogus", "content": {"text": ""}}],
            groups=[],
            metadata=ResumeMetadataV3(created_at="x", updated_at="x"),
        )


def test_section_group_requires_role():
    with pytest.raises(ValidationError):
        ResumeV3(
            schema_version=3, id="r", title="t",
            rows=[],
            groups=[{"id": "g", "kind": "section"}],  # missing role
            metadata=ResumeMetadataV3(created_at="x", updated_at="x"),
        )
```

- [ ] **Step 2: Run tests**

Run: `pytest api/services/__tests__/test_resume_v3_models.py -v`
Expected: PASS — 5 passed

- [ ] **Step 3: Commit**

```bash
git add api/services/__tests__/test_resume_v3_models.py
git commit -m "test(api): ResumeV3 — all row kinds + group validation"
```

---

### Task 0.6: Pydantic ↔ TS isomorphism check

**Files:**
- Create: `tests/migration/fixtures/v3/canonical-all-kinds.json` — a canonical v3 doc covering all 7 row kinds + section + entry groups, hand-written to match what TS `ResumeFileV3` would emit
- Create: `tests/api/test_pydantic_ts_isomorphism.py`

**Why:** Without this gate, TS frontend may save a v3 doc whose shape Pydantic rejects (silent field-name or required-field drift). The fixture is the single canonical doc shape that BOTH sides must accept.

- [ ] **Step 1: Write the canonical v3 fixture**

```json
// tests/migration/fixtures/v3/canonical-all-kinds.json
{
  "schema_version": 3,
  "id": "canonical-1",
  "title": "Canonical Doc",
  "template_id": "minimal-single-column",
  "rows": [
    {"id": "h-name", "kind": "header.name", "content": {"text": "Alice"}},
    {"id": "h-c1", "kind": "header.contact", "content": {"type": "text", "value": "alice@example.com"}},
    {"id": "h-c2", "kind": "header.contact", "content": {"type": "link", "label": "site", "url": "https://x"}},
    {"id": "s1", "kind": "section.heading", "semanticGroupId": "gS1", "content": {"text": "Experience"}},
    {"id": "e1-t", "kind": "entry.title", "semanticGroupId": "gE1", "content": {"text": "Engineer @ X"}},
    {"id": "e1-m", "kind": "entry.meta", "semanticGroupId": "gE1", "content": {"text": "2026"}},
    {"id": "e1-b1", "kind": "bullet", "semanticGroupId": "gE1", "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "shipped X"}]}]}},
    {"id": "p1", "kind": "plain", "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "free para"}]}]}},
    {"id": "p2", "kind": "plain", "content": {"type": "doc", "content": []}}
  ],
  "groups": [
    {"id": "gS1", "kind": "section", "role": "experience", "label": "Experience"},
    {"id": "gE1", "kind": "entry", "parentSectionGroupId": "gS1"}
  ],
  "metadata": {
    "created_at": "2026-05-02T00:00:00Z",
    "updated_at": "2026-05-02T00:00:00Z"
  }
}
```

- [ ] **Step 2: Write the Pydantic side test**

```python
# tests/api/test_pydantic_ts_isomorphism.py
"""Verify the canonical v3 fixture (the shape TS frontend emits) validates
against the Python Pydantic ResumeV3 model. Catches required/optional field
drift between the two implementations.
"""
import json
from pathlib import Path

from api.models.resume_v3 import ResumeV3

FIXTURE = Path(__file__).resolve().parents[1] / "migration" / "fixtures" / "v3" / "canonical-all-kinds.json"


def test_canonical_v3_fixture_validates_in_pydantic():
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    doc = ResumeV3.model_validate(raw)
    # All 7 row kinds present.
    kinds = {r.kind for r in doc.rows}
    expected = {"header.name", "header.contact", "section.heading", "entry.title", "entry.meta", "bullet", "plain"}
    assert kinds == expected, f"missing kinds: {expected - kinds}"
    # Both group kinds present.
    group_kinds = {g.kind for g in doc.groups}
    assert group_kinds == {"section", "entry"}
```

- [ ] **Step 3: Write the TS side test**

```ts
// frontend/src/components/resume/v3/schema/__tests__/canonicalFixture.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ResumeFileV3 } from '../types';

describe('canonical v3 fixture round-trip in TS', () => {
  it('parses cleanly into ResumeFileV3', () => {
    const path = resolve(__dirname, '../../../../../../../tests/migration/fixtures/v3/canonical-all-kinds.json');
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as ResumeFileV3;
    expect(raw.schema_version).toBe(3);
    expect(raw.rows.length).toBe(9);
    expect(raw.groups.length).toBe(2);
    // All 7 row kinds.
    const kinds = new Set(raw.rows.map(r => r.kind));
    expect(kinds.size).toBe(7);
  });
});
```

- [ ] **Step 4: Run both tests**

```bash
pytest tests/api/test_pydantic_ts_isomorphism.py -v
cd frontend && npx vitest run src/components/resume/v3/schema/__tests__/canonicalFixture.test.ts
```

Expected: PASS in both. If Pydantic rejects a field that TS allows (or vice versa), the canonical fixture has caught a drift bug — fix the model that's wrong.

- [ ] **Step 5: Commit**

```bash
git add tests/migration/fixtures/v3/canonical-all-kinds.json tests/api/test_pydantic_ts_isomorphism.py frontend/src/components/resume/v3/schema/__tests__/canonicalFixture.test.ts
git commit -m "test(v3): canonical fixture for Pydantic ↔ TS shape isomorphism"
```

---

### Phase 0 Checkpoint

- [ ] Run all relevant tests:
  - `cd frontend && npx vitest run src/components/resume/v3/schema`
  - `pytest api/services/__tests__/test_resume_v3_models.py tests/api/test_pydantic_ts_isomorphism.py -v`
- [ ] Both should be GREEN. No other code paths touched. Editor still runs on v2.

---

# Phase 1 — Migration Scripts + Golden Fixtures

**Checkpoint:** Migration script can convert real `saved_sessions/*.json` files to v3 in a temp directory. Validation passes for all converted files. Production data is untouched (we run on a copy, not in place).

**Architecture decision (review feedback #1):** Migration CLI is **self-contained from day one** — `v2ToV3` logic is INLINED into `scripts/migrate-v2-to-v3.ts`, NOT imported from `frontend/src/components/resume/v3/schema/v2Adapter.ts`. This avoids "write import in Phase 1, refactor it away in Phase 5" thrash and means Phase 5 deletion of `v2Adapter.ts` requires zero changes to the migration script.

---

### Task 1.0: scripts/ npm setup + tsx install

**Files:**
- Create: `scripts/package.json`
- Create: `.gitignore` (append `scripts/node_modules/` if not present)

- [ ] **Step 1: Bootstrap the scripts npm env**

```bash
mkdir -p scripts
cat > scripts/package.json <<'EOF'
{
  "name": "scripts",
  "private": true,
  "type": "module",
  "devDependencies": {
    "tsx": "^4.7.0"
  }
}
EOF
cd scripts && npm install && cd ..
```

Expected: `scripts/node_modules/.bin/tsx` exists.

- [ ] **Step 2: Add to .gitignore**

```bash
grep -q "^scripts/node_modules" .gitignore || echo "scripts/node_modules/" >> .gitignore
```

- [ ] **Step 3: Verify tsx works**

```bash
echo 'console.log("tsx ok")' > /tmp/_smoke.ts
cd scripts && npx tsx /tmp/_smoke.ts
```

Expected: `tsx ok`

- [ ] **Step 4: Commit**

```bash
git add scripts/package.json scripts/package-lock.json .gitignore
git commit -m "build(migration): scripts/ npm env with tsx for v3 migration CLI"
```

---

### Task 1.1: Create golden v2 fixtures

**Files:**
- Create: `tests/migration/fixtures/v2/01-summary-only.json`
- Create: `tests/migration/fixtures/v2/02-experience-with-bullets.json`
- Create: `tests/migration/fixtures/v2/03-skills-no-meta.json`
- Create: `tests/migration/fixtures/v2/04-empty-bullets-spacers.json`
- Create: `tests/migration/fixtures/v2/05-orphan-bullet.json`

- [ ] **Step 1: Create fixture 1 — Summary-only resume**

```json
// tests/migration/fixtures/v2/01-summary-only.json
{
  "schema_version": 2,
  "id": "fixture-summary-only",
  "title": "Summary Only",
  "template_id": "minimal-single-column",
  "header": {
    "id": "h1",
    "name": "Alice Tester",
    "contact_lines": [
      {"type": "text", "value": "alice@example.com"}
    ]
  },
  "sections": [
    {
      "id": "sec-summary",
      "role": "summary",
      "heading": "Summary",
      "entries": [
        {
          "id": "ent-1",
          "title": "",
          "meta": "",
          "bullets": [
            {
              "id": "b1",
              "kind": "bullet",
              "content": {
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Software engineer with 5 years."}]}]
              }
            }
          ]
        }
      ]
    }
  ],
  "metadata": {
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z"
  }
}
```

- [ ] **Step 2: Create fixture 2 — Experience with multiple bullets**

```json
// tests/migration/fixtures/v2/02-experience-with-bullets.json
{
  "schema_version": 2,
  "id": "fixture-experience",
  "title": "Experience",
  "template_id": "minimal-single-column",
  "header": {
    "id": "h2",
    "name": "Bob Builder",
    "contact_lines": [
      {"type": "text", "value": "bob@example.com"},
      {"type": "link", "label": "github", "url": "https://github.com/bob"}
    ]
  },
  "sections": [
    {
      "id": "sec-exp",
      "role": "experience",
      "heading": "Experience",
      "entries": [
        {
          "id": "ent-evlin",
          "title": "Founding Engineer @ Evlin",
          "meta": "Jan 2026 – Present",
          "bullets": [
            {"id": "b1", "kind": "bullet", "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Built X."}]}]}},
            {"id": "b2", "kind": "bullet", "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Shipped Y."}]}]}}
          ]
        }
      ]
    }
  ],
  "metadata": {
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z"
  }
}
```

- [ ] **Step 3: Create fixture 3 — Skills with no meta**

```json
// tests/migration/fixtures/v2/03-skills-no-meta.json
{
  "schema_version": 2,
  "id": "fixture-skills",
  "title": "Skills",
  "template_id": "minimal-single-column",
  "header": {"id": "h3", "name": "Carol", "contact_lines": []},
  "sections": [
    {
      "id": "sec-skills",
      "role": "skills",
      "heading": "Skills",
      "entries": [
        {
          "id": "ent-prog",
          "title": "Programming",
          "meta": "",
          "bullets": [
            {"id": "b1", "kind": "bullet", "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "TypeScript, Python"}]}]}}
          ]
        }
      ]
    }
  ],
  "metadata": {"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"}
}
```

- [ ] **Step 4: Create fixture 4 — Empty plain bullets as spacers**

```json
// tests/migration/fixtures/v2/04-empty-bullets-spacers.json
{
  "schema_version": 2,
  "id": "fixture-spacers",
  "title": "Spacers",
  "template_id": "minimal-single-column",
  "header": {"id": "h4", "name": "Dan", "contact_lines": []},
  "sections": [
    {
      "id": "sec-exp",
      "role": "experience",
      "heading": "Experience",
      "entries": [
        {
          "id": "ent-1",
          "title": "Engineer @ X",
          "meta": "2024",
          "bullets": [
            {"id": "b1", "kind": "bullet", "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Real bullet"}]}]}},
            {"id": "b2", "kind": "plain", "content": {"type": "doc", "content": [{"type": "paragraph", "content": []}]}},
            {"id": "b3", "kind": "plain", "content": {"type": "doc", "content": [{"type": "paragraph", "content": []}]}},
            {"id": "b4", "kind": "bullet", "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Another bullet"}]}]}}
          ]
        }
      ]
    }
  ],
  "metadata": {"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"}
}
```

- [ ] **Step 5: Create fixture 5 — Orphan bullet (gid points to missing entry)**

```json
// tests/migration/fixtures/v2/05-orphan-bullet.json
{
  "schema_version": 2,
  "id": "fixture-orphan",
  "title": "Orphan",
  "template_id": "minimal-single-column",
  "header": {"id": "h5", "name": "Eve", "contact_lines": []},
  "sections": [
    {
      "id": "sec-exp",
      "role": "experience",
      "heading": "Experience",
      "entries": [
        {
          "id": "ent-real",
          "title": "Engineer @ Y",
          "meta": "2023",
          "bullets": [
            {"id": "b1", "kind": "bullet", "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Real bullet"}]}]}}
          ]
        }
      ]
    }
  ],
  "metadata": {"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"}
}
```

- [ ] **Step 6: Commit fixtures**

```bash
mkdir -p tests/migration/fixtures/v2
# (write files via Edit tool)
git add tests/migration/fixtures/v2/
git commit -m "test(migration): golden v2 fixtures (5 representative shapes)"
```

---

### Task 1.2: Migration script — self-contained Node CLI

**Files:**
- Create: `scripts/migrate-v2-to-v3.ts`

**Architecture note (review feedback #1):** v2→v3 logic is **INLINED** into this script directly, NOT imported from the frontend. The script is self-contained so that Phase 5's deletion of `v2Adapter.ts` requires no script changes.

- [ ] **Step 1: Write the self-contained migration script**

The full body of `v2ToV3` (and its helpers `dedupeId`, `richTextToV2BulletDoc`, `toRichText`, `toPlainText`, `textContactToV2`, `asRowId`, etc.) from `frontend/src/components/resume/v3/schema/v2Adapter.ts` is COPIED into this script. The implementer should:

1. Open `frontend/src/components/resume/v3/schema/v2Adapter.ts`
2. Copy the `v2ToV3` function and ALL helper functions it transitively calls (NOT `v3ToV2` — we don't need that direction in the migration)
3. Paste them as top-level functions in `scripts/migrate-v2-to-v3.ts`
4. Inline the relevant types from `frontend/src/components/resume/v3/schema/types.ts` (`ResumeRow`, `SemanticGroup`, `ResumeDocV3`, etc.) — make them local to the script

This is intentional code duplication. The migration script must run forever as a one-time tool against historical v2 data, even after the live v2Adapter is deleted.

```ts
// scripts/migrate-v2-to-v3.ts
/**
 * Big-bang migration: convert all v2 saved_sessions JSONs to v3.
 *
 * Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 7.
 * Plan ref: 2026-05-02-v3-only-resume.md Task 1.2.
 *
 * SELF-CONTAINED: v2→v3 logic is inlined below. Do NOT import from
 * frontend/src/components/resume/v3/schema/v2Adapter.ts — that file is
 * deleted in Phase 5, but this script must keep working for archival
 * v2 file migration.
 *
 * Usage:
 *   tsx scripts/migrate-v2-to-v3.ts <source-dir> <dest-dir>
 *
 * For each *.json in source-dir:
 *   1. Read, assert schema_version === 2
 *   2. Write source/<id>.v2-backup.json (untouched original)
 *   3. Call inline v2ToV3 (no external import)
 *   4. Strip stored semanticGroupId from all plain rows (lazy gid rule)
 *   5. Wrap with v3 envelope (schema_version: 3, metadata, alignments)
 *   6. Write to dest-dir/<id>.json
 *
 * Files that are NOT v2 resumes (e.g. *.suggestions.json, *.v2-backup.json,
 * *.backup.json) are skipped.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';

// ──────────────────────────────────────────────────────────────────────
// INLINED FROM frontend/src/components/resume/v3/schema/v2Adapter.ts
// (Phase 5 deletes that file. This script keeps the logic alive.)
// ──────────────────────────────────────────────────────────────────────

// [paste v2Adapter.ts types + v2ToV3 + helper functions here]
// Approx 250 LOC. Implementer: literal copy-paste from the source file,
// stripped of v3ToV2 (we don't need it) and `import` statements.

function v2ToV3(v2: any): { schemaVersion: 3; rows: any[]; groups: any[] } {
  // ... inlined body
  throw new Error('replace with inlined v2ToV3 from v2Adapter.ts');
}

// ──────────────────────────────────────────────────────────────────────
// Migration entry point
// ──────────────────────────────────────────────────────────────────────

function isResumeJson(name: string): boolean {
  if (!name.endsWith('.json')) return false;
  if (name.endsWith('.suggestions.json')) return false;
  if (name.endsWith('.backup.json')) return false;
  if (name.endsWith('.v2-backup.json')) return false;
  return true;
}

function migrate(source: string, dest: string): { ok: number; failed: string[] } {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  const files = readdirSync(source).filter(isResumeJson);
  const failed: string[] = [];
  let ok = 0;
  for (const file of files) {
    const path = join(source, file);
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8'));
      if (raw.schema_version !== 2) {
        console.error(`SKIP ${file}: schema_version=${raw.schema_version}, expected 2`);
        failed.push(file);
        continue;
      }
      // Backup original next to source.
      const backupPath = join(source, basename(file, '.json') + '.v2-backup.json');
      copyFileSync(path, backupPath);

      // Convert.
      const v3 = v2ToV3(raw);

      // Strip stored gid from plain rows (lazy gid rule).
      v3.rows = v3.rows.map((row: any) => {
        if (row.kind !== 'plain') return row;
        const { semanticGroupId, ...rest } = row;
        return rest;
      });

      // Wrap with v3 doc envelope (id/title/metadata are at top level in v2;
      // v2ToV3 returns only schemaVersion+rows+groups so we need to merge).
      const v3Doc = {
        schema_version: 3,
        id: raw.id,
        title: raw.title,
        template_id: raw.template_id ?? 'minimal-single-column',
        rows: v3.rows,
        groups: v3.groups,
        metadata: raw.metadata ?? { created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ...(raw.alignments ? { alignments: raw.alignments } : {}),
      };

      writeFileSync(join(dest, file), JSON.stringify(v3Doc, null, 2), 'utf-8');
      console.log(`OK   ${file}`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${file}:`, (e as Error).message);
      failed.push(file);
    }
  }
  return { ok, failed };
}

const [, , source, dest] = process.argv;
if (!source || !dest) {
  console.error('Usage: tsx scripts/migrate-v2-to-v3.ts <source-dir> <dest-dir>');
  process.exit(2);
}
const { ok, failed } = migrate(source, dest);
console.log(`\nMigrated ${ok} file(s). Failed: ${failed.length}`);
if (failed.length > 0) {
  console.error('Failures:', failed);
  process.exit(1);
}
```

- [ ] **Step 3: Test against a fixture**

```bash
mkdir -p /tmp/v3-migrate-test/src /tmp/v3-migrate-test/out
cp tests/migration/fixtures/v2/01-summary-only.json /tmp/v3-migrate-test/src/
cd scripts && npx tsx migrate-v2-to-v3.ts /tmp/v3-migrate-test/src /tmp/v3-migrate-test/out && cd ..
cat /tmp/v3-migrate-test/out/01-summary-only.json
```

Expected: file at `/tmp/v3-migrate-test/out/01-summary-only.json` exists with `"schema_version": 3` and a `rows` array. Backup at `/tmp/v3-migrate-test/src/01-summary-only.v2-backup.json` exists.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-v2-to-v3.ts
git commit -m "feat(migration): self-contained Node CLI v2→v3 (inlined v2Adapter logic)"
```

---

### Task 1.3: Validation script — Pydantic + round-trip check

**Files:**
- Create: `scripts/validate-v3-corpus.py`

- [ ] **Step 1: Write validation script**

```python
#!/usr/bin/env python3
"""Validate every v3 JSON in a directory against ResumeV3 Pydantic models.

Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 7.1.

Usage:
    python scripts/validate-v3-corpus.py <dir>

Exit 0 if all files validate; exit 1 if any fail. Prints a summary per file.
"""
import json
import sys
from pathlib import Path

# Allow running from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.models.resume_v3 import ResumeV3


def validate_dir(directory: Path) -> int:
    files = sorted(p for p in directory.glob("*.json") if not p.name.endswith(".suggestions.json")
                   and not p.name.endswith(".backup.json")
                   and not p.name.endswith(".v2-backup.json"))
    failed: list[str] = []
    for path in files:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if raw.get("schema_version") != 3:
                print(f"FAIL {path.name}: schema_version={raw.get('schema_version')}, expected 3")
                failed.append(path.name)
                continue
            ResumeV3.model_validate(raw)
            print(f"OK   {path.name}")
        except Exception as e:
            print(f"FAIL {path.name}: {e}")
            failed.append(path.name)
    print(f"\nValidated {len(files) - len(failed)}/{len(files)} files. Failed: {len(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/validate-v3-corpus.py <dir>", file=sys.stderr)
        sys.exit(2)
    sys.exit(validate_dir(Path(sys.argv[1])))
```

- [ ] **Step 2: Test against migrated fixture**

Run: `python scripts/validate-v3-corpus.py /tmp/v3-migrate-test/out`
Expected: `OK 01-summary-only.json` then `Validated 1/1 files. Failed: 0` and exit code 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/validate-v3-corpus.py
git commit -m "feat(migration): Pydantic ResumeV3 corpus validator"
```

---

### Task 1.4: Migration test harness — golden round-trip

**Files:**
- Create: `tests/migration/__init__.py`
- Create: `tests/migration/test_migrate_v2_to_v3.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/migration/test_migrate_v2_to_v3.py
"""End-to-end migration test: run the Node CLI on golden v2 fixtures, then
Pydantic-validate the resulting v3 files. Asserts no data loss for the 5
canonical shapes (Summary, Experience, Skills, Spacers, Orphan).
"""
import json
import subprocess
from pathlib import Path

import pytest

from api.models.resume_v3 import ResumeV3

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "v2"
REPO_ROOT = Path(__file__).resolve().parents[2]


def test_migration_succeeds_for_all_golden_fixtures(tmp_path):
    src = tmp_path / "src"
    out = tmp_path / "out"
    src.mkdir()
    out.mkdir()
    # Copy fixtures into src so backup files don't pollute the repo.
    for f in FIXTURES_DIR.glob("*.json"):
        (src / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")

    # Invoke the migration script.
    result = subprocess.run(
        ["npx", "tsx", str(REPO_ROOT / "scripts" / "migrate-v2-to-v3.ts"), str(src), str(out)],
        cwd=REPO_ROOT / "scripts",
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"Migration failed: stdout={result.stdout}\nstderr={result.stderr}"

    # Every output file must be a valid v3 doc.
    output_files = list(out.glob("*.json"))
    assert len(output_files) == 5, f"Expected 5 output files, got {len(output_files)}"
    for f in output_files:
        raw = json.loads(f.read_text(encoding="utf-8"))
        assert raw["schema_version"] == 3, f"{f.name}: schema_version not 3"
        # Pydantic must accept it.
        doc = ResumeV3.model_validate(raw)
        assert doc.id == raw["id"]


def test_summary_fixture_preserves_summary_text(tmp_path):
    src = tmp_path / "src"
    out = tmp_path / "out"
    src.mkdir()
    out.mkdir()
    (src / "01-summary-only.json").write_text(
        (FIXTURES_DIR / "01-summary-only.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    subprocess.run(
        ["npx", "tsx", str(REPO_ROOT / "scripts" / "migrate-v2-to-v3.ts"), str(src), str(out)],
        cwd=REPO_ROOT / "scripts",
        check=True,
    )

    doc = json.loads((out / "01-summary-only.json").read_text(encoding="utf-8"))
    # Find the bullet text.
    bullet_rows = [r for r in doc["rows"] if r["kind"] == "bullet"]
    assert len(bullet_rows) == 1
    inline = bullet_rows[0]["content"]["content"][0]["content"]
    assert inline[0]["text"] == "Software engineer with 5 years."


def test_plain_rows_have_no_stored_gid(tmp_path):
    """spec § 2.2: lazy gid rule — plain rows in v3 must NOT carry stored gid."""
    src = tmp_path / "src"
    out = tmp_path / "out"
    src.mkdir()
    out.mkdir()
    (src / "04-empty-bullets-spacers.json").write_text(
        (FIXTURES_DIR / "04-empty-bullets-spacers.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    subprocess.run(
        ["npx", "tsx", str(REPO_ROOT / "scripts" / "migrate-v2-to-v3.ts"), str(src), str(out)],
        cwd=REPO_ROOT / "scripts",
        check=True,
    )

    doc = json.loads((out / "04-empty-bullets-spacers.json").read_text(encoding="utf-8"))
    plain_rows = [r for r in doc["rows"] if r["kind"] == "plain"]
    assert len(plain_rows) >= 2, "Spacers fixture should produce at least 2 plain rows"
    for row in plain_rows:
        assert "semanticGroupId" not in row, f"plain row {row['id']} retained stored gid"
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pytest tests/migration/test_migrate_v2_to_v3.py -v`
Expected: PASS — 3 passed (assumes the migration script in Task 1.2 works correctly).

If FAIL with "tsx: command not found" — run `cd scripts && npm install` first.

- [ ] **Step 3: Commit**

```bash
git add tests/migration/__init__.py tests/migration/test_migrate_v2_to_v3.py
git commit -m "test(migration): golden v2→v3 fixture round-trip with Pydantic validation"
```

---

### Task 1.5: Migration orchestration script

**Files:**
- Create: `scripts/run-migration.sh`

- [ ] **Step 1: Write the orchestrator**

```bash
#!/usr/bin/env bash
# Big-bang migration runner: backup → convert → validate.
# Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 7.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${1:-$REPO_ROOT/saved_sessions/resumes}"
OUT_DIR="${2:-$REPO_ROOT/saved_sessions/resumes_v3_staging}"

echo "==> Source: $SOURCE_DIR"
echo "==> Staging output: $OUT_DIR"
echo

# Step 1: Convert (script writes .v2-backup.json next to each source file).
echo "==> [1/2] Running v2→v3 conversion..."
cd "$REPO_ROOT/scripts"
npx tsx migrate-v2-to-v3.ts "$SOURCE_DIR" "$OUT_DIR"
echo

# Step 2: Validate.
echo "==> [2/2] Validating v3 corpus..."
cd "$REPO_ROOT"
python scripts/validate-v3-corpus.py "$OUT_DIR"

echo
echo "==> Migration complete. Staged v3 files in: $OUT_DIR"
echo "==> .v2-backup.json files preserved in: $SOURCE_DIR"
echo
echo "Next step (manual): once you've verified the staging output, replace"
echo "the source files atomically:"
echo "    cp $OUT_DIR/*.json $SOURCE_DIR/"
```

- [ ] **Step 2: Make executable + test on golden fixtures**

```bash
chmod +x scripts/run-migration.sh
mkdir -p /tmp/v3-orch-test/src /tmp/v3-orch-test/out
cp tests/migration/fixtures/v2/*.json /tmp/v3-orch-test/src/
./scripts/run-migration.sh /tmp/v3-orch-test/src /tmp/v3-orch-test/out
```

Expected output ends with `Validated 5/5 files. Failed: 0` and exit code 0.

- [ ] **Step 3: Dry run on real saved_sessions (output to staging dir, do NOT touch real files)**

```bash
mkdir -p /tmp/v3-real-staging
./scripts/run-migration.sh saved_sessions/resumes /tmp/v3-real-staging
```

Expected: every real resume file converts and validates. If any fail, **stop and investigate** — do not proceed to Phase 2.

- [ ] **Step 4: Commit**

```bash
git add scripts/run-migration.sh
git commit -m "feat(migration): orchestrator script (backup + convert + validate)"
```

---

### Phase 1 Checkpoint

- [ ] All 5 golden fixtures convert + validate
- [ ] All real `saved_sessions/resumes/*.json` convert + validate (output to `/tmp/v3-real-staging`, real files untouched)
- [ ] `pytest tests/migration/ -v` GREEN
- [ ] **DO NOT run migration on real `saved_sessions` yet** — that happens after Phase 2 backend cutover so the new API can read v3.

---

# Phase 2 — Backend API V3-Only + Backup-on-Write

**Checkpoint:** All API tests pass. `PUT` writes a backup before overwriting. `GET` returns v3. The frontend still expects v2, so it WILL break in this phase — that's expected and fixed in Phase 3.

---

### Task 2.1: `save_v3_dict` with backup-on-write

**Files:**
- Modify: `api/services/resume_store.py`
- Test: `api/services/__tests__/test_resume_store_v3.py`

- [ ] **Step 1: Write the failing test**

```python
# api/services/__tests__/test_resume_store_v3.py
import json
import shutil
from pathlib import Path

import pytest

from api.services import resume_store


@pytest.fixture
def isolated_store(tmp_path, monkeypatch):
    """Point resume_store at a temp directory."""
    monkeypatch.setattr(resume_store, "_RESUMES_DIR", tmp_path)
    return tmp_path


V3_DOC = {
    "schema_version": 3,
    "id": "test-r1",
    "title": "Test",
    "template_id": "minimal-single-column",
    "rows": [],
    "groups": [],
    "metadata": {"created_at": "2026-05-02T00:00:00Z", "updated_at": "2026-05-02T00:00:00Z"},
}


def test_save_v3_dict_writes_file(isolated_store):
    resume_store.save_v3_dict(V3_DOC)
    out = isolated_store / "test-r1.json"
    assert out.exists()
    written = json.loads(out.read_text(encoding="utf-8"))
    assert written["schema_version"] == 3


def test_save_v3_dict_creates_backup_when_main_exists(isolated_store):
    # First write — no backup expected.
    resume_store.save_v3_dict(V3_DOC)
    backup = isolated_store / "test-r1.backup.json"
    assert not backup.exists(), "no backup on first write"

    # Second write — backup of previous content.
    updated = {**V3_DOC, "title": "Updated"}
    resume_store.save_v3_dict(updated)
    assert backup.exists(), "backup created on second write"
    backup_content = json.loads(backup.read_text(encoding="utf-8"))
    assert backup_content["title"] == "Test", "backup contains PRE-write content"
    main = json.loads((isolated_store / "test-r1.json").read_text(encoding="utf-8"))
    assert main["title"] == "Updated"


def test_save_v3_dict_backup_overwrites_previous_backup(isolated_store):
    resume_store.save_v3_dict(V3_DOC)
    resume_store.save_v3_dict({**V3_DOC, "title": "v2-content"})
    resume_store.save_v3_dict({**V3_DOC, "title": "v3-content"})
    backup = json.loads((isolated_store / "test-r1.backup.json").read_text(encoding="utf-8"))
    # Most recent backup = the one written just before the latest save = v2-content
    assert backup["title"] == "v2-content"


def test_save_v3_dict_rejects_missing_id(isolated_store):
    with pytest.raises(ValueError, match="missing id"):
        resume_store.save_v3_dict({"schema_version": 3})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest api/services/__tests__/test_resume_store_v3.py -v`
Expected: FAIL with "AttributeError: module 'api.services.resume_store' has no attribute 'save_v3_dict'"

- [ ] **Step 3: Add the implementation**

Append to `api/services/resume_store.py`:

```python
def save_v3_dict(resume_v3: dict) -> None:
    """Write a v3-shaped resume dict to disk, with backup-on-write.

    Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 7.3.

    Sequence:
      1. Validate id present.
      2. If main file exists, copy it to {id}.backup.json (overwrite).
      3. Write new content to {id}.json.

    Backup write failure logs a warning but does not block main write — the
    backup subsystem must never prevent the user from saving their work.
    """
    if "id" not in resume_v3:
        raise ValueError("missing id")
    _validate_id(resume_v3["id"])
    _ensure_dir()
    main_path = _path_for(resume_v3["id"])
    backup_path = _RESUMES_DIR / f"{resume_v3['id']}.backup.json"
    if main_path.exists():
        try:
            backup_path.write_text(main_path.read_text(encoding="utf-8"), encoding="utf-8")
        except OSError as e:
            # Log but don't block — see spec § 7.3 failure semantics.
            import logging
            logging.getLogger(__name__).warning("backup write failed for %s: %s", resume_v3["id"], e)
    main_path.write_text(
        json.dumps(resume_v3, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest api/services/__tests__/test_resume_store_v3.py -v`
Expected: PASS — 4 passed

- [ ] **Step 5: Commit**

```bash
git add api/services/resume_store.py api/services/__tests__/test_resume_store_v3.py
git commit -m "feat(api): save_v3_dict with backup-on-write"
```

---

### Task 2.2: API `GET /api/resume/{id}` returns v3 only

**Files:**
- Modify: `api/routes/resume.py`
- Create: `tests/api/test_resume_v3.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_resume_v3.py
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.services import resume_store


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(resume_store, "_RESUMES_DIR", tmp_path)
    return TestClient(app)


V3_DOC = {
    "schema_version": 3,
    "id": "test-get",
    "title": "Test",
    "template_id": "minimal-single-column",
    "rows": [],
    "groups": [],
    "metadata": {"created_at": "2026-05-02T00:00:00Z", "updated_at": "2026-05-02T00:00:00Z"},
}


def test_get_returns_v3(client, tmp_path):
    (tmp_path / "test-get.json").write_text(json.dumps(V3_DOC), encoding="utf-8")
    r = client.get("/api/resume/test-get")
    assert r.status_code == 200
    body = r.json()
    assert body["schema_version"] == 3


def test_get_404_for_missing(client):
    r = client.get("/api/resume/nope")
    assert r.status_code == 404
```

- [ ] **Step 2: Run test (will FAIL because GET still returns v2-shaped)**

```bash
mkdir -p tests/api
touch tests/api/__init__.py
pytest tests/api/test_resume_v3.py::test_get_returns_v3 -v
```

Expected: FAIL — current GET returns v2 (via load_dict which auto-migrates v1→v2).

- [ ] **Step 3: Update GET to require v3 on disk**

In `api/routes/resume.py`, replace the `get_resume` function:

```python
@router.get("/{resume_id}")
async def get_resume(resume_id: str) -> dict:
    """Get one resume in full, v3-shaped.

    Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 4.

    Files on disk MUST be schema_version: 3 (migration runs offline before
    deployment — see § 7). Older formats are rejected with 500 to surface
    the inconsistency rather than silently auto-migrate.
    """
    _ensure_valid_id(resume_id)
    try:
        raw = resume_store.load_v3_dict(resume_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Resume not found")
    return raw
```

Add `load_v3_dict` to `api/services/resume_store.py`:

```python
def load_v3_dict(resume_id: str) -> dict:
    """Load a resume as a v3-shaped dict. Refuses to migrate older formats —
    see spec § 7 (offline migration is the only supported v2→v3 path).
    """
    _validate_id(resume_id)
    path = _path_for(resume_id)
    if not path.exists():
        raise FileNotFoundError(f"Resume {resume_id} not found")
    raw = json.loads(path.read_text(encoding="utf-8"))
    version = raw.get("schema_version")
    if version != 3:
        raise ValueError(
            f"Resume {resume_id} on disk has schema_version={version}, "
            f"expected 3. Run scripts/run-migration.sh before deploying."
        )
    return raw
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/api/test_resume_v3.py::test_get_returns_v3 tests/api/test_resume_v3.py::test_get_404_for_missing -v`
Expected: PASS — 2 passed

- [ ] **Step 5: Commit**

```bash
git add api/routes/resume.py api/services/resume_store.py tests/api/__init__.py tests/api/test_resume_v3.py
git commit -m "feat(api): GET /api/resume/{id} returns v3 only (no auto-migrate)"
```

---

### Task 2.3: API `PUT /api/resume/{id}` accepts v3 only

**Files:**
- Modify: `api/routes/resume.py`
- Test: `tests/api/test_resume_v3.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/test_resume_v3.py`:

```python
def test_put_accepts_v3_and_persists(client, tmp_path):
    payload = {**V3_DOC, "id": "test-put"}
    r = client.put("/api/resume/test-put", json=payload)
    assert r.status_code == 200
    saved = json.loads((tmp_path / "test-put.json").read_text(encoding="utf-8"))
    assert saved["schema_version"] == 3
    assert saved["id"] == "test-put"


def test_put_rejects_v2_payload(client):
    payload = {"schema_version": 2, "id": "test-put-v2", "title": "x", "header": {"id": "h", "name": "x", "contact_lines": []}, "sections": [], "metadata": {"created_at": "x", "updated_at": "x"}}
    r = client.put("/api/resume/test-put-v2", json=payload)
    assert r.status_code == 400
    assert "schema_version must be 3" in r.json()["detail"]


def test_put_rejects_invalid_v3(client):
    # Missing required fields → Pydantic validation error.
    r = client.put("/api/resume/bad", json={"schema_version": 3, "id": "bad"})
    assert r.status_code == 400


def test_put_creates_backup_on_overwrite(client, tmp_path):
    first = {**V3_DOC, "id": "test-backup", "title": "v1"}
    second = {**V3_DOC, "id": "test-backup", "title": "v2"}
    client.put("/api/resume/test-backup", json=first)
    assert not (tmp_path / "test-backup.backup.json").exists()
    client.put("/api/resume/test-backup", json=second)
    backup = json.loads((tmp_path / "test-backup.backup.json").read_text(encoding="utf-8"))
    assert backup["title"] == "v1"
```

- [ ] **Step 2: Run tests (will FAIL because PUT requires v2)**

Run: `pytest tests/api/test_resume_v3.py -v`
Expected: FAIL — "Only v2 resumes accepted"

- [ ] **Step 3: Update PUT to require v3**

In `api/routes/resume.py`, replace `upsert_resume`:

```python
@router.put("/{resume_id}")
async def upsert_resume(resume_id: str, payload: dict) -> dict:
    """Create or replace a resume with a v3-shaped doc. URL id always wins.

    Spec ref: docs/superpowers/specs/2026-05-02-v3-only-resume-design.md § 4 + § 7.3.

    The body must declare schema_version: 3. v2 payloads are rejected — the
    frontend writes v3 directly after Phase 3.
    """
    _ensure_valid_id(resume_id)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")
    if payload.get("schema_version") != 3:
        raise HTTPException(
            status_code=400,
            detail="Only v3 resumes accepted (schema_version must be 3)",
        )
    payload["id"] = resume_id
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="metadata is required")
    # Pydantic validate the full doc.
    from api.models.resume_v3 import ResumeV3
    try:
        ResumeV3.model_validate(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"v3 validation failed: {e}")
    # Refresh updated_at server-side.
    from datetime import datetime, timezone
    metadata["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    resume_store.save_v3_dict(payload)
    return payload
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/api/test_resume_v3.py -v`
Expected: PASS — 6 passed (2 from Task 2.2 + 4 new)

- [ ] **Step 5: Commit**

```bash
git add api/routes/resume.py tests/api/test_resume_v3.py
git commit -m "feat(api): PUT /api/resume/{id} accepts v3 only + backup on overwrite"
```

---

### Task 2.4: Update remaining endpoints — create blank, snapshot, restore, variant, parse

**Files:**
- Modify: `api/routes/resume.py`
- Modify: `api/services/resume_store.py` (whatever helpers need updating)
- Test: `tests/api/test_resume_v3.py`

- [ ] **Step 1: Audit and update each endpoint**

Read `api/routes/resume.py` lines 120-447 (the remaining endpoints) and update each:

For `POST /api/resume/` (create blank):
- Currently produces v2-shaped blank doc. Change to produce v3.
- A blank v3 doc has `rows: []`, `groups: []`, `schema_version: 3`, plus header section heading rows for each canonical section (or just empty — v3 hydration handles empty).

For `POST /api/resume/{id}/snapshot` and `/restore`:
- Snapshots store the current doc shape. Just needs to store v3.

For `POST /api/resume/{id}/variant`:
- Copies an existing resume. Source is v3 (after migration), output is v3.

For `POST /api/resume/parse`:
- Parses PDF/DOCX → resume. Currently produces v2 shape. Either:
  - Option A: produce v3 directly (need to refactor parser output)
  - Option B: produce v2 in-process, run v2ToV3 inline before save

Choose **Option B** for this phase (smallest change). The parser logic is independent — wrapping its output with v2ToV3 is a one-line change.

- [ ] **Step 2: Add tests for blank create + variant**

Append to `tests/api/test_resume_v3.py`:

```python
def test_create_blank_returns_v3(client):
    r = client.post("/api/resume/", json={"title": "Blank"})
    assert r.status_code == 200
    body = r.json()
    assert body["schema_version"] == 3
    assert "rows" in body
    assert "groups" in body


def test_variant_returns_v3(client, tmp_path):
    base = {**V3_DOC, "id": "base"}
    client.put("/api/resume/base", json=base)
    r = client.post("/api/resume/base/variant", json={"title": "Variant"})
    assert r.status_code == 200
    body = r.json()
    assert body["schema_version"] == 3
    assert body["id"] != "base"
```

- [ ] **Step 3: Implement endpoint updates — concrete template per endpoint kind**

The pattern for each endpoint:

**Create blank** (`POST /api/resume/`):

```python
@router.post("/")
async def create_blank_resume(body: CreateResumeRequest) -> dict:
    rid = body.id or str(uuid.uuid4())
    _ensure_valid_id(rid)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    doc = {
        "schema_version": 3,
        "id": rid,
        "title": body.title or "Untitled Resume",
        "template_id": "minimal-single-column",
        "rows": [],
        "groups": [],
        "metadata": {"created_at": now, "updated_at": now},
    }
    from api.models.resume_v3 import ResumeV3
    ResumeV3.model_validate(doc)
    resume_store.save_v3_dict(doc)
    return doc
```

**Variant** (`POST /api/resume/{id}/variant`): load source v3 via `resume_store.load_v3_dict`, copy with new id and `parent_id` in metadata, save with `save_v3_dict`. Validate before save.

**Snapshot/restore** (`POST /api/resume/{id}/snapshot` / `/restore`): snapshot the v3 dict to `snapshot_store`. On restore, write the snapshot dict via `save_v3_dict` (which auto-creates the rolling backup).

**Parse** (`POST /api/resume/parse`):

```python
# Existing parser produces v2 dict. Wrap it inline:
v2_dict = parse_resume(...)  # existing call
v3_dict = _python_v2_to_v3(v2_dict)
```

The `_python_v2_to_v3` helper lives in `api/services/parse_v2_to_v3.py` (NEW, ~80 LOC) and only handles the parser's specific output shape (no orphan rows, no plain bullets — parsed resumes are always clean).

**⚠️ Known technical debt (review feedback #6):** This means the parse path KEEPS a v2-shape intermediate inside the backend (`v2_dict` → `_python_v2_to_v3` → v3). The codebase is NOT 100% v2-free after Phase 5 — it's "v2-free in storage and runtime data flow, but parse-output transient remains".

To reach 100% zero-v2, a follow-up task would be: **rewrite `parse_resume` to emit v3 rows + groups directly**. That's significant parser refactor work outside this plan's scope. Filed as follow-up issue:

```
TODO (post-v3-migration): refactor api/services/resume_parser.py to emit
ResumeFileV3 directly. Until then, parse_v2_to_v3.py remains as a v2-shape
intermediate. Tracked in: docs/superpowers/plans/2026-05-02-v3-followups.md
(create if not exists when first followup is filed)
```

Phase 5 acceptance criteria EXPLICITLY exempts `parse_v2_to_v3.py` from "delete all v2-related code" — see Phase 5 grep step.

- [ ] **Step 4: Run all API tests**

Run: `pytest tests/api/ -v`
Expected: PASS — 8+ passed (depending on how many you added)

- [ ] **Step 5: Commit**

```bash
git add api/routes/resume.py api/services/resume_store.py tests/api/test_resume_v3.py
git commit -m "feat(api): all endpoints (create/snapshot/restore/variant/parse) v3-only"
```

---

### Task 2.5: Run real migration (one-way!)

**This task modifies real data. Follow steps in order.**

- [ ] **Step 1: Verify Phase 0/1 tests still green**

```bash
cd frontend && npx vitest run src/components/resume/v3/schema && cd ..
pytest api/services/__tests__/test_resume_v3_models.py api/services/__tests__/test_resume_store_v3.py tests/api/ tests/migration/ -v
```

Expected: ALL GREEN.

- [ ] **Step 2: Stop the dev server (no concurrent writes)**

```bash
# Find and kill any running uvicorn/next-dev processes
pkill -f uvicorn || true
pkill -f "next dev" || true
```

- [ ] **Step 3: Run migration on real saved_sessions to a staging dir**

```bash
mkdir -p saved_sessions/resumes_v3_staging
./scripts/run-migration.sh saved_sessions/resumes saved_sessions/resumes_v3_staging
```

Expected: ALL files convert + validate. Exit 0.

- [ ] **Step 3.5: 🛑 HUMAN GATE — manual sign-off before atomic swap 🛑**

This is the only step in the entire plan that touches **production data destructively**. Before continuing:

1. **Spot-check 3 random files** in `saved_sessions/resumes_v3_staging/`:
   ```bash
   ls saved_sessions/resumes_v3_staging/ | shuf -n 3 | xargs -I{} python -c "
   import json, sys
   d = json.load(open('saved_sessions/resumes_v3_staging/{}'))
   print('  id:', d['id'])
   print('  schema_version:', d['schema_version'])
   print('  rows:', len(d['rows']))
   print('  groups:', len(d['groups']))
   print('  first 3 row kinds:', [r['kind'] for r in d['rows'][:3]])
   "
   ```
   For each, mentally verify against the corresponding v2 file in `saved_sessions/resumes/` — does the row count make sense? Are header/section/entry rows present? No obvious data loss?

2. **Verify the rollback path works** by simulating it:
   ```bash
   # Pick one resume id (REPLACE <ID>):
   diff <(python -c "import json; d=json.load(open('saved_sessions/resumes/<ID>.json')); print(json.dumps(d, indent=2))") \
        <(python -c "import json; d=json.load(open('saved_sessions/resumes/<ID>.v2-backup.json')); print(json.dumps(d, indent=2))")
   ```
   Expected: identical (the .v2-backup.json is a cp of the original v2). If different, the migration script wrote into the source file by accident — STOP, investigate.

3. **Check disk free space** before swap:
   ```bash
   du -sh saved_sessions/resumes/ saved_sessions/resumes_v3_staging/
   df -h saved_sessions/
   ```
   Need at least 2× the resumes/ size free for the archive copy.

4. **STOP and explicitly confirm with user before proceeding**. If running under subagent-driven-development, the controller should request user approval here before dispatching the next subagent. Do NOT proceed to Step 4 automatically.

- [ ] **Step 4: Atomic swap (only after Step 3.5 approval)**

```bash
# Move v2 originals (already backed up as .v2-backup.json next to them).
mkdir -p saved_sessions/resumes_v2_archive
find saved_sessions/resumes -maxdepth 1 -type f -name "*.json" ! -name "*.v2-backup.json" ! -name "*.suggestions.json" \
  -exec mv {} saved_sessions/resumes_v2_archive/ \;

# Move v3 staged files into place.
mv saved_sessions/resumes_v3_staging/*.json saved_sessions/resumes/
rmdir saved_sessions/resumes_v3_staging

# Re-validate after move.
python scripts/validate-v3-corpus.py saved_sessions/resumes
```

Expected: `Validated N/N files. Failed: 0`.

- [ ] **Step 5: Commit (the data migration itself)**

```bash
git add saved_sessions/resumes/ saved_sessions/resumes_v2_archive/
git commit -m "data: migrate saved_sessions/resumes/ to v3 (v2 archived alongside)"
```

---

### Phase 2 Checkpoint

- [ ] All API tests green: `pytest tests/api/ -v`
- [ ] All migration tests green: `pytest tests/migration/ -v`
- [ ] Real `saved_sessions/resumes/*.json` are now `schema_version: 3`
- [ ] `.v2-backup.json` files exist alongside (for emergency rollback)
- [ ] `saved_sessions/resumes_v2_archive/` contains the original v2 files
- [ ] **Frontend will be broken in this state** (still tries v2ToV3 on v3 data) — that's expected, Phase 3 fixes it.

---

# Phase 3 — Frontend Hydration Cutover

**Checkpoint:** Editor opens, displays content, saves successfully against the v3 backend. Print canvas renders correctly. AI features may still be broken (Phase 4 fixes those).

---

### Task 3.1: Frontend type for v3 doc shape (top-level envelope)

**Files:**
- Modify: `frontend/src/components/resume/v3/schema/types.ts`

**SoT clarification (review feedback #2):** Two distinct types live side-by-side. Anywhere code touches "a resume" it must pick one explicitly:

| Type | Where it lives | Contains |
|---|---|---|
| `ResumeFileV3` | Disk (`saved_sessions/*.json`), API request/response, AI fetch outside editor | envelope (id, title, template_id, metadata, alignments) **+** rows + groups |
| `ResumeDocV3` | PM EditorView state, `serializeEditorState` output, `hydrateInitialState` input, AI in-editor reads | rows + groups only |

Conversion is via two pure helpers (added below): `fileToDoc(file)` strips envelope; `docToFile(doc, prevFile)` re-attaches envelope and bumps `metadata.updated_at`. Anywhere else reading "the doc" must use one of these — no ad-hoc field copying.

- [ ] **Step 1: Add `ResumeFileV3` type (top-level disk/API shape)**

The existing `ResumeDocV3` covers the editor-internal shape. The disk/API shape adds `id`, `title`, `template_id`, `metadata`, `alignments`. Add:

```typescript
// (Append to types.ts)

/** Top-level disk/API shape for v3 resumes. The editor works with the
 *  inner `ResumeDocV3` (rows + groups); this envelope adds metadata that
 *  the API + persistence layer carry. */
export interface ResumeFileV3 {
  schema_version: 3;
  id: string;
  title: string;
  template_id: string;
  rows: ResumeRow[];
  groups: SemanticGroup[];
  metadata: {
    created_at: string;
    updated_at: string;
    target_company?: string;
    target_role?: string;
    parent_id?: string;
  };
  alignments?: Record<string, string>;
}

/** Convenience: extract editor-doc subset from the file shape. */
export function fileToDoc(file: ResumeFileV3): ResumeDocV3 {
  return {
    schemaVersion: 3,
    rows: file.rows,
    groups: file.groups,
  };
}

/** Convenience: rebuild file shape from editor doc + previous file's metadata. */
export function docToFile(doc: ResumeDocV3, previous: ResumeFileV3): ResumeFileV3 {
  return {
    ...previous,
    schema_version: 3,
    rows: doc.rows,
    groups: doc.groups,
    metadata: {
      ...previous.metadata,
      updated_at: new Date().toISOString(),
    },
  };
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "types.ts" | head`
Expected: no errors related to `types.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/v3/schema/types.ts
git commit -m "feat(v3): ResumeFileV3 envelope type + fileToDoc/docToFile helpers"
```

---

### Task 3.2: EditorPageV3 hydrates v3 directly (no v2Adapter)

**Files:**
- Modify: `frontend/src/components/resume/v3/EditorPageV3.tsx`

- [ ] **Step 1: Update the hydration block**

Open `frontend/src/components/resume/v3/EditorPageV3.tsx`. Find the imports near line 33-48 and the hydration block near line 188-217.

Change imports:

```typescript
// Replace:
//   import { useResumeStore } from '../v2/store/useResumeStore';
//   import type { ResumeDoc as ResumeDocV2 } from '../v2/types';
//   import { v2ToV3, v3ToV2 } from './schema/v2Adapter';
// With:
import type { ResumeFileV3 } from './schema/types';
import { fileToDoc, docToFile } from './schema/types';
```

(Keep `useResumeStore` import for now — Phase 4 deletes it. We'll continue to feed it for AI compat. Wait — the spec says delete useResumeStore in Phase 4. We need to choose: feed it through Phase 3, or skip feeding and accept AI breakage. **Choice: skip feeding** — accept AI breakage in Phase 3 in exchange for not adding code we'll delete next phase.)

So actually:

```typescript
// Remove ALL of these in this task:
// import { useResumeStore } from '../v2/store/useResumeStore';
// import type { ResumeDoc as ResumeDocV2 } from '../v2/types';
// import { v2ToV3, v3ToV2 } from './schema/v2Adapter';

// Add:
import type { ResumeFileV3 } from './schema/types';
import { fileToDoc, docToFile } from './schema/types';
```

Change `Props.initialResume` from `ResumeDocV2` to `ResumeFileV3`:

```typescript
interface Props {
  initialResume: ResumeFileV3;
}
```

Change the hydration block (~line 188):

```typescript
React.useEffect(() => {
  if (!editor) return;
  hydratedRef.current = false;
  const v3Doc = fileToDoc(initialResume);
  const { docJSON, groups } = hydrateInitialState(v3Doc, editor.schema);
  // ... rest of mount logic stays the same — set editor content, set groups state
  // REMOVE: useResumeStore.getState().hydrate(initialResume);
  latestSnapshotRef.current = JSON.stringify(initialResume);
  previousResumeRef.current = initialResume;
  hydratedRef.current = true;
  // ...
}, [editor, initialResume]);
```

Change `previousResumeRef` type from `ResumeDocV2` to `ResumeFileV3`:

```typescript
const previousResumeRef = React.useRef<ResumeFileV3>(initialResume);
```

Change `buildV2Snapshot` (around line 238) to `buildV3Snapshot`:

```typescript
const buildV3Snapshot = React.useCallback((): ResumeFileV3 | null => {
  if (!editor || !hydratedRef.current) return null;
  const v3 = serializeEditorState(editor.state);
  return docToFile(v3, previousResumeRef.current);
}, [editor]);
```

Update `saveNow` (around line 244) to use `buildV3Snapshot` and remove `useResumeStore.getState().hydrate(next)`:

```typescript
const saveNow = React.useCallback(async () => {
  const next = buildV3Snapshot();
  if (!next) return;
  const snapshot = JSON.stringify(next);
  if (snapshot === latestSnapshotRef.current) return;

  setSaveStatus('saving');
  const promise = fetch(`${API_BASE}/api/resume/${encodeURIComponent(next.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: snapshot,
  }).then((resp) => {
    if (!resp.ok) throw new Error(`Save failed: ${resp.status}`);
    latestSnapshotRef.current = snapshot;
    previousResumeRef.current = next;
    setSaveStatus('saved');
    // REMOVED: useResumeStore + useSuggestionStore hydrate calls
  }).catch((err) => {
    setSaveStatus('error');
    throw err;
  });
  inflightSaveRef.current = promise;
  try {
    await promise;
  } finally {
    if (inflightSaveRef.current === promise) inflightSaveRef.current = null;
  }
}, [buildV3Snapshot]);
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "EditorPageV3" | head`
Expected: No errors in `EditorPageV3.tsx` itself. **Errors in OTHER files that consume `Props` are expected** — Phase 3 continuation tasks fix them.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/v3/EditorPageV3.tsx
git commit -m "feat(v3): EditorPageV3 hydrates v3 directly (no v2Adapter, no useResumeStore feed)"
```

---

### Task 3.3: Update editor page route to fetch v3

**Files:**
- Modify: `frontend/src/app/resume/[id]/page.tsx`

- [ ] **Step 1: Read current file to understand fetch shape**

```bash
cat frontend/src/app/resume/[id]/page.tsx
```

The page fetches a resume server-side and passes it to `EditorPageV3`. The fetch returns a v2 dict from the backend. After Phase 2, the backend returns v3. We need to:
1. Update the type annotation from `ResumeDocV2` to `ResumeFileV3`
2. Remove any v2-specific handling

- [ ] **Step 2: Update the file**

Replace the existing fetch+pass block with:

```typescript
// Replace any `import type { ResumeDoc as ResumeDocV2 } from '...v2/types'` with:
import type { ResumeFileV3 } from '@/components/resume/v3/schema/types';

// In the page component, change the fetched type:
const resume = await fetchResume(params.id) as ResumeFileV3;

// Pass directly:
return <EditorPageV3 initialResume={resume} />;
```

(Implementer: adapt to the actual existing structure of `page.tsx`. The principle is: fetch returns v3 file shape, pass straight to EditorPageV3.)

- [ ] **Step 3: Type-check + browser smoke test**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "app/resume/\[id\]/page" | head`
Expected: no errors in this file.

Then:
```bash
# Start dev server
cd frontend && npm run dev &
NEXT_PID=$!
sleep 3

# Open one of the migrated v3 resumes in browser, visually verify content displays
# (manual step — open http://localhost:3000/resume/<one-of-your-v3-ids>)

kill $NEXT_PID
```

Expected: editor opens, shows resume content. If blank or errors: check browser console + Network tab for fetch failures.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/resume/[id]/page.tsx
git commit -m "feat(v3): editor route fetches v3 directly (no v2 type)"
```

---

### Task 3.4: PrintCanvasV3 + print route hydrate v3

**Files:**
- Modify: `frontend/src/components/resume/v3/PrintCanvasClientV3.tsx`
- Modify: `frontend/src/app/resume/[id]/print/page.tsx`

- [ ] **Step 1: Inspect current shape**

```bash
grep -nE "ResumeDocV2|v2ToV3|fetchResume|initialResume" frontend/src/components/resume/v3/PrintCanvasClientV3.tsx frontend/src/app/resume/[id]/print/page.tsx
```

- [ ] **Step 2: Update PrintCanvasClientV3 prop type**

Change the prop type from `ResumeDocV2` to `ResumeFileV3`. Wherever `v2ToV3` was called, replace with `fileToDoc(initialResume)`.

```typescript
// Replace:
//   import type { ResumeDoc as ResumeDocV2 } from '@/components/resume/v2/types';
//   import { v2ToV3 } from '@/components/resume/v3/schema/v2Adapter';
// With:
import type { ResumeFileV3 } from '@/components/resume/v3/schema/types';
import { fileToDoc } from '@/components/resume/v3/schema/types';

interface Props { initialResume: ResumeFileV3; }

export function PrintCanvasClientV3({ initialResume }: Props) {
  const v3Doc = React.useMemo(() => fileToDoc(initialResume), [initialResume]);
  return <PrintCanvasV3 doc={v3Doc} />;
}
```

- [ ] **Step 3: Update print route**

In `frontend/src/app/resume/[id]/print/page.tsx`, change the fetch's return type from v2 to v3 (no conversion needed — backend already returns v3 after Phase 2):

```typescript
import type { ResumeFileV3 } from '@/components/resume/v3/schema/types';
// fetch and pass to PrintCanvasClientV3 — type changes from v2 to v3
```

- [ ] **Step 4: Type-check + visual smoke test**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "PrintCanvasClientV3|print/page" | head`
Expected: no errors.

Visual: open `http://localhost:3000/resume/<id>/print` in browser, verify content renders.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v3/PrintCanvasClientV3.tsx frontend/src/app/resume/[id]/print/page.tsx
git commit -m "feat(v3): print route + PrintCanvasClientV3 take v3 file directly"
```

---

### Task 3.5: Landing page + LandingHero v3-only

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/components/landing/LandingHero.tsx`

- [ ] **Step 1: Audit usage**

```bash
grep -nE "ResumeDocV2|fetchResume|v2/types" frontend/src/app/page.tsx frontend/src/components/landing/LandingHero.tsx
```

- [ ] **Step 2: Update types and any v2 conversions**

Pattern is the same: `ResumeFileV3` instead of `ResumeDocV2`, no `v2ToV3` calls.

- [ ] **Step 3: Type-check + visual smoke test**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "app/page|LandingHero" | head`
Expected: no errors.

Visual: open `http://localhost:3000/`, verify landing renders if it shows resume preview.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/components/landing/LandingHero.tsx
git commit -m "feat(v3): landing page + hero use v3 file shape"
```

---

### Task 3.6: Update hover/scope consumers to compute effectiveGid for plain rows (Option B)

**Files:**
- Modify: `frontend/src/components/resume/v3/ResumeCanvasV3.tsx` — `resolveHoverGroup` + click/scope handlers
- Modify: `frontend/src/components/resume/v3/nodeviews/rowContainer.tsx` — add doc comment only
- Test: `frontend/src/components/resume/v3/__tests__/effectiveGidHover.test.tsx` (new)

**Architecture decision (review feedback #3):** **Option B selected** — `data-group-id` for plain rows stays empty in the DOM. UI consumers that need "what entry does this plain belong to?" call `effectiveGid(doc, rowIndex)` directly. Rationale:
- Schema is the single source of truth; DOM stays a thin projection
- Avoids per-render compute in NodeView
- Only 2 consumers to update (hover, click — both in ResumeCanvasV3)

- [ ] **Step 1: Audit current data-group-id consumers**

```bash
grep -rn "data-group-id\|getAttribute('data-group-id')" frontend/src/components/resume/v3 | grep -v __tests__ | head -10
```

Expected hits in `ResumeCanvasV3.tsx` (resolveHoverGroup, scope click handler). For each plain-row code path, replace the DOM read with effectiveGid lookup.

- [ ] **Step 2: Write the failing test**

```ts
// frontend/src/components/resume/v3/__tests__/effectiveGidHover.test.tsx
import { describe, it, expect } from 'vitest';
import { effectiveGid } from '../schema/effectiveGid';
import type { ResumeDocV3, RowId, GroupId } from '../schema/types';

describe('effectiveGid drives hover scope for plain rows', () => {
  it('typed plain inside an entry hovers as that entry', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'h' as RowId, kind: 'section.heading', semanticGroupId: 'gS' as GroupId, content: { text: 'Exp' } },
        { id: 't' as RowId, kind: 'entry.title', semanticGroupId: 'gE' as GroupId, content: { text: 'X' } },
        { id: 'm' as RowId, kind: 'entry.meta', semanticGroupId: 'gE' as GroupId, content: { text: '2026' } },
        { id: 'b1' as RowId, kind: 'bullet', semanticGroupId: 'gE' as GroupId, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] } },
        { id: 'p' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'middle' }] }] } },
        { id: 'b2' as RowId, kind: 'bullet', semanticGroupId: 'gE' as GroupId, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] } },
      ],
      groups: [
        { id: 'gS' as GroupId, kind: 'section', role: 'experience' },
        { id: 'gE' as GroupId, kind: 'entry', parentSectionGroupId: 'gS' as GroupId },
      ],
    };
    // Hover index 4 (the plain) → effective gid is gE → hover scope highlights all gE rows.
    expect(effectiveGid(doc, 4)).toBe('gE');
  });
});
```

- [ ] **Step 3: Run test to verify it fails OR passes**

```bash
cd frontend && npx vitest run src/components/resume/v3/__tests__/effectiveGidHover.test.tsx
```

If `effectiveGid` from Phase 0 is already implemented correctly, this test PASSES immediately — that's expected (it's a sanity check, not a new branch). If FAIL, debug effectiveGid.

- [ ] **Step 4: Update ResumeCanvasV3.tsx — `resolveHoverGroup`**

Open `frontend/src/components/resume/v3/ResumeCanvasV3.tsx`. Find `resolveHoverGroup` and any function that reads `data-group-id` from a row element. Currently it likely does:

```typescript
const gid = rowEl.getAttribute('data-group-id');
const sameGroupRows = rows.filter(r => r.getAttribute('data-group-id') === gid);
```

Replace plain-row paths with effectiveGid lookup. Pattern:

```typescript
import { effectiveGid } from './schema/effectiveGid';
import { serializeEditorState } from './schema/serialize';

function resolveEffectiveGidForRow(view: EditorView, rowEl: HTMLElement): string | null {
  const rowId = rowEl.getAttribute('data-row-id');
  if (!rowId) return null;
  // Cheap path: non-plain rows have stored gid in DOM.
  const stored = rowEl.getAttribute('data-group-id');
  const isPlain = rowEl.getAttribute('data-row-kind') === 'plain';
  if (!isPlain) return stored || null;
  // Plain row: compute via effectiveGid against the live PM doc.
  const doc = serializeEditorState(view.state);
  const idx = doc.rows.findIndex(r => r.id === rowId);
  return idx >= 0 ? effectiveGid(doc, idx) : null;
}
```

Then in `resolveHoverGroup`:

```typescript
const targetGid = resolveEffectiveGidForRow(view, hoveredRowEl);
const sameGroupRows = Array.from(view.dom.querySelectorAll<HTMLElement>('.row')).filter(r => {
  return resolveEffectiveGidForRow(view, r) === targetGid;
});
```

(Implementer: adapt to the actual function signatures in ResumeCanvasV3.tsx. The principle: any place a row's "membership" matters and a plain row could be the target, route through `resolveEffectiveGidForRow`.)

- [ ] **Step 5: Add doc comment to rowContainer.tsx**

In `frontend/src/components/resume/v3/nodeviews/rowContainer.tsx`, near the data-group-id emission:

```typescript
// NOTE (spec § 2.2): plain rows have no stored semanticGroupId in PM
// schema. data-group-id will be empty for plain rows. UI consumers that
// need "what entry does this plain visually belong to?" must call
// effectiveGid(doc, rowIndex) — see ResumeCanvasV3 resolveEffectiveGidForRow
// for the pattern.
```

- [ ] **Step 6: Visual smoke test**

Open editor in browser, type into an empty plain row that sits between two bullets of the same entry. Hover the plain row — entire entry should highlight. Click the row's drag handle — scope selection should cover the entry, not just the plain row.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/resume/v3/ResumeCanvasV3.tsx frontend/src/components/resume/v3/nodeviews/rowContainer.tsx frontend/src/components/resume/v3/__tests__/effectiveGidHover.test.tsx
git commit -m "feat(v3): hover/scope use effectiveGid for plain rows (Option B)"
```

---

### Task 3.7: v3 round-trip test (editor → file → editor preserves doc)

**Files:**
- Create: `frontend/src/components/resume/v3/schema/__tests__/v3Roundtrip.test.ts`

- [ ] **Step 1: Write the test**

```ts
// frontend/src/components/resume/v3/schema/__tests__/v3Roundtrip.test.ts
import { describe, it, expect } from 'vitest';
import { EditorState } from '@tiptap/pm/state';
import { Schema } from '@tiptap/pm/model';
import type { ResumeFileV3, RowId, GroupId } from '../types';
import { fileToDoc, docToFile } from '../types';
import { hydrateInitialState } from '../hydrate';
import { serializeEditorState } from '../serialize';
// Import the production schema spec used by the editor:
import { v3SchemaSpec } from '../pmSchema';

const schema = new Schema(v3SchemaSpec);

const sampleFile: ResumeFileV3 = {
  schema_version: 3,
  id: 'rt-1',
  title: 'Round Trip',
  template_id: 'minimal-single-column',
  rows: [
    { id: 'h1' as RowId, kind: 'header.name', content: { text: 'Alice' } },
    { id: 's1' as RowId, kind: 'section.heading', semanticGroupId: 'gS' as GroupId, content: { text: 'Experience' } },
    { id: 'e1' as RowId, kind: 'entry.title', semanticGroupId: 'gE' as GroupId, content: { text: 'Engineer @ X' } },
    { id: 'e2' as RowId, kind: 'entry.meta', semanticGroupId: 'gE' as GroupId, content: { text: '2026' } },
    { id: 'b1' as RowId, kind: 'bullet', semanticGroupId: 'gE' as GroupId, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'shipped X' }] }] } },
    { id: 'p1' as RowId, kind: 'plain', content: { type: 'doc', content: [] } }, // empty plain
    { id: 'p2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'free para' }] }] } }, // typed plain
  ],
  groups: [
    { id: 'gS' as GroupId, kind: 'section', role: 'experience' },
    { id: 'gE' as GroupId, kind: 'entry', parentSectionGroupId: 'gS' as GroupId },
  ],
  metadata: { created_at: '2026-05-02T00:00:00Z', updated_at: '2026-05-02T00:00:00Z' },
};

describe('v3 round-trip', () => {
  it('hydrate → serialize preserves rows + groups', () => {
    const doc = fileToDoc(sampleFile);
    const { docJSON } = hydrateInitialState(doc, schema);
    const state = EditorState.create({ schema, doc: schema.nodeFromJSON(docJSON) });
    const serialized = serializeEditorState(state);

    expect(serialized.schemaVersion).toBe(3);
    expect(serialized.rows.length).toBe(doc.rows.length);
    expect(serialized.rows.map(r => r.kind)).toEqual(doc.rows.map(r => r.kind));
    expect(serialized.rows.map(r => r.id)).toEqual(doc.rows.map(r => r.id));
    expect(serialized.groups.length).toBe(doc.groups.length);
  });

  it('docToFile preserves envelope + bumps updated_at', () => {
    const doc = fileToDoc(sampleFile);
    const file2 = docToFile(doc, sampleFile);

    expect(file2.id).toBe(sampleFile.id);
    expect(file2.title).toBe(sampleFile.title);
    expect(file2.schema_version).toBe(3);
    expect(file2.rows).toEqual(doc.rows);
    expect(file2.metadata.created_at).toBe(sampleFile.metadata.created_at);
    expect(new Date(file2.metadata.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(sampleFile.metadata.updated_at).getTime()
    );
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd frontend && npx vitest run src/components/resume/v3/schema/__tests__/v3Roundtrip.test.ts`
Expected: PASS — 2 passed.

If pmSchema doesn't expose `v3SchemaSpec` directly, check the actual export name:
```bash
grep -n "export" frontend/src/components/resume/v3/schema/pmSchema.ts | head -5
```
Adjust the import accordingly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/v3/schema/__tests__/v3Roundtrip.test.ts
git commit -m "test(v3): round-trip — hydrate → serialize preserves doc shape"
```

---

### Phase 3 Checkpoint

- [ ] Type-check clean for v3 files: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "EditorPageV3|PrintCanvasClientV3|app/resume" | head`
- [ ] Editor opens + saves successfully against v3 backend (manual smoke)
- [ ] Print canvas renders v3 (manual smoke)
- [ ] Round-trip test green: `cd frontend && npx vitest run src/components/resume/v3/schema/__tests__/v3Roundtrip.test.ts`
- [ ] AI features may show errors in console — that's expected, Phase 4 fixes them.

---

# Phase 4 — AI Re-wire (delete useResumeStore + v2 store actions)

**Checkpoint:** AI sidebar + bar + scope sync work. `applySuggestion` writes via PM tx. No file imports `useResumeStore` or anything from `frontend/src/components/resume/v2/`.

---

### Task 4.1: applySuggestion — flip v3 path on permanently

**Files:**
- Modify: `frontend/src/components/ai/applySuggestion.ts`

- [ ] **Step 1: Identify the v3 path + the v2 fallback**

```bash
grep -nE "_isV3FlagOn|_v3View|applySuggestionV3|useResumeStore" frontend/src/components/ai/applySuggestion.ts
```

Currently the file has both v2 and v3 code paths gated by a flag. Goal: delete v2 path, always use v3.

- [ ] **Step 2: Delete v2 paths**

Edit `frontend/src/components/ai/applySuggestion.ts`:

```typescript
// REMOVE these imports:
//   import { useResumeStore, ... } from '@/components/resume/v2/store/useResumeStore';
//   import { insertBullet, insertEntry } from '@/components/resume/v2/store/actions/insertBlock';
//   import { ... } from '@/components/resume/v2/store/actions/...';
//   import { makeOrigin } from '@/components/resume/v2/store/source-of-truth';

// KEEP and rely on:
//   import { applySuggestionV3 } from '@/components/resume/v3/ai/applyWrapper';

// Replace the dispatching function `applySuggestion(...)` with one that
// ONLY calls applySuggestionV3 — no flag check, no v2 fallback:

export async function applySuggestion(
  s: Suggestion,
  // ...other params
): Promise<ApplyResult> {
  if (!_v3View) {
    return { ok: false, error: 'no v3 editor view registered' };
  }
  return applySuggestionV3(s as AISuggestionV3, _v3View);
}
```

(Implementer: keep the function signature stable; only change the body. If `applySuggestion` has multiple variants like `applySuggestions`, `applyAllInRun`, apply the same surgery to each.)

- [ ] **Step 3: Run AI tests**

```bash
cd frontend && npx vitest run src/components/ai
```

Expected: existing tests for the v3 path still PASS. Tests that asserted on v2 store mutations will FAIL — delete those tests if they're v2-specific.

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "applySuggestion" | head
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ai/applySuggestion.ts frontend/src/components/ai/__tests__/applySuggestion.test.ts
git commit -m "refactor(ai): applySuggestion always v3 path (drop v2 store fallback)"
```

---

### Task 4.2: concurrencyCheck — read from v3 instead of useResumeStore

**Files:**
- Modify: `frontend/src/components/ai/concurrencyCheck.ts`

- [ ] **Step 1: Audit current reads**

```bash
grep -nE "useResumeStore|resume\.|ResumeDoc" frontend/src/components/ai/concurrencyCheck.ts | head
```

- [ ] **Step 2: Replace store reads with v3 doc parameter**

Edit `frontend/src/components/ai/concurrencyCheck.ts`:

```typescript
// Replace imports:
//   import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
// With:
import type { ResumeDocV3 } from '@/components/resume/v3/schema/types';

// Change function signature — add `doc` param, drop store read:
export function checkSuggestion(s: Suggestion, doc: ResumeDocV3): CheckResult {
  // (use `doc.rows` and `doc.groups` where the old code used `resume.sections`/`resume.header`)
  // Adapter helpers if needed:
  const findRow = (id: string) => doc.rows.find(r => r.id === id);
  // ... rest of check logic
}
```

- [ ] **Step 3: Update the caller in `applySuggestion.ts`**

```typescript
// In applySuggestion.ts:
import { serializeEditorState } from '@/components/resume/v3/schema/serialize';

// Where checkSuggestion is called:
//   Before: const check = checkSuggestion(s);
//   After:
const v3Doc = serializeEditorState(_v3View!.state);
const check = checkSuggestion(s, v3Doc);
```

- [ ] **Step 3: Update + run tests**

```bash
cd frontend && npx vitest run src/components/ai
```

Expected: tests pass. If a test mocks `useResumeStore`, it needs to mock the v3 doc parameter instead.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ai/concurrencyCheck.ts frontend/src/components/ai/applySuggestion.ts frontend/src/components/ai/__tests__/
git commit -m "refactor(ai): concurrencyCheck takes v3 doc via param (no store read)"
```

---

### Task 4.3: SidebarPose + BarPose — v3 data hooks

**Files:**
- Modify: `frontend/src/components/ai/assistant/poses/SidebarPose.tsx`
- Modify: `frontend/src/components/ai/assistant/poses/BarPose.tsx`

- [ ] **Step 1: Audit current store usage**

```bash
grep -nE "useResumeStore|resume\.sections|resume\.header" frontend/src/components/ai/assistant/poses/SidebarPose.tsx frontend/src/components/ai/assistant/poses/BarPose.tsx
```

- [ ] **Step 2: Replace useResumeStore with v3 doc accessor**

Each pose component currently does:
```typescript
const resume = useResumeStore(s => s.resume);
// ... reads resume.sections, resume.header.name, etc.
```

Replace with a v3 doc subscription. Two options:
- **Option A**: pass v3 doc as prop from parent (simplest — parent has EditorView)
- **Option B**: subscribe to a global v3 doc context provided by EditorPageV3

For minimum surgery, use **Option B** — create `useResumeV3Doc()` hook that internally subscribes to the EditorView (via a context).

Add to `frontend/src/components/resume/v3/hooks/useResumeV3Doc.ts` (NEW):

```typescript
'use client';
import * as React from 'react';
import type { Editor } from '@tiptap/react';
import type { ResumeDocV3 } from '../schema/types';
import { serializeEditorState } from '../schema/serialize';

const EditorContext = React.createContext<Editor | null>(null);

export const ResumeEditorProvider = EditorContext.Provider;

/** Returns the current v3 doc snapshot. Re-renders on every editor transaction. */
export function useResumeV3Doc(): ResumeDocV3 | null {
  const editor = React.useContext(EditorContext);
  const [doc, setDoc] = React.useState<ResumeDocV3 | null>(
    editor ? serializeEditorState(editor.state) : null
  );
  React.useEffect(() => {
    if (!editor) return;
    const update = () => setDoc(serializeEditorState(editor.state));
    editor.on('transaction', update);
    return () => { editor.off('transaction', update); };
  }, [editor]);
  return doc;
}
```

In `EditorPageV3.tsx`, wrap the assistant render with the provider:

```typescript
<ResumeEditorProvider value={editor}>
  <EditorAssistant />
</ResumeEditorProvider>
```

In each pose, replace store reads with `useResumeV3Doc()`. Concrete example for SidebarPose's scope label:

```typescript
// Before (SidebarPose.tsx):
//   const resume = useResumeStore(s => s.resume);
//   const headerName = resume?.header.name ?? 'Untitled';
// After:
import { useResumeV3Doc } from '@/components/resume/v3/hooks/useResumeV3Doc';

const doc = useResumeV3Doc();
const headerNameRow = doc?.rows.find(r => r.kind === 'header.name');
const headerName = (headerNameRow?.content as { text: string } | undefined)?.text ?? 'Untitled';
```

For `BarPose`, look at any `resume.sections`/`resume.header` access and translate to `doc.rows.filter(...)` queries. Add a small accessor helper at `frontend/src/components/resume/v3/schema/accessors.ts` if you find the same query repeated 3+ times.

- [ ] **Step 3: Type-check + visual smoke**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "SidebarPose|BarPose" | head
```

Expected: no errors.

Visual: open editor, open AI sidebar, verify scope label shows correct entry text.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/v3/hooks/useResumeV3Doc.ts frontend/src/components/ai/assistant/poses/SidebarPose.tsx frontend/src/components/ai/assistant/poses/BarPose.tsx frontend/src/components/resume/v3/EditorPageV3.tsx
git commit -m "refactor(ai): SidebarPose + BarPose subscribe to v3 doc via context"
```

---

### Task 4.4: enter.ts — simplify gidForNewRow (plain row branch becomes no-op)

**Files:**
- Modify: `frontend/src/components/resume/v3/interaction/keymap/enter.ts`

- [ ] **Step 1: Read current state**

```bash
grep -n "gidForNewRow\|semanticGroupId" frontend/src/components/resume/v3/interaction/keymap/enter.ts | head
```

The current code already sets `semanticGroupId = null` for plain rows via `gidForNewRow`. With the lazy gid rule, the schema attribute being null IS the correct state — no change needed. But we can simplify the helper since the inheritance is now meaningless for plain.

- [ ] **Step 2: Simplify (optional cleanup)**

Replace `gidForNewRow`:

```typescript
function gidForNewRow(newKind: string, inheritedGid: string | null): string | null {
  // Plain rows: independent. Lazy gid is computed at consumption time
  // via effectiveGid(doc, rowIndex). Schema attribute is omitted.
  if (newKind === 'plain') return null;
  return inheritedGid;
}
```

(No behavioral change — just a doc cleanup.)

- [ ] **Step 3: Run enter tests**

```bash
cd frontend && npx vitest run src/components/resume/v3/interaction/keymap/__tests__/enter.test.ts
```

Expected: still GREEN.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/v3/interaction/keymap/enter.ts
git commit -m "docs(v3): clarify gidForNewRow comment for plain rows (lazy gid)"
```

---

### Phase 4 Checkpoint

- [ ] No file in `frontend/src/components/ai/` imports `useResumeStore`:
  ```bash
  ! grep -rn "useResumeStore" frontend/src/components/ai/ 2>/dev/null
  ```
- [ ] AI tests green: `cd frontend && npx vitest run src/components/ai`
- [ ] Manual smoke: AI sidebar opens, scope label correct, single-click handle switches scope, "rewrite bullet" applies a suggestion
- [ ] Editor saves AND AI keeps working

---

# Phase 5 — Cleanup Sweep (delete v2/, html_renderer, Streamlit)

**Checkpoint:** Repo has zero references to v2 schema, useResumeStore, html_renderer, Streamlit. All tests green. Editor + print + AI work end-to-end.

---

### Task 5.1: Audit remaining v2 references

**Files:** None (audit only).

- [ ] **Step 1: Find all remaining v2 imports**

```bash
grep -rln -E "from '@/components/resume/v2|from '../v2|v2Adapter|useResumeStore|ResumeDocV2" frontend/src 2>/dev/null | grep -v __tests__ | sort -u
```

Expected: ideally empty. Any hits indicate code that still depends on v2.

- [ ] **Step 2: Find usage of html_renderer / Streamlit modules**

```bash
grep -rln -E "html_renderer|streamlit\.|import streamlit" --include="*.py" . 2>/dev/null | grep -v ".venv" | grep -v node_modules
```

- [ ] **Step 3: Capture audit results**

Make a checklist file `docs/superpowers/plans/2026-05-02-v3-cleanup-audit.md` with each remaining hit and the deletion plan.

- [ ] **Step 4: Commit audit**

```bash
git add docs/superpowers/plans/2026-05-02-v3-cleanup-audit.md
git commit -m "docs(cleanup): v2 / Streamlit reference audit"
```

---

### Task 5.2: Delete `frontend/src/components/resume/v2/`

**Files:**
- Delete: entire directory `frontend/src/components/resume/v2/`

- [ ] **Step 1: Run the delete**

```bash
git rm -r frontend/src/components/resume/v2/
```

- [ ] **Step 2: Type-check the project**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: any remaining errors point at consumers that still import from `v2/`. Fix each by either:
- Replacing with v3 equivalent (preferred)
- Or removing dead code that's no longer needed

- [ ] **Step 3: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: GREEN. If tests fail because they were v2-only, delete them; if they fail because of regressions, investigate.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/
git commit -m "refactor(v3): delete frontend/src/components/resume/v2/"
```

---

### Task 5.3: Delete `frontend/.../v3/schema/v2Adapter.ts` + tests

**Files:**
- Delete: `frontend/src/components/resume/v3/schema/v2Adapter.ts`
- Delete: `frontend/src/components/resume/v3/schema/__tests__/v2Adapter.test.ts`

- [ ] **Step 1: Verify no consumers**

```bash
grep -rln "v2Adapter\|v2ToV3\|v3ToV2" frontend/src 2>/dev/null
```

Expected: empty (after Phase 3+4). If hits remain, fix them first.

- [ ] **Step 2: Verify migration script is already self-contained**

Phase 1 Task 1.2 inlined `v2ToV3` into `scripts/migrate-v2-to-v3.ts` from day one. Confirm:

```bash
grep -E "import.*v2Adapter|from '.*v2Adapter" scripts/migrate-v2-to-v3.ts
```

Expected: empty output (no import). If hits exist, the Phase 1 self-contained rule was violated — fix Phase 1 first.

- [ ] **Step 3: Delete v2Adapter from frontend**

```bash
git rm frontend/src/components/resume/v3/schema/v2Adapter.ts frontend/src/components/resume/v3/schema/__tests__/v2Adapter.test.ts
```

- [ ] **Step 4: Verify migration tests still pass (script unaffected)**

```bash
pytest tests/migration/ -v
```

Expected: GREEN.

- [ ] **Step 5: Type-check + frontend tests**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head
cd frontend && npx vitest run
```

Expected: GREEN.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src/components/resume/v3/schema/
git commit -m "refactor(v3): delete v2Adapter.ts (migration script is self-contained)"
```

---

### Task 5.4: Delete v2 Pydantic models from `api/models/resume.py`

**Files:**
- Modify: `api/models/resume.py` (delete v2 classes)
- Modify: any consumer that imports the deleted classes

- [ ] **Step 1: Audit consumers**

```bash
grep -rn "ResumeV2\|SectionBlockV2\|EntryBlockV2\|BulletBlockV2\|ResumeMetadataV2\|HeaderBlockV2" api/ services/ 2>/dev/null | grep -v __pycache__ | head
```

- [ ] **Step 2: Update consumers**

For each remaining consumer, replace the v2 type with the v3 equivalent (`ResumeV3` from `api/models/resume_v3.py`).

- [ ] **Step 3: Delete the v2 classes**

In `api/models/resume.py`, remove lines covering `HeaderBlockV2` through `ResumeV2` (the entire v2 schema block).

- [ ] **Step 4: Run all backend tests**

```bash
pytest -v
```

Expected: GREEN.

- [ ] **Step 5: Commit**

```bash
git add -A api/
git commit -m "refactor(api): delete ResumeV2 + related v2 Pydantic models"
```

---

### Task 5.5: Delete Streamlit + html_renderer

**Files:**
- Delete: `app.py`
- Delete: `utils/html_renderer.py`
- Delete: `templates/`, `pages/`, `training/` (audit first — keep any non-Streamlit content)
- Delete: `api/services/migration_v1_to_v2.py` (no longer needed — v1 data is long migrated)

- [ ] **Step 1: Audit each candidate directory**

```bash
ls templates/ pages/ training/ 2>/dev/null
grep -rln "import streamlit\|from streamlit" templates/ pages/ training/ 2>/dev/null | head
```

For any non-Streamlit file in these dirs, decide whether to keep (move to a sibling location) or delete.

- [ ] **Step 2: Run the deletion**

```bash
git rm -r app.py utils/html_renderer.py
git rm -r templates/ pages/ training/  # adjust if any files preserved
git rm api/services/migration_v1_to_v2.py
```

- [ ] **Step 3: Update imports in remaining backend code**

```bash
grep -rln "from utils.html_renderer\|from app\|migration_v1_to_v2" --include="*.py" . 2>/dev/null | grep -v ".venv"
```

For each hit, remove the import (the consuming code path should also be unreachable now since Streamlit is gone — verify and delete).

- [ ] **Step 4: Run all backend tests**

```bash
pytest -v
```

Expected: GREEN.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete Streamlit (app.py), html_renderer.py, v1→v2 migration"
```

---

### Task 5.6: Update README + dev docs

**Files:**
- Modify: `README.md` (remove Streamlit instructions, mention v3-only)
- Modify: `dev.sh` (remove any Streamlit startup)
- Modify: `CLAUDE.md` if it references v2

- [ ] **Step 1: Audit**

```bash
grep -n "streamlit\|v2 schema\|ResumeV2\|html_renderer" README.md dev.sh CLAUDE.md 2>/dev/null
```

- [ ] **Step 2: Update README**

Remove any Streamlit "How to run" sections. Add a brief note that the resume schema is `schema_version: 3` and any developer importing existing v2 data should run `./scripts/run-migration.sh`.

- [ ] **Step 3: Update dev.sh**

If `dev.sh` starts Streamlit alongside FastAPI, remove that line.

- [ ] **Step 4: Commit**

```bash
git add README.md dev.sh CLAUDE.md
git commit -m "docs: update README + dev.sh for v3-only / no Streamlit"
```

---

### Task 5.7: Final acceptance check

- [ ] **Step 1: Zero hits on forbidden references (with documented exemption)**

Run each command, expect EMPTY output:

```bash
git grep -E "ResumeV2|v2Adapter|useResumeStore|html_renderer|streamlit" -- '*.ts' '*.tsx' '*.py' \
  ':!*.lock' ':!docs/**' ':!*.v2-backup.json' ':!*v2_archive*' \
  ':!api/services/parse_v2_to_v3.py' ':!api/services/__tests__/test_parse_v2_to_v3.py' \
  ':!api/routes/resume.py'  # parse endpoint imports parse_v2_to_v3 — that's the one allowed v2 reference
```

**Documented exemption (review feedback #6):** `parse_v2_to_v3.py` is intentionally retained as a transient adapter for the parser output. It's the ONLY v2-shape code remaining post-cleanup. Tracked as follow-up: rewrite parser to emit v3 directly.

If any other hit appears in production code (not docs, not archives), fix before proceeding.

- [ ] **Step 2: All saved_sessions are v3**

```bash
for f in saved_sessions/resumes/*.json; do
  [[ "$f" == *.suggestions.json ]] && continue
  [[ "$f" == *.backup.json ]] && continue
  [[ "$f" == *.v2-backup.json ]] && continue
  v=$(python -c "import json,sys; print(json.load(open('$f'))['schema_version'])")
  [[ "$v" == "3" ]] || { echo "NOT V3: $f (version=$v)"; exit 1; }
done
echo "All saved_sessions are v3 ✓"
```

- [ ] **Step 3: Full test run**

```bash
pytest -v
cd frontend && npx vitest run
```

Both: GREEN.

- [ ] **Step 4: Manual end-to-end smoke**

1. Start dev: `./dev.sh`
2. Open `http://localhost:3000` — landing renders
3. Open a resume `http://localhost:3000/resume/<id>` — editor opens, content loads
4. Edit a field → wait for auto-save → reload → content preserved
5. Open AI sidebar (Cmd+\) → scope label correct
6. Type "rewrite this bullet" via AI → suggestion applied → editor reflects change
7. Open `/resume/<id>/print` — print canvas renders

If all 7 steps work, the migration is complete.

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: final v3-only cutover sweep — all checks green"
```

---

### Phase 5 Checkpoint — DONE

- [ ] Acceptance criteria from spec § 13 met
- [ ] Spec self-review tests added (effectiveGid, round-trip, migration, API, AI)
- [ ] Repo grep for forbidden v2 references returns empty
- [ ] Manual smoke covers: editor, save, reload, AI sidebar, AI suggestion, print
