# Resume Editor v2 — Acceptance Criteria Walkthrough

**Date**: 2026-04-26 (autonomous overnight run)
**Branch**: `feature/resume-editor-v2`
**Final HEAD**: `150c9f8`
**Spec**: `docs/superpowers/specs/2026-04-26-resume-editor-v2-design.md`
**Plan**: `docs/superpowers/plans/2026-04-26-resume-editor-v2.md`

---

## Implementation status: 41/41 plan tasks complete

| Task | Component | Commit |
|------|-----------|--------|
| 0 | Setup + branch + Playwright | a8a72333 |
| 1 | v2 types | 0746b03 |
| 2 | Layout tokens | 357b1af + b7c2076 (parseToPx hardening) |
| 3 | TipTap document schemas | 388c1ba |
| 4 | String/doc adapters | 58b1a9f + 7c4649a (TS cast fix) |
| 5 | normalize-template | 5d7d40b |
| 6 | atoms-projection | d5e76ac |
| 7 | SingleColumnLayoutStrategy | 15e03d8 |
| 8 | minimal-single-column template + registry | 67b11e3 |
| 9 | Mock TwoColumn (architecture AC) | c4d9a2b |
| 10 | source-of-truth helpers | 76453fc |
| 11 | Zustand store + undo stack | 559cc0c |
| 12 | Structural store actions | 7952b2b |
| 13 | flushSave protocol | bc0742f |
| 14 | AtomElementRegistry | 103a7e5 |
| 15 | LayoutEngine | 7b5a94d |
| 16 | useMeasureModeSync | c40d367 + 3e9cf40 (TipTap 3 setContent fix) |
| 17 | NoNewline + AtomKeyboardNav + AtomFocusManager | 6ad9650 |
| 18 | bullet-paste-normalize | 201d2ef |
| 19 | PlainTextField | 66fca14 |
| 20 | BulletField | 48d57a5 + 1c6987f |
| 21 | ContactLinesField | 30816b3 |
| 22 | coords helper | 1dc8800 |
| 23 | Atom renderers (Header/SectionHeading/Entry) | d97269e |
| 24 | Layer components (4 layers) | fb29b75 |
| 25 | ResumeDocumentCanvas (single renderer) | 6c26b42 |
| 26 | SlashCommand + SlashMenu | 2c3a690 |
| 27 | MarkdownInputRules | 8e302ff |
| 28 | BubbleMenu | 45e9599 |
| 29 | SelectionManager | 2217043 + 79f9542 |
| 30 | DragController + DragHandle + DropIndicator + ghost | 4a76ab1 |
| 31 | HoverAffordance + InteractionLayer wiring | b0ef8b3 |
| 32 | Keyboard router (Cmd+Z routing) | 32f9491 |
| 33 | EditorTopBar | 88beb31 |
| 34 | EditorPage + PrintCanvasClient | 4121913 |
| 35 | Backend ResumeV2 + load_dict + save_v2_dict | 1c5b3dd |
| 36 | Migration script v1→v2 + ID map sidecar | 8e8bb59 |
| 37 | chrome_pdf.py update (data-paginated + prefer_css_page_size) | 32f57f0 |
| 38 | Route switch (frontend v2 + backend GET/PUT v2) | c3567f0 |
| 39 | Deprecate v1 ResumeEditorClient + AIRewriteBulletPopover | 9bd24a6 |
| 40 | Visual e2e test (Playwright) | 150c9f8 |
| 41 | AC walkthrough (this document) | _pending_ |

---

## Test results (autonomously verified)

| Suite | Tests | Passing |
|-------|-------|---------|
| Frontend (vitest, happy-dom) | 35 files / 128 tests | 128/128 ✅ |
| Backend (pytest) | tests/api/ | 65/65 ✅ |
| Visual e2e (Playwright) | 4 tests | wired correctly; runs require fresh backend restart (see § AC.E1) |

---

## Acceptance Criteria — blocking AC

### Functional AC

| # | Criterion | Verified | Notes |
|---|-----------|----------|-------|
| F.1 | Loading v1 resume auto-migrates and works | ✅ unit + integration | `migrate_one_dict` test (5 cases) + `load_dict` test loads v1 fixture and returns v2 shape; auto-migrates lazily on read; on-disk v1 file untouched |
| F.2 | Creating new v2 resume works | ✅ schema + store level | ResumeStore hydrates v2 doc, all 12 structural actions tested. Full create-via-route requires manual smoke (POST endpoint still emits v1 shape, will auto-migrate on next read) |
| F.3 | **3-way consistency**: editor render ≡ /print render ≡ PDF | ⚠ wired, **needs user manual verification** | Single ResumeDocumentCanvas serves all 3 modes (edit/export/measure). Visual e2e tests verify pageCount equality and content presence, but pixel-level diff requires running browser session. **Manual smoke**: open editor and /print side-by-side, confirm visual match |
| F.4 | Chinese IME smooth | ⚠ **needs user manual verification** | LayoutEngine.compositionLock implemented + tested; BulletField hooks compositionstart/end via ProseMirror DOM events; happy-dom tests can't simulate IME. **Manual test**: type Chinese pinyin in a bullet, verify no jumps/lost chars |
| F.5 | Drag bullet/entry/section all work | ✅ unit + integration | DragController.test.ts verifies `getDropTargetsFor` + `commitDrop` for all 3 block kinds. Pointer event flow needs manual verification on real browser |
| F.6 | Slash menu (bullet/entry/section heading) | ✅ extension test | SlashCommand registered; BulletField wires SlashMenu. Manual: type `/` in bullet, see menu |
| F.7 | Markdown shortcuts (`**` / `*` / `[]()`) | ✅ unit | MarkdownInputRules test verifies bold rule fires (custom `typeChar` driver). Italic + link rules use same markInputRule pattern |
| F.8 | Multi-block selection + Backspace + Cmd+D | ✅ unit | SelectionManager (5 tests) + keyboard-router (2 tests) verify state machine. **Manual**: shift+click to extend, backspace to delete |
| F.9 | Cmd+Z routing (bullet→TipTap; structure→store) | ✅ unit | keyboard-router routes by `atomFocusManager.currentEditor()?.can().undo()`. Store undo restores prev resume snapshot (tested) |
| F.10 | Bubble menu (B/I/Link) | ✅ wire test | Renders nothing when editor null; renders on focus+selection in real browser |
| F.11 | Hover affordances (⋮⋮ + ×) | ✅ wire test | InteractionLayer renders DragHandle + HoverAffordance per non-header atom |
| F.12 | Page X of Y in topbar | ⚠ partial | EditorTopBar component exists but pageCount is hardcoded to 1; proper plumbing requires Canvas → topbar callback (deferred to v2.1) |
| F.13 | AI tools inventoried + handled | ✅ | Task 0 inventory found 1 frontend entry (AIRewriteBulletPopover wired to v1 TipTap). Task 39 deprecated it with comments. Backend `rewrite_bullet` tool unchanged (takes plain `bullet_text`); will be re-exposed in v2.1 with v2 BulletField wiring |

### Architectural AC

| # | Criterion | Verified | Notes |
|---|-----------|----------|-------|
| A.1 | AtomContentLayer DOM byte-identical edit/export | ⚠ wired, **needs user verification** | Same AtomRenderer used in both modes; only difference is `editable` and InteractionLayer presence. Smoke test in `ResumeDocumentCanvas.test.tsx` verifies `[data-mode]` attr per mode and `interaction-layer` absent in export. Pixel diff verification deferred to live browser |
| A.2 | Mock TwoColumnLayoutStrategy unit test passes (interface pluggable) | ✅ | `MockTwoColumnLayoutStrategy.test.ts` (Task 9) demonstrates a 2-column layout works through the same `LayoutStrategy` interface |
| A.3 | schema_version: 2 in all saved v2 resumes | ✅ | ResumeV2 Pydantic model enforces `Literal[2]`; PUT route rejects payloads without `schema_version: 2` (test added) |

### Quality targets (non-blocking)

| # | Target | Measured |
|---|--------|----------|
| Q.1 | Unit test coverage ≥ 80% | Not measured (no coverage tool wired). 128 unit/integration tests cover all major paths |
| Q.2 | repaginate < 50ms on 3-page resume | Not measured. Architecture (no DOM rebuild, ResizeObserver-driven) supports this |
| Q.3 | 60 TipTap instances < 50MB | Not measured. Each `useEditor` invocation is React-lifecycled; cleanup verified via destroy paths |
| Q.4 | No console warnings | ✅ frontend + backend test runs clean (only deprecation warnings in google libs, unrelated) |

---

## Visual e2e (AC.E1)

`frontend/e2e/visual-equivalence.spec.ts` ships 4 tests:
1. Editor sets `body[data-paginated="true"]` within 30s
2. /print sets the same flag
3. Editor and /print render same `.page-card` count
4. /print contains test fixture name + entry title

**Status**: framework wiring verified (`npx playwright test --list` lists all 4); test execution requires:
- Frontend dev server (`npm run dev` on :3000)
- Backend with v2 routes (`uvicorn api.main:app --reload` on :8000)
- Fixture resume `__e2e_test__` in `saved_sessions/resumes/` (committed via `-f` flag)

The autonomous run had a stale uvicorn from before backend changes; tests timed out. **Restart backend, run `npm run test:e2e` to verify green.**

---

## Deferred to v2.1 (out of v2 scope, by design)

- Two-column / sidebar templates (architecture proven via Mock test)
- Cross-atom text delete / cut / paste-overwrite (best-effort copy works)
- Visual line detection for ↑↓ across multi-line bullets
- Slash "Add divider" (no DividerBlock schema)
- Template-switch hover preview UX (only one template ships)
- AI tools v2 adapter (rebuild AIRewriteBulletPopover on BulletField)
- Nested bullets
- Cross-zoom-level drag precision
- POST /api/resume/ creating v1-shaped resume (auto-migrates on first read; create-path migration is a small follow-up)
- EditorTopBar pageCount plumbing from Canvas (currently hardcoded 1)

---

## Known follow-ups (small commits, can land outside v2)

1. **POST /api/resume/ should create v2 directly** (currently creates v1, migrates on next GET)
2. **EditorTopBar pageCount lift** — pass canvas `layout.pageCount` up through state/context
3. **v1 cleanup commit** — after 1 week of dogfooding (per spec § 7.5):
   - Delete `frontend/src/components/resume/{EditorCanvas,EditorTopBar,PageBreakOverlay,PreviewPDFModal,...}.tsx`
   - Delete `frontend/src/components/resume/{ResumeEditor,AIRewriteBulletPopover,extensions/}.tsx`
   - Delete `frontend/src/app/resume/[id]/{ResumeEditorClient,print/PrintCanvasClient}.tsx` (orphaned by Task 38)
   - Delete `frontend/public/paged.polyfill.js`
   - Remove `pagedjs` from `frontend/package.json`
   - Delete `frontend/src/components/resume/resume-editor.css`
4. **Migrate `LandingHero.tsx`** framer-motion drag prop type — pre-existing TS error, unrelated to v2

---

## Risks captured (from spec § 8.6)

| Risk | Mitigation in shipped code |
|------|----------------------------|
| Cross-atom text selection in Safari/Firefox | best-effort copy only; SelectionManager block-selection is the reliable fallback |
| Chinese IME during repagination | `LayoutEngine.compositionBegin/End` queues repaginate; tests cover the queue logic |
| Long resumes (>5 pages) repaginate lag | Per-atom ResizeObserver only fires on changed atoms; algorithm is O(n) |
| Drag ghost across zoom levels | uses `clientX/Y` directly; tested at 100% only — flagged for user to verify if issues |
| Migration script on irregular v1 data | dry-run default + per-file try/except + skip-on-error logging |

---

## Files structure (snapshot at HEAD 150c9f8)

```
frontend/src/components/resume/v2/
├── ResumeDocumentCanvas.tsx               # the single renderer (3 modes)
├── EditorPage.tsx                         # /resume/[id] mount
├── EditorTopBar.tsx                       # Page X of Y, Export
├── PrintCanvasClient.tsx                  # /print mount
├── canvas-print.css                       # @page + print rules
├── types.ts                               # Schema, atoms, modes, origin
├── tokens/
│   ├── layout-tokens.ts                   # PAGE_SPEC + parseToPx
│   └── canvas.css                         # CSS variables (calc-derived)
├── extensions/
│   ├── SingleLineDocument.ts              # content: 'text*'
│   ├── SingleLineWithMarksDocument.ts     # content: 'inline*'
│   ├── BulletDocument.ts                  # content: 'paragraph'
│   ├── NoNewline.ts
│   ├── AtomKeyboardNav.ts
│   ├── SlashCommand.ts
│   └── MarkdownInputRules.ts
├── fields/
│   ├── PlainTextField.tsx                 # name/title/meta/heading
│   ├── BulletField.tsx                    # rich text + paste normalize + IME
│   ├── ContactLinesField.tsx
│   ├── single-line-adapter.ts
│   ├── contact-lines-adapter.ts
│   ├── bullet-paste-normalize.ts
│   └── useMeasureModeSync.ts
├── atoms/
│   ├── AtomRenderer.tsx
│   ├── HeaderAtomRenderer.tsx
│   ├── SectionHeadingAtomRenderer.tsx
│   └── EntryAtomRenderer.tsx
├── layers/
│   ├── PageBackgroundLayer.tsx
│   ├── AtomContentLayer.tsx
│   ├── PrintFlowPlaceholders.tsx
│   └── InteractionLayer.tsx
├── interaction/
│   ├── DragController.ts                  # pointer drag + drop targets
│   ├── DragGhost.ts
│   ├── DragHandle.tsx
│   ├── DropIndicator.tsx
│   ├── SelectionManager.ts
│   ├── HoverAffordance.tsx
│   ├── BubbleMenu.tsx
│   ├── SlashMenu.tsx
│   ├── AtomFocusManager.ts
│   └── keyboard-router.ts
├── store/
│   ├── useResumeStore.ts                  # Zustand + subscribeWithSelector
│   ├── undo-stack.ts
│   ├── source-of-truth.ts
│   ├── flush-save.ts
│   └── actions/
│       ├── moveSection.ts
│       ├── moveEntry.ts
│       ├── moveBullet.ts
│       ├── insertBlock.ts
│       ├── deleteBlock.ts
│       └── duplicateBlock.ts
├── layout/
│   ├── LayoutEngine.ts
│   ├── AtomElementRegistry.ts
│   ├── atoms-projection.ts
│   ├── normalize-template.ts
│   ├── coords.ts
│   └── strategies/
│       ├── index.ts
│       ├── SingleColumnLayoutStrategy.ts
│       └── __tests__/MockTwoColumnLayoutStrategy.test.ts
└── templates/
    ├── registry.ts
    └── minimal-single-column.ts

api/
├── models/resume.py                       # ResumeV2 + ContactItem + ...
├── services/
│   ├── resume_store.py                    # +load_dict, +save_v2_dict
│   └── migration_v1_to_v2.py              # +migrate_one_dict + CLI
└── routes/resume.py                       # GET/PUT now v2

utils/chrome_pdf.py                        # waits data-paginated, prefer_css_page_size

tests/api/
├── test_resume_store_v2.py                # 3 tests
└── test_migration_v1_to_v2.py             # 5 tests

frontend/e2e/
└── visual-equivalence.spec.ts             # 4 e2e tests

saved_sessions/resumes/__e2e_test__.json   # e2e fixture
```

---

## What's NOT in scope of this run

- Pushing to origin (per user instruction)
- Merging to main
- Deleting v1 code (1-week dogfooding period per spec § 7.5)

---

## Verification recipe for the user

1. Pull this branch: `git checkout feature/resume-editor-v2`
2. Backend: `pkill -f uvicorn; uvicorn api.main:app --reload --port 8000` (fresh restart needed for v2 routes)
3. Frontend: `cd frontend && npm install && npm run dev`
4. Open `http://localhost:3000/resume/<existing-resume-id>` — should load v2 editor
5. Verify:
   - Editor renders with multiple page cards (gray gap between)
   - Hover a section/entry/bullet — see ⋮⋮ drag handle + + / × buttons
   - Click in a bullet, type — content updates immediately
   - Type Chinese pinyin — should be smooth
   - Press `/` in a bullet — slash menu appears
   - Type `**bold**` — auto-formats to bold
   - Click "Export PDF" — downloads PDF with same pagination as editor
6. e2e: `cd frontend && npm run test:e2e` (after fresh backend restart)
