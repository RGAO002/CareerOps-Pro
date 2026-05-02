# Full-v3 Resume Persistence + AI Re-wire — Design Spec

**Status:** Approved (2026-05-02)
**Author:** Brainstormed with @fred
**Predecessor:** `2026-04-28-resume-editor-ai-design.md` (this spec retires the v2-as-storage assumption baked into that one)
**Implementation plan:** `docs/superpowers/plans/2026-05-02-v3-only-resume.md` (to be written next)

## 1. Goal

Eliminate `ResumeDocV2` from the entire pipeline (disk → API → editor → print → AI). Single canonical shape: `ResumeDocV3`. Streamlit legacy app and `html_renderer.py` are deleted in the same change. Plain rows get a precise, content-driven `semanticGroupId` rule that fixes the cluster of "empty/typed plain row attribution" bugs.

## 2. Background

### 2.1 Current pipeline (the problem)

```
saved_sessions/*.json (v2)                    ← persistence is v2
  ↓ GET (v2)
backend API (v2 only)                         ← Pydantic ResumeV2 models
  ↓ fetch v2
frontend hydration → v2ToV3 → PM editor       ← lossy translation seam #1
  ↓ serializeEditorState
v3 doc → v3ToV2 → PUT (v2)                    ← lossy translation seam #2
print route: fetch v2 → v2ToV3 → PrintCanvasV3
AI tools: useResumeStore (v2 shape) ← hydrated from v2 on load + after save
```

Two lossy translation seams (`v2Adapter.ts`) cause:
- Position loss for null-gid plain rows (entry-grouped buckets in v2 can't represent "plain between two bullets without entry attribution")
- Round-trip drift on edge fields (alignments, orphan rows, IDs)
- A class of "save → reload → data shape changed" bugs

### 2.2 Plain row rule (current vs. proposed)

**Current (post-2026-05-02 fix):** Enter creates plain rows with `semanticGroupId = null` unconditionally. Lazy v3ToV2 emits each as a synthetic orphan-style entry. v2ToV3 detects the synthetic shape and collapses back to a single null-gid plain row.

This works for plain rows that sit BETWEEN entries (independent paragraphs). It fails for plain rows that sit INSIDE an entry's body (between two bullets) — they get extracted from the entry on serialization and orphan above/below it on reload, breaking visual position.

**Proposed:** Lazy gid computation. The schema attribute `semanticGroupId` on `plain` rows is unused (always omitted). At every consumption point, compute `effectiveGid(doc, rowIndex)`.

**Revision history:**
- v1 ("recursive lookback"): typed plain inherits previous row's effectiveGid; empty plain breaks the chain. **Rejected** — a typed plain one blank below an entry's last bullet appeared outside the entry's scope.
- v2 ("bounded 2-row lookback"): scan up to 2 rows; first non-null wins. **Rejected** — N>2 blanks still broke attribution; rule sensitive to how many blanks user happens to type.
- v3 ("title-to-title containment"): block extends from `entry.title` to next `entry.title`/`section.heading`. **Rejected** — sucks in trailing rows that have no actual entry-content nearby (empties + typed plains far past the entry's last bullet still attributed to the entry).
- **v4 (current — block + adjacency)**: an entry's block is the span from its first entry-content row to its **last entry-content row** (entry-content = `entry.title`/`entry.meta`/`bullet` with stored gid). Plains strictly inside that span belong by position. Plains beyond it use a strict adjacency rule: typed AND immediately adjacent (no empty plain between) → attribute; empty OR separated by an empty → null.

```
effectiveGid(doc, i):
  row = doc.row[i]
  if row.kind != 'plain':
    return row.semanticGroupId   (stored attribute, may be null)

  P_idx = nearest non-plain row above i        (skip plains)
  Q_idx = nearest non-plain row below i        (skip plains)
  P_entryGid = entryGidOf(P_idx)               (entry.title/meta/bullet → its gid; else null)
  Q_entryGid = entryGidOf(Q_idx)
  P_sectionGid = sectionGidOf(P_idx)           (section.heading → its gid; else null)

  // Rule 1: block containment.
  if P_entryGid && P_entryGid === Q_entryGid:
    return P_entryGid

  // Rule 2: trailing entry adjacency.
  if P_entryGid:
    if row is empty:                                return null
    if any empty plain between P_idx and i:         return null
    return P_entryGid

  // Rule 3: trailing section adjacency.
  if P_sectionGid:
    if row is empty:                                return null
    if any empty plain between P_idx and i:         return null
    return P_sectionGid

  return null
```

User-stated examples (CareerOps Pro entry spans rows 20–32 where 20 = title, 32 = last bullet):
- **Row 27** (any plain inside 20..32): in entry. (Rule 1.)
- **Row 33 empty** (right after last bullet): null. (Rule 2.)
- **Row 33 typed** (user types into the previously-empty row 33): in entry — adjacent to row 32. (Rule 2.)
- **Row 33 empty + Row 34 typed**: row 34 null — row 33 (empty) sits between row 32 and row 34, breaks adjacency. (Rule 2.)
- Plain wedged between bullets of the SAME entry, even if itself empty: in entry. (Rule 1.)
- Trailing empties at doc tail past last bullet (no entry-content below): null.

Properties:
- Boundary anchors for entry blocks are entry-content rows (`entry.title`, `entry.meta`, `bullet`). Orphan bullets (bullets with a stored gid that has no `entry.title`) participate naturally — they ARE entry-content for their orphan group, so plains around them get the orphan gid via the same rules.
- Plains between two different entries attribute to the FIRST entry via the trailing rule (row above wins), not by leading attribution from the next entry's title.
- No PM transaction overhead (computed on read, not stored).

## 3. Out of Scope (explicit non-changes)

To keep the visual editor work intact and contain blast radius:

- **Untouched files (visual/interaction layer):**
  - `ResumeCanvasV3.tsx`, `EditorShellCop.tsx`, `EditorPageV3.css`
  - All NodeViews (`rowContainer.tsx`, kind-specific renderers)
  - `DragController.ts`, `LayoutEngine.ts`, `PaginationPlugin.ts`
  - AI sidebar/bar UI components (`SidebarPose.tsx`, `BarPose.tsx`, `OrbPose.tsx` — UI shell only; data hooks change)
  - COP entrance animations, Marquee tier system, scope sync
  - `interaction/keymap/enter.ts` (already updated in commit 17f6e48 to set plain gid=null; that becomes a no-op once schema attribute is dropped, but the file structure stays)

- **No schema changes to v3 row/group types beyond:**
  - `plain` row's `semanticGroupId` attribute becomes unused (default null, never set by anything). Schema kept for backward parsing of old saved data during migration window.

## 4. Architecture (target state)

```
saved_sessions/resumes/*.json (schema_version: 3)    ← all v3
  ↓ GET (v3)
backend API (v3 only — Pydantic ResumeV3)
  ↓ fetch v3
frontend hydration → PM editor (no adapter)
  ↓ serializeEditorState (returns v3)
PUT v3 (no adapter)
  ↑ before write: cp main.json → main.backup.json (overwrite, retain latest 1)

print route: fetch v3 → PrintCanvasV3 (no adapter)

AI tools:
  in-editor    → read EditorView (v3 doc) + dispatch PM tx for writes
  out-of-editor → fetch /api/resume/{id} + PUT for writes
  SoT: server file (persistent), EditorView (session)
```

## 5. Files to delete

- `frontend/src/components/resume/v2/` — entire directory
- `frontend/src/components/resume/v3/schema/v2Adapter.ts`
- `frontend/src/components/resume/v2/store/useResumeStore.ts` (deleted with v2/ dir)
- `api/models/resume.py`: `ResumeV2`, `SectionBlockV2`, `EntryBlockV2`, `BulletBlockV2`, `ResumeMetadataV2`, `ContactItemV2` — replace with V3 equivalents
- `api/converters/resume.py`: `v1_to_v2`, `migrate_to_v2` — replace with v2→v3 if any backend converter needed (otherwise delete)
- `app.py` (Streamlit entry)
- `utils/html_renderer.py`
- `templates/`, `pages/`, `training/` — audit and remove Streamlit-only directories
- Any backend code only invoked by Streamlit (e.g., `services/streamlit_session.py` if exists)

## 6. Files to modify

### Backend
- `api/models/resume.py`: add `ResumeV3`, `SemanticGroupV3`, row union types (mirror frontend `schema/types.ts`)
- `api/routes/resume.py`:
  - `GET /api/resume/{id}` — return v3, validate `schema_version=3`
  - `PUT /api/resume/{id}` — accept v3, validate `schema_version=3`, run backup-on-write
  - `POST /api/resume/` — produce blank v3
  - `POST /api/resume/{id}/snapshot` / `restore` — v3 shape
  - `POST /api/resume/{id}/variant` — v3 in/out
  - `POST /api/resume/{id}/ai/rewrite-bullet` — accept v3 doc, identify row by id
  - `POST /api/resume/parse` — produce v3 directly (or v2→v3 inline; prefer direct)
  - `GET /api/resume/{id}/pdf` — unchanged (Chromium prints frontend route which now hydrates v3)
- `services/resume_store.py`: `save_v3_dict` (replaces `save_v2_dict`), backup-on-write logic
- `services/job_tracker.py`: any read/write of resume data → v3

### Frontend
- `frontend/src/components/resume/v3/schema/types.ts`: remove all v2 imports
- `frontend/src/components/resume/v3/schema/hydrate.ts`: read v3 directly
- `frontend/src/components/resume/v3/schema/effectiveGid.ts` (NEW): lazy gid computation per § 2.2
- `frontend/src/components/resume/v3/EditorPageV3.tsx`: remove `useResumeStore` hydrate, remove `v3ToV2`/`v2ToV3` calls
- `frontend/src/components/resume/v3/PrintCanvasClientV3.tsx`: read v3 directly
- `frontend/src/app/resume/[id]/page.tsx`: fetch v3
- `frontend/src/app/resume/[id]/print/page.tsx`: fetch v3
- `frontend/src/app/page.tsx` (landing): fetch v3 if showing resume preview
- `frontend/src/components/landing/LandingHero.tsx`: same
- `frontend/src/components/ai/applySuggestion.ts`: rewrite to take EditorView + dispatch PM tx
- `frontend/src/components/ai/concurrencyCheck.ts`: read from EditorView or fetch
- `frontend/src/components/ai/assistant/poses/SidebarPose.tsx`: data hook from EditorView/context (UI unchanged)
- `frontend/src/components/ai/assistant/poses/BarPose.tsx`: same
- `frontend/src/stores/sectionHighlight.ts`: drop v2 imports if any (data only)
- `frontend/src/stores/aiSuggestion.ts`: drop v2 imports if any
- `frontend/src/components/resume/v3/interaction/keymap/enter.ts`: simplify — remove the `gidForNewRow('plain', ...)` plumbing since plain rows just never get gid set anymore
- `frontend/src/components/resume/v3/nodeviews/rowContainer.tsx`: when reading `data-group-id` for plain rows, use `effectiveGid` (only if needed for hover highlight; otherwise leave empty for plain rows)
- AI consumer that previously read entry/section labels from v2 shape → write small accessor over v3 (e.g., `frontend/src/components/resume/v3/ai/contextAssembly.ts` may already do this; verify and patch)

### Tests
- Delete: all `frontend/src/components/resume/v2/**/__tests__/` files
- Delete: `frontend/src/components/resume/v3/schema/__tests__/v2Adapter.test.ts`
- Add: `frontend/src/components/resume/v3/schema/__tests__/effectiveGid.test.ts` — covers all branches of the lazy gid rule including cascade
- Update: round-trip tests use v3 in/out (no v2)
- Add: `tests/api/test_resume_v3.py` (backend) — Pydantic validation, PUT/GET round-trip, backup creation
- Add: `tests/migration/test_migrate_v2_to_v3.py` — runs migration on golden fixtures, asserts no data loss
- Update: AI suggestion tests to use new EditorView-based data source

## 7. Migration

### 7.1 Big-bang offline migration

Implementation: **Node CLI calling existing TS `v2ToV3`** (not re-implemented in Python — single source of truth). Python wrapper handles backup/orchestration.

Files:
- `scripts/migrate-v2-to-v3.ts` — Node entry. For each `saved_sessions/resumes/*.json`:
  1. Read JSON, assert `schema_version === 2`
  2. Write `*.v2-backup.json` (full original copy, never overwritten)
  3. Call `v2ToV3(parsedV2)` from `frontend/src/components/resume/v3/schema/v2Adapter.ts`
  4. Apply the new lazy plain-rule to the resulting v3 (drop stored gid on plain rows)
  5. Write back as `schema_version: 3`
- `scripts/validate-v3-corpus.ts` — for each migrated v3 file:
  1. Pydantic-validate via backend `ResumeV3` schema (subprocess to Python, or port to TS schema lib)
  2. Hydrate to PM doc (mounted in jsdom or happy-dom test harness)
  3. Round-trip `serializeEditorState` and `deepEqual` to original (modulo updated_at)
- `scripts/run-migration.sh` — orchestrates: backup → migrate → validate; exit non-zero if any step fails

### 7.2 Atomicity rule

Sequence is non-negotiable:
1. Migration script runs to completion locally (or staging)
2. Validation passes for 100% of files
3. Deploy backend (v3-only) + frontend (v3-only) atomically
4. **No half-migration in production.** Backend with v3-only API + on-disk v2 file = production outage. The migration must finish before the API rolls out.

### 7.3 Backup-on-write (runtime safeguard)

After migration, every `PUT /api/resume/{id}` does:
1. Validate payload (`schema_version === 3`, parsable as `ResumeV3`)
2. If main file `{id}.json` exists, copy it to `{id}.backup.json` (overwrite)
3. Write new content to `{id}.json`

Failure semantics:
- Validation fail → 400, no backup, no main write
- Disk write fail → 500, leave both files unchanged
- Backup write fail → log warning, continue with main write (don't block user save on backup subsystem)

Retention: 1 backup per resume (overwrite on each PUT). The `.v2-backup.json` from initial migration stays as separate "ever rollback to v2" archive — never touched by runtime.

## 8. Single source of truth

- **Persistent SoT:** `saved_sessions/resumes/{id}.json` (v3)
- **Session state:** `EditorView` (PM doc) — may have unsaved diffs vs persistent
- **AI in editor:** reads EditorView (sees latest unsaved state), writes via PM dispatch
- **AI out of editor:** fetches `/api/resume/{id}`, writes via PUT
- **Drift:** if user is editing and external AI fetches, external sees last-saved version (designed and documented behavior)

## 9. AI tools — read/write contract

Replace `useResumeStore.getState().resume!` pattern with one of:

```ts
// In-editor (assistant runs alongside EditorView)
import { useEditorContext } from '...';
const view = useEditorContext();
const resume = serializeEditorState(view.state); // ResumeDocV3
view.dispatch(...) // for writes

// Out-of-editor (no EditorView available)
const resume = await fetchResume(id); // ResumeDocV3
await putResume(id, modifiedResume);
```

`applySuggestion`, `concurrencyCheck`, `SidebarPose`/`BarPose` data accessors all migrate to one of these patterns.

## 10. Test plan

### 10.1 Mandatory test categories

- **Unit — effectiveGid (`effectiveGid.test.ts`):**
  - Empty plain → null
  - Typed plain after section.heading → section gid
  - Typed plain after entry.title/meta → entry gid
  - Typed plain after bullet → entry gid
  - Typed plain after typed plain (chain) → inherits transitively
  - Typed plain after empty plain → null (cascade through empty)
  - Typed plain at doc start → null
  - Empty plain after typed plain → null
  - Cascade: deleting text from middle plain in chain flips downstream typed plains

- **Schema round-trip (`schema/__tests__/v3Roundtrip.test.ts`, NEW):**
  - Hydrate v3 from JSON → editor → serialize back → deepEqual original (modulo updated_at)
  - All row kinds covered including plain, empty plain, typed plain
  - Header, contact lines, alignments, semantic groups all preserved

- **Migration (`tests/migration/`):**
  - Golden fixtures: 5+ representative v2 saved_sessions files (Summary-only, Skills, Experience-heavy, Projects with empty bullets, edge cases like orphan bullets)
  - Each must migrate to v3 + validate + round-trip without data loss
  - Backup file `{id}.v2-backup.json` exists and matches original

- **API (`tests/api/test_resume_v3.py`):**
  - PUT v3 → GET v3 round-trip
  - PUT non-v3 (`schema_version: 2`) → 400
  - PUT invalid v3 → 400, no file change
  - Backup-on-write: existing main → backup created with previous content; first-time PUT → no backup
  - Backup write failure does not block main write

- **AI tools (`frontend/src/components/ai/__tests__/`):**
  - `applySuggestion` operates on PM EditorView (not store)
  - `concurrencyCheck` reads from new source
  - SidebarPose scope label reflects v3 doc state
  - End-to-end: AI suggestion → applied → reflected in editor → saved

- **Print canvas (`PrintCanvasV3.test.tsx` updated):**
  - Hydrates v3 directly (no v2)
  - Empty plain rows render with 1 line height (`\00a0` preserved per existing rule)
  - Typed plain rows with inherited gid render in correct entry visual area

### 10.2 Coverage gates
- All deleted v2 tests have v3 equivalents OR explicit "no longer applicable" entries in spec
- Migration script has a "every fixture passes" CI gate before deployment

## 11. Implementation phases

The plan (separate doc) will break this into phases. High level:

- **Phase 0 — Prep:** Pydantic ResumeV3 backend models. Tests for v3 schema. Effective-gid helper + tests.
- **Phase 1 — Migration:** Migration + validation scripts + golden fixtures + dry-run on actual saved_sessions.
- **Phase 2 — Backend cutover:** API endpoints to v3-only. Backup-on-write. Tests.
- **Phase 3 — Frontend cutover:** Hydrate paths use v3 directly. Delete v2Adapter. Editor + print.
- **Phase 4 — AI rewire:** Delete useResumeStore. Refactor AI tools to use EditorView/fetch.
- **Phase 5 — Sweep:** Delete v2/ dir, html_renderer.py, Streamlit. Update all imports. Final test pass.

Each phase has a checkpoint where the system must be runnable + tests green before advancing.

## 12. Risks

- **Migration script bug → corrupts data.** Mitigated by `.v2-backup.json` archive and validation step before deploy.
- **AI tool refactor changes user-visible AI behavior.** Mitigated by AI test suite + manual smoke test of common flows (rewrite bullet, apply suggestion, scope highlight).
- **Effective-gid recursion cost on large docs.** O(n) worst case; resume docs are <200 rows. Acceptable. Memoize per-render-pass if measured slow.
- **Streamlit deletion breaks unforeseen consumer.** Mitigated by hard commit from user that Streamlit is archived in a separate branch; no production dependency.

## 13. Acceptance criteria

- All `saved_sessions/resumes/*.json` are `schema_version: 3`. No v2 files in repo.
- `git grep -E "ResumeV2|v2Adapter|useResumeStore|html_renderer|streamlit"` returns 0 hits in production code.
- Editor: open, edit, save, reload — content preserved, no shape drift.
- Print/PDF: identical visual output for fixtures across migration boundary.
- AI: rewrite bullet, apply suggestion, scope sync — all work on v3 doc.
- Test suite: all green; new effectiveGid + round-trip + migration + API tests added.
- Backup file created on every PUT; restoring from backup yields previous state.
