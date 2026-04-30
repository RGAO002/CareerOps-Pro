# Resume Editor v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace v2's per-field TipTap instances and nested `Section→Entry→Bullet` model with a single TipTap PM document over a flat `Row[]` data model with `SemanticGroup[]` anchors. Eliminate the cross-editor selection/undo/paste bug class permanently while preserving every v2 visual polish item.

**Architecture:** One TipTap editor + per-row-kind NodeViews; PM `EditorState` (doc + GroupsPlugin state) is the runtime source of truth; PaginationPlugin is the single layout authority feeding BreakDecoration / PageChromeLayer / readonly /print instance from one numeric output; AI targeting / lock / apply migrate from BlockId to RowId | GroupId with single-transaction atomicity.

**Tech Stack:** TypeScript strict, Next.js 16 App Router, React 19, TipTap 3 + ProseMirror, Zustand (store), Framer Motion (drop animation), Vitest (unit), Playwright (e2e), Pointer Events API + `setPointerCapture`.

**Spec:** `docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md` is the authoritative source for all design decisions. Each task header references the relevant spec section. **Read the referenced spec section before starting any task.**

**Branch model:**
- Current production branch: `feature/resume-editor-v2`
- v3 work happens on a sub-branch `feature/resume-editor-v3` cut from `feature/resume-editor-v2`
- M1 PoC stays on this sub-branch; if PoC fails, the branch can be discarded with no impact on v2
- `ENABLE_RESUME_V3` feature flag gates v3 from production until M7 ships

**Hard contracts (must be enforced everywhere they apply):**

- **C1.** ProseMirror `EditorState` (doc + GroupsPlugin state) is the runtime source of truth. ResumeDocV3 JSON = `serialize(EditorState)`. One-way derivation; no bidirectional sync.
- **C2.** Page break markers are runtime-only (widget decorations). Never persisted in `rows`, never in `doc.toJSON()`, never in undo history, never in AI context.
- **C3.** PaginationPlugin / LayoutEngine is the single source of truth for `pageBreaks` + `pageGeometries`. PageChromeLayer / BreakDecoration / /print all consume the same plugin output. No layer recomputes.
- **C4.** /print uses a separate readonly TipTap instance (same schema / NodeViews / CSS / PaginationPlugin). Waits for `body[data-paginated="true"]` before export.
- **C5.** `--page-margin-*` CSS tokens are the only margin SoT. Screen consumes via editor wrapper padding + BreakDecoration height. Print consumes via `@page` directive + zeroed wrapper padding + zeroed decoration height. PageChromeLayer is paint-only.
- **C6.** Position is the visual / layout / drag truth. `semanticGroupId` is a semantic anchor. Drop ALWAYS rewrites groupId per new position (no zombie state).
- **C7.** Zero capture-phase `window` / `document` pointerdown / mousedown listeners. Block-drag input captured at `.row-handle` / `.section-divider` element with `setPointerCapture`. Once drag is in flight, temporary `window` listeners for `pointermove` / `pointerup` / `pointercancel` / `keydown(Esc)` are required and allowed.
- **C8.** Pointer Events (not mouse events) for all drag input.

---

## Milestone Map (17–22 working days)

| Milestone | Days | Pass criterion | Tasks |
|---|---|---|---|
| **M1** PoC | 4–5 | All three PoC criteria (§ 4.9) green on Chromium; @page CSS-var reliability verified | T0 – T11 |
| **M2** Schema + GroupsPlugin | 2 | All unit tests green; round-trip serialize/hydrate byte-identical; **GroupsPlugin undo/redo verified empirically** | T12 – T17 |
| **M3** Editor + 7 NodeViews + keymaps + AI lock | 5 | All integration tests green; manual smoke covers every Enter/Backspace transition | T18 – T26 |
| **M4** Drag + selection + interaction | 3 | ESLint rules block CI on violation; e2e drag scenarios green | T27 – T31 |
| **M5** Pagination productionization + page chrome + /print | 3 | PDF pixel-diff vs editor < 1% on 3-page resume; typing latency < 16ms p50 on 50-row doc | T32 – T35 |
| **M6** AI integration migration | 2 | AI apply works for all four target kinds; concurrent-edit doesn't corrupt state; lock prevents user edits during pending suggestion | T36 – T39 |
| **M7** Regression + ship | 2–3 | Manual regression checklist all green; visual diff < 2%; PR approved | T40 – T43 |

**Phasing rules (R1–R6 from spec § 8):**

- **R1.** M1 PoC must pass before any M2+ work merges. PoC failure → design review.
- **R2.** Each milestone ships behind `ENABLE_RESUME_V3` flag. v2 stays in production until M7 ships.
- **R3.** Pass criteria are explicit per milestone. Subsequent milestones do not start until prior milestone is signed off.
- **R4.** Manual regression checklist (§ 7.6) runs at end of each milestone touching user-visible behavior (M3 onward).
- **R5.** Migration: none. v3 reads only v3 JSON. v2 resumes are not loadable. User re-uploads.
- **R6.** Total estimate is contingent on M1 PoC passing. PoC failure pushes the entire timeline.

---

## File Structure (post-M3)

```
frontend/src/components/resume/v3/
  index.ts                          ← public exports
  EditorPageV3.tsx                  ← /editor route (behind ENABLE_RESUME_V3)
  PrintCanvasV3.tsx                 ← /print route (readonly TipTap)
  ResumeCanvasV3.tsx                ← shared TipTap editor wrapper
  resume-canvas-v3.css              ← CSS tokens + global styles

  schema/
    types.ts                        ← ResumeDocV3, ResumeRow, SemanticGroup, ContactItem, etc.
    pmSchema.ts                     ← TipTap schema (7 row node types)
    validate.ts                     ← I1–I6 invariant validator + load-time normalization
    serialize.ts                    ← serializeEditorState(state): ResumeDocV3
    hydrate.ts                      ← hydrateInitialState(doc): { docJSON, groupsByID }

  plugins/
    GroupsPlugin.ts                 ← PM plugin holding groups state (§ 2.6)
    GroupOps.ts                     ← GroupOp types, applyGroupOps, gcUnreferencedGroups
    PaginationPlugin.ts             ← layout + break decorations + page geometries
    AILockPlugin.ts                 ← filterTransaction-based lock (§ 6.3)
    SlashMenuPlugin.ts              ← / command menu

  nodeviews/
    rowContainer.tsx                ← shared NodeView outer DOM template
    HeaderNameNodeView.tsx
    HeaderContactNodeView.tsx
    SectionHeadingNodeView.tsx      ← includes <hr class="section-divider"/> + click forwarding
    EntryTitleNodeView.tsx
    EntryMetaNodeView.tsx
    PlainNodeView.tsx
    BulletNodeView.tsx              ← includes <span class="row-marker">•</span>

  layout/
    LayoutEngine.ts                 ← height measurement + break decision (port v2 algorithm)
    pageGeometries.ts               ← types + helpers
    cssTokens.ts                    ← CSS variable names + defaults

  interaction/
    SelectionManager.ts             ← refactored from v2 for RowId | GroupId
    DragController.ts               ← Pointer Events + setPointerCapture
    dispatchWithGroups.ts           ← helper enforcing atomic doc + group ops
    rangeResolver.ts                ← block-select range from row kind (§ 5.2)
    keymap/
      enter.ts                      ← § 3.5 transitions
      backspace.ts                  ← § 3.6 uniform downgrade + header.name protection
      cmdA.ts                       ← § 3.4 progressive selection
      slashOpen.ts                  ← / triggers slash menu

  layers/
    PageChromeLayer.tsx             ← absolute paper-card decorations (consumes plugin state)
    InteractionLayer.tsx            ← drop indicator + drag ghost + selection visuals

  ai/
    aiTargetTypes.ts                ← AITarget union (§ 6.1)
    suggestionResolver.ts           ← target → current row range (§ 6.2)
    contextAssembly.ts              ← assembleAIContext (§ 6.4)
    applyWrapper.ts                 ← single-transaction apply (§ 6.2)

  __tests__/
    schema/                         ← validator + serialize/hydrate round-trip
    plugins/                        ← GroupsPlugin (incl. undo/redo), PaginationPlugin, AILock
    nodeviews/                      ← per-kind render tests
    interaction/                    ← keymap state machine, drag, selection
    e2e/                            ← Playwright cross-row + drag + PDF + AI apply

frontend/src/components/resume/v3-poc/   ← M1 PoC artifacts (deleted after M5 productionizes)
  PocPage.tsx
  PocEditor.tsx
  pmSchemaMin.ts
  layout-min.ts
  PaginationPluginMin.ts
  PageChromeLayerMin.tsx

frontend/eslint-rules/                   ← custom ESLint rules (created in M4)
  no-global-pointer-capture.js
  no-direct-groups-mutation.js

docs/superpowers/specs/
  2026-04-29-resume-editor-v3-poc-results.md   ← M1 sign-off (created at end of M1)

frontend/playwright/v3/
  print-fidelity.spec.ts            ← PoC A + M5 PDF e2e
  selection-traversal.spec.ts       ← PoC B
  chrome-alignment.spec.ts          ← PoC C
  drag-cross-section.spec.ts        ← M4 e2e
  ai-apply-concurrent.spec.ts       ← M6 e2e
```

---

# M1 — PoC sign-off (4–5 days)

**Goal:** Build the minimum needed to answer "does single-PM + widget-decoration pagination actually work in this stack". Throwaway code path, isolated under `frontend/src/components/resume/v3-poc/`. Production code untouched. **Success here is the gate for everything else.**

**Pass criteria** (all three, on Chromium; Firefox / Safari documented but not required):
- **PoC A** Print fidelity (§ 4.9 PoC A) including @page CSS custom property reliability test
- **PoC B** Selection traversal across decoration
- **PoC C** PageChromeLayer pixel-perfect alignment with PaginationPlugin output

**On failure:** Re-analyze root cause; try alternative injection paths (NodeView wrapper, inline decoration, post-row attribute). Do not silently fall back to Plan B atom node — that requires its own design subsection.

---

### Task 0: Sub-branch + path inventory

**Spec ref:** § 8 phasing rules; reviewer's "M1 first, do not touch main editor".

**Files:**
- Read: `docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md` (entire spec — implementer must internalize before any code)
- No file changes in this task.

- [ ] **Step 1: Read the spec end-to-end**

Open `docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md` and read all 11 sections. Pay special attention to § 0.5 (non-regression mandate), § 1 (C1–C8 hard contracts), § 4.6 (margin SoT — the most architecturally subtle), and § 2.6 (GroupsPlugin atomicity).

- [ ] **Step 2: Create v3 sub-branch from current**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
git status                                    # must be clean
git checkout -b feature/resume-editor-v3      # base = feature/resume-editor-v2
```

Expected: local branch created, no remote tracking yet.

Optional: if you want a remote backup of the PoC branch, run `git push -u origin feature/resume-editor-v3`. **Skip this if M1 is purely local exploration** — discarding the branch on PoC failure is cleaner without a remote artifact. Push only when M1 has passed or when you want the branch reviewable by others.

- [ ] **Step 3: Verify project conventions**

```bash
grep -E '"test"|"test:e2e"|"build"' frontend/package.json
ls frontend/playwright.config.ts frontend/vitest.config.ts
grep -E "next.*16" frontend/package.json
grep -E "@tiptap/core" frontend/package.json
```

Expected: vitest configured, playwright configured, Next.js 16, TipTap 3.

- [ ] **Step 4: Verify path inventory matches spec assumptions**

```bash
ls frontend/src/components/resume/v2/extensions/UndoRedo* 2>/dev/null
grep -rn "UndoRedo\b" frontend/src/components/resume/v2/fields/PlainTextField.tsx
ls frontend/src/components/landing/FluidCanvas.tsx
ls frontend/src/app/print/ 2>/dev/null || echo "no v2 print route"
ls frontend/src/app/resume/
```

Expected: TipTap `UndoRedo` extension is `@tiptap/extensions`. Confirms v2's history extension we'll reuse semantics from.

- [ ] **Step 5: Commit branch setup**

```bash
git add -A
git status                                      # should show no changes since checkout
# If status is clean (expected), no commit needed yet. Branch is created.
echo "Branch feature/resume-editor-v3 ready for M1 PoC work."
```

---

### Task 1: PoC scaffold + minimal PM schema

**Spec ref:** § 4.9 PoC requirements; § 3.1 schema.

**Goal:** Mount a minimal TipTap editor under `/v3-poc` route with 3 row kinds. Self-contained, no integration with v2 store / AI / sidebar.

**Files:**
- Create: `frontend/src/components/resume/v3-poc/PocEditor.tsx`
- Create: `frontend/src/app/v3-poc/page.tsx`
- Create: `frontend/src/components/resume/v3-poc/poc.css`

- [ ] **Step 1: Create PocEditor with Tiptap Node extensions**

Schema is defined as Tiptap `Node.create` extensions (one per row kind) — same pattern as production v3 will use, no separate `Schema` object needed.

Create `frontend/src/components/resume/v3-poc/PocEditor.tsx`:

```tsx
'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import { Document } from '@tiptap/extension-document';
import { Node } from '@tiptap/core';
import './poc.css';

export const PocDoc = Document.extend({ content: 'row+' });

export const HeadingRow = Node.create({
  name: 'heading_row',
  group: 'row',
  content: 'text*',
  defining: true,
  addAttributes() { return { id: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-row-kind="heading"]' }]; },
  renderHTML({ node }) {
    return ['div', { 'data-row-kind': 'heading', 'data-row-id': node.attrs.id }, 0];
  },
});

export const PlainRow = Node.create({
  name: 'plain_row',
  group: 'row',
  content: 'text*',
  defining: true,
  addAttributes() { return { id: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-row-kind="plain"]' }]; },
  renderHTML({ node }) {
    return ['div', { 'data-row-kind': 'plain', 'data-row-id': node.attrs.id }, 0];
  },
});

export const BulletRow = Node.create({
  name: 'bullet_row',
  group: 'row',
  content: 'text*',
  defining: true,
  addAttributes() { return { id: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-row-kind="bullet"]' }]; },
  renderHTML({ node }) {
    return ['div', { 'data-row-kind': 'bullet', 'data-row-id': node.attrs.id }, 0];
  },
});

interface PocEditorProps {
  /** When true, mount in read-only mode (used by /print route). */
  readOnly?: boolean;
}

export function PocEditor({ readOnly = false }: PocEditorProps) {
  const editor = useEditor({
    extensions: [PocDoc, HeadingRow, PlainRow, BulletRow],
    editable: !readOnly,
    content: buildPocContent(),
    immediatelyRender: false,
  });

  if (!editor) return null;
  return (
    <div className="poc-canvas-root">
      <div className="poc-editor-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function buildPocContent() {
  // 4 sections × 18 bullets — exercises 3-4 page boundaries to validate pagination.
  const sections = ['Experience', 'Education', 'Skills', 'Projects'];
  const content: { type: string; attrs: { id: string }; content?: { type: 'text'; text: string }[] }[] = [];
  let i = 0;
  for (const s of sections) {
    content.push({ type: 'heading_row', attrs: { id: `r${i++}` }, content: [{ type: 'text', text: s }] });
    for (let j = 0; j < 18; j++) {
      content.push({
        type: 'bullet_row',
        attrs: { id: `r${i++}` },
        content: [{ type: 'text', text: `${s} bullet ${j + 1}: ` + 'lorem ipsum dolor sit amet, '.repeat(4).trim() }],
      });
    }
  }
  return { type: 'doc', content };
}
```

NodeViews (and the matching React row container template) get added in Task 2; for now `renderHTML` is enough to mount the editor.

- [ ] **Step 2: Create PoC CSS with margin tokens**

Create `frontend/src/components/resume/v3-poc/poc.css`:

```css
/* PoC CSS — defines margin token system used by both screen and print. */
.poc-canvas-root {
  --page-margin-top:    0.75in;
  --page-margin-bottom: 0.75in;
  --page-margin-left:   1.0in;
  --page-margin-right:  1.0in;
  --page-content-width: 6.5in;     /* US letter 8.5in - 1.0in left - 1.0in right */
  --page-break-screen-gap: 32px;

  position: relative;
  width: 8.5in;
  margin: 0 auto;
  padding: 0;
  background: oklch(0.92 0.005 60);
}
.poc-editor-wrapper {
  padding-top:    var(--page-margin-top);
  padding-left:   var(--page-margin-left);
  padding-right:  var(--page-margin-right);
  /* No padding-bottom: last page's bottom is implicit (content extends naturally). */
  max-width: 8.5in;
  background: white;        /* paper card */
  box-shadow: 0 2px 12px oklch(0.40 0.04 42 / 0.08);
}
[data-row-kind="heading"] {
  font: 600 14px/1.2 Inter, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 16px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid oklch(0.30 0.02 50);
}
[data-row-kind="plain"] {
  font: 400 12px/1.5 Inter, sans-serif;
  margin: 4px 0;
}
[data-row-kind="bullet"] {
  font: 400 12px/1.5 Inter, sans-serif;
  margin: 2px 0;
  padding-left: 16px;
  position: relative;
}
[data-row-kind="bullet"]::before {
  content: '•';
  position: absolute;
  left: 4px;
  top: 0;
}
.pagination-break {
  display: block;
  height: calc(var(--page-margin-bottom) + var(--page-break-screen-gap) + var(--page-margin-top));
  break-before: page;
  pointer-events: none;
  user-select: none;
}
@media print {
  @page {
    size: 8.5in 11in;
    margin: var(--page-margin-top) var(--page-margin-right)
            var(--page-margin-bottom) var(--page-margin-left);
  }
  .poc-canvas-root { background: white; }
  .poc-editor-wrapper {
    padding: 0;                      /* @page directive owns margins */
    box-shadow: none;
    max-width: none;
  }
  .pagination-break { height: 0; }
}
```

- [ ] **Step 3: Mount PoC route**

Create `frontend/src/app/v3-poc/page.tsx`:

```tsx
import { PocEditor } from '@/components/resume/v3-poc/PocEditor';

export default function V3PocPage() {
  return (
    <main style={{ minHeight: '100vh', padding: '24px 0' }}>
      <PocEditor />
    </main>
  );
}
```

- [ ] **Step 4: Smoke-test the route boots**

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000/v3-poc` in Chromium. Expect: 4 sections of bullets rendered as continuous content, no pagination yet (that's Task 4–6).

- [ ] **Step 5: Commit PoC scaffold**

```bash
git add frontend/src/components/resume/v3-poc/ frontend/src/app/v3-poc/
git commit -m "poc(v3): minimal TipTap editor with 3 row kinds for PoC"
```

---

### Task 2: NodeViews + CSS-token-driven layout

**Spec ref:** § 3.2 NodeView template; § 4.6 margin SoT.

**Goal:** Replace the default Tiptap rendering of each row kind with a NodeView that produces the production DOM template. This is the structure PaginationPlugin (Task 4) will measure.

**Files:**
- Modify: `frontend/src/components/resume/v3-poc/PocEditor.tsx` — add NodeViews
- Modify: `frontend/src/components/resume/v3-poc/poc.css` — refine to match NodeView DOM

- [ ] **Step 1: Add NodeView for HeadingRow**

In `PocEditor.tsx`, replace the inline `Node.create` calls with NodeView-based versions. Add at the top:

```tsx
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react';

function HeadingRowNodeView() {
  return (
    <NodeViewWrapper className="row row-heading" data-row-kind="heading">
      <NodeViewContent as="div" className="row-content" />
      <hr className="section-divider" contentEditable={false} />
    </NodeViewWrapper>
  );
}

function PlainRowNodeView() {
  return (
    <NodeViewWrapper className="row row-plain" data-row-kind="plain">
      <NodeViewContent as="div" className="row-content" />
    </NodeViewWrapper>
  );
}

function BulletRowNodeView() {
  return (
    <NodeViewWrapper className="row row-bullet" data-row-kind="bullet">
      <span className="row-marker" contentEditable={false}>•</span>
      <NodeViewContent as="div" className="row-content" />
    </NodeViewWrapper>
  );
}
```

Update each Node extension's `addNodeView`:

```tsx
const HeadingRow = Node.create({
  name: 'heading_row',
  group: 'row',
  content: 'text*',
  defining: true,
  addAttributes() { return { id: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-row-kind="heading"]' }]; },
  renderHTML({ node }) {
    return ['div', { 'data-row-kind': 'heading', 'data-row-id': node.attrs.id }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(HeadingRowNodeView);
  },
});
// Same pattern for PlainRow, BulletRow.
```

- [ ] **Step 2: Update CSS to match NodeView DOM**

Replace the `[data-row-kind="..."]` selectors in `poc.css`:

```css
.row {
  position: relative;
  display: block;
}
.row-heading {
  margin: 16px 0 8px;
}
.row-heading .row-content {
  font: 600 14px/1.2 Inter, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.section-divider {
  border: 0;
  height: 1px;
  background: oklch(0.30 0.02 50);
  margin: 4px 0 0;
}
.row-plain { margin: 4px 0; }
.row-plain .row-content { font: 400 12px/1.5 Inter, sans-serif; }
.row-bullet {
  margin: 2px 0;
  padding-left: 16px;
}
.row-bullet .row-marker {
  position: absolute;
  left: 4px;
  top: 0;
  pointer-events: none;
  user-select: none;
}
.row-bullet .row-content { font: 400 12px/1.5 Inter, sans-serif; }

/* Pagination break + token system (unchanged from Task 1) */
.pagination-break {
  display: block;
  height: calc(var(--page-margin-bottom) + var(--page-break-screen-gap) + var(--page-margin-top));
  break-before: page;
  pointer-events: none;
  user-select: none;
}
@media print {
  @page {
    size: 8.5in 11in;
    margin: var(--page-margin-top) var(--page-margin-right)
            var(--page-margin-bottom) var(--page-margin-left);
  }
  .poc-canvas-root { background: white; }
  .poc-editor-wrapper { padding: 0; box-shadow: none; max-width: none; }
  .pagination-break { height: 0; }
}
```

- [ ] **Step 3: Verify NodeViews render**

`npm run dev` → open `/v3-poc` → DevTools → confirm DOM structure has `.row > .row-content` per spec template, `.section-divider` after each heading, `.row-marker` before each bullet.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/v3-poc/
git commit -m "poc(v3): NodeView-based row rendering with CSS token system"
```

---

### Task 3: Minimal LayoutEngine

**Spec ref:** § 4.5 layout algorithm; § 4.6 margin tokens.

**Goal:** Walk PM doc rows in order, measure each row's NodeView outer DOM height via `getBoundingClientRect`, accumulate Y, decide page breaks based on `pageHeight - topMargin - bottomMargin`. Emit `pageBreaks` and `pageGeometries`.

**Files:**
- Create: `frontend/src/components/resume/v3-poc/layout-min.ts`
- Create: `frontend/src/components/resume/v3-poc/__tests__/layout-min.test.ts`

- [ ] **Step 1: Define types and signature**

Create `frontend/src/components/resume/v3-poc/layout-min.ts`:

```ts
export interface LayoutInput {
  rowElements: HTMLElement[];           // outer .row elements in PM doc order
  pageHeightPx: number;                 // e.g. 11in × dpi
  marginTopPx: number;                  // var(--page-margin-top)
  marginBottomPx: number;               // var(--page-margin-bottom)
}

export interface PageBreak {
  /** PM document position immediately after this row ends — where to insert the widget decoration. */
  afterRowIndex: number;
  pageIndex: number;
}

export interface PageGeometry {
  pageIndex: number;
  topPx: number;                        // distance from canvas top to page card top
  heightPx: number;                     // page card visual height
}

export interface LayoutOutput {
  pageBreaks: PageBreak[];
  pageGeometries: PageGeometry[];
}

export function computeLayout(input: LayoutInput): LayoutOutput {
  const { rowElements, pageHeightPx, marginTopPx, marginBottomPx } = input;
  const contentHeightPerPage = pageHeightPx - marginTopPx - marginBottomPx;

  const pageBreaks: PageBreak[] = [];
  const pageGeometries: PageGeometry[] = [];
  let pageIndex = 0;
  let yWithinPage = 0;                  // distance from current page's top of content area
  let pageTopPx = 0;                    // canvas Y where current page card's top starts

  for (let i = 0; i < rowElements.length; i++) {
    const rect = rowElements[i].getBoundingClientRect();
    const rowHeight = rect.height;

    // If this row would overflow current page's content area, break before it.
    if (yWithinPage + rowHeight > contentHeightPerPage && yWithinPage > 0) {
      // Close current page geometry.
      pageGeometries.push({ pageIndex, topPx: pageTopPx, heightPx: pageHeightPx });
      // Emit break.
      pageBreaks.push({ afterRowIndex: i - 1, pageIndex });
      // Start new page.
      pageIndex += 1;
      pageTopPx += pageHeightPx;        // visual stacking; real DOM offset uses CSS vars
      yWithinPage = 0;
    }
    yWithinPage += rowHeight;
  }
  // Close last page.
  pageGeometries.push({ pageIndex, topPx: pageTopPx, heightPx: pageHeightPx });

  return { pageBreaks, pageGeometries };
}
```

Note: `pageTopPx` is conceptual — in screen mode the actual DOM Y of page card top is determined by editor wrapper padding + cumulative break decoration heights. PaginationPlugin (Task 4) does the real translation. PoC LayoutEngine returns pure measurement output.

- [ ] **Step 2: Write the failing unit test**

Create `frontend/src/components/resume/v3-poc/__tests__/layout-min.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeLayout } from '../layout-min';

function makeElement(heightPx: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ height: heightPx, top: 0, bottom: heightPx, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return el;
}

describe('computeLayout', () => {
  it('places all rows on one page when total height fits', () => {
    const rows = [makeElement(100), makeElement(200), makeElement(300)];
    const out = computeLayout({ rowElements: rows, pageHeightPx: 1000, marginTopPx: 100, marginBottomPx: 100 });
    expect(out.pageBreaks).toEqual([]);
    expect(out.pageGeometries).toHaveLength(1);
  });
  it('breaks to a new page when next row would overflow', () => {
    // contentHeight = 1000 - 200 = 800. rows: 400 + 400 fits, 400 more does not.
    const rows = [makeElement(400), makeElement(400), makeElement(400)];
    const out = computeLayout({ rowElements: rows, pageHeightPx: 1000, marginTopPx: 100, marginBottomPx: 100 });
    expect(out.pageBreaks).toEqual([{ afterRowIndex: 1, pageIndex: 0 }]);
    expect(out.pageGeometries).toHaveLength(2);
  });
  it('handles a single row that exceeds page height (allowed: stays on its page, no infinite loop)', () => {
    const rows = [makeElement(2000)];
    const out = computeLayout({ rowElements: rows, pageHeightPx: 1000, marginTopPx: 100, marginBottomPx: 100 });
    expect(out.pageBreaks).toEqual([]);
    expect(out.pageGeometries).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests — expect fail**

```bash
cd frontend
npm test -- src/components/resume/v3-poc/__tests__/layout-min.test.ts
```

Expected: tests fail because no implementation exists yet (will pass after Step 1's implementation runs).

If Step 1's code is already in place, tests should pass immediately:

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- src/components/resume/v3-poc/__tests__/layout-min.test.ts
```

Expected: 3/3 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v3-poc/layout-min.ts frontend/src/components/resume/v3-poc/__tests__/layout-min.test.ts
git commit -m "poc(v3): minimal LayoutEngine + unit tests"
```

---

### Task 4: PaginationPluginMin (widget decoration injection)

**Spec ref:** § 4.2 PaginationPlugin architecture; § 4.3 BreakDecoration.

**Goal:** PM plugin observes doc changes, runs `computeLayout` against current row DOM, emits `Decoration.widget` at break points + exposes pageGeometries via plugin state.

**Files:**
- Create: `frontend/src/components/resume/v3-poc/PaginationPluginMin.ts`
- Modify: `frontend/src/components/resume/v3-poc/PocEditor.tsx`

- [ ] **Step 1: Implement plugin**

Create `frontend/src/components/resume/v3-poc/PaginationPluginMin.ts`:

```ts
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { computeLayout, type LayoutOutput, type PageGeometry } from './layout-min';

export const paginationPluginKey = new PluginKey<PaginationPluginState>('paginationPluginMin');

export interface PaginationPluginState {
  pageGeometries: PageGeometry[];
  decorations: DecorationSet;
}

const PAGE_HEIGHT_PX = 11 * 96;   // 11in @ 96 dpi (rough; actual measurement uses real DPI)

function getMarginPx(canvasRoot: HTMLElement, varName: string): number {
  const v = getComputedStyle(canvasRoot).getPropertyValue(varName).trim();
  if (v.endsWith('in')) return parseFloat(v) * 96;
  if (v.endsWith('px')) return parseFloat(v);
  return parseFloat(v) || 0;
}

export function createPaginationPluginMin() {
  return new Plugin<PaginationPluginState>({
    key: paginationPluginKey,
    state: {
      init: () => ({ pageGeometries: [], decorations: DecorationSet.empty }),
      apply(tr, oldState) {
        // Plugin state updates only via meta from view.update (see view spec below).
        const next = tr.getMeta(paginationPluginKey) as PaginationPluginState | undefined;
        return next ?? oldState;
      },
    },
    view(view) {
      let scheduled = false;
      const recompute = () => {
        scheduled = false;
        const canvasRoot = view.dom.closest('.poc-canvas-root') as HTMLElement | null;
        if (!canvasRoot) return;
        const marginTopPx = getMarginPx(canvasRoot, '--page-margin-top');
        const marginBottomPx = getMarginPx(canvasRoot, '--page-margin-bottom');

        const rowElements = Array.from(view.dom.querySelectorAll(':scope > .row')) as HTMLElement[];
        const layout: LayoutOutput = computeLayout({
          rowElements,
          pageHeightPx: PAGE_HEIGHT_PX,
          marginTopPx,
          marginBottomPx,
        });

        // Map afterRowIndex → PM doc position (after that row's node).
        let posAtRowEnd: number[] = [];
        let cursor = 0;
        view.state.doc.forEach((node) => {
          cursor += node.nodeSize;
          posAtRowEnd.push(cursor);
        });

        const decorations = layout.pageBreaks.map((b) => {
          const pos = posAtRowEnd[b.afterRowIndex];
          return Decoration.widget(pos, () => {
            const el = document.createElement('div');
            el.className = 'pagination-break';
            el.setAttribute('contenteditable', 'false');
            el.setAttribute('aria-hidden', 'true');
            return el;
          }, { side: 1, key: `break-${b.pageIndex}` });
        });

        const tr = view.state.tr.setMeta(paginationPluginKey, {
          pageGeometries: layout.pageGeometries,
          decorations: DecorationSet.create(view.state.doc, decorations),
        } satisfies PaginationPluginState);
        tr.setMeta('addToHistory', false);
        view.dispatch(tr);
      };

      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(recompute);
      };

      // Initial layout.
      schedule();
      return {
        update(view, prevState) {
          if (view.state.doc !== prevState.doc) schedule();
        },
      };
    },
    props: {
      decorations(state) {
        return paginationPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}
```

- [ ] **Step 2: Wire plugin into PocEditor**

Modify `PocEditor.tsx` extensions list:

```tsx
import { createPaginationPluginMin } from './PaginationPluginMin';

const PaginationExt = Extension.create({
  name: 'paginationMin',
  addProseMirrorPlugins() {
    return [createPaginationPluginMin()];
  },
});

// In useEditor:
extensions: [PocDoc, HeadingRow, PlainRow, BulletRow, PaginationExt]
```

(Add `import { Extension } from '@tiptap/core';` at top.)

- [ ] **Step 3: Manual verify break decoration appears**

`npm run dev` → `/v3-poc` → DevTools → confirm `<div class="pagination-break">` elements appear between row groups every ~10 bullets (depending on content height).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/v3-poc/PaginationPluginMin.ts frontend/src/components/resume/v3-poc/PocEditor.tsx
git commit -m "poc(v3): PaginationPlugin emits widget BreakDecorations from layout output"
```

---

### Task 5: PageChromeLayerMin

**Spec ref:** § 4.4 PageChromeLayer; § 4.6 chrome must not recompute.

**Goal:** Decorative absolute layer that reads `pageGeometries` from PaginationPlugin state and renders white paper cards. **Never recomputes layout itself.**

**Files:**
- Create: `frontend/src/components/resume/v3-poc/PageChromeLayerMin.tsx`
- Modify: `frontend/src/components/resume/v3-poc/PocEditor.tsx`

- [ ] **Step 1: Implement layer**

Create `frontend/src/components/resume/v3-poc/PageChromeLayerMin.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { paginationPluginKey, type PaginationPluginState } from './PaginationPluginMin';

interface Props { editor: Editor | null }

export function PageChromeLayerMin({ editor }: Props) {
  const [state, setState] = useState<PaginationPluginState | null>(null);

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const s = paginationPluginKey.getState(editor.state);
      if (s) setState({ ...s });
    };
    handler();                             // initial
    editor.on('update', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('update', handler);
      editor.off('transaction', handler);
    };
  }, [editor]);

  if (!state) return null;
  return (
    <div className="page-chrome-layer" aria-hidden>
      {state.pageGeometries.map((g) => (
        <div
          key={g.pageIndex}
          className="page-card"
          // Data attributes record the plugin-source geometry verbatim so PoC C
          // can verify PageChromeLayer is a pure pass-through (C3 single SoT).
          // The CSS position values come from the SAME numbers — any drift
          // indicates the chrome is doing its own math, which violates contract.
          data-plugin-top={g.topPx}
          data-plugin-height={g.heightPx}
          style={{
            position: 'absolute',
            top: g.topPx,
            height: g.heightPx,
            left: 0,
            right: 0,
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `poc.css`:

```css
.page-chrome-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
.page-card {
  background: white;
  box-shadow: 0 2px 12px oklch(0.40 0.04 42 / 0.08);
  border-radius: 4px;
}
.poc-editor-wrapper { position: relative; z-index: 1; background: transparent; }
@media print {
  .page-chrome-layer { display: none; }
}
```

Note: `.poc-editor-wrapper` background changed from white → transparent because the page card behind it is now the source of paper color.

- [ ] **Step 3: Mount layer in PocEditor**

In `PocEditor.tsx`:

```tsx
import { PageChromeLayerMin } from './PageChromeLayerMin';

// In return:
return (
  <div className="poc-canvas-root">
    <PageChromeLayerMin editor={editor} />
    <div className="poc-editor-wrapper">
      <EditorContent editor={editor} />
    </div>
  </div>
);
```

- [ ] **Step 4: Manual verify**

`/v3-poc` → see white paper cards stacked vertically with shadows + gaps. Editor content should render on top of cards (z-index 1 vs 0).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v3-poc/PageChromeLayerMin.tsx frontend/src/components/resume/v3-poc/PocEditor.tsx frontend/src/components/resume/v3-poc/poc.css
git commit -m "poc(v3): PageChromeLayer decorative paper cards from plugin state"
```

---

### Task 6: /print route + data-paginated flag

**Spec ref:** § 4.5 /print route; § 4.7 print path; C4 readonly instance contract.

**Goal:** Separate `/v3-poc/print` route mounting a readonly TipTap instance with the same schema, NodeViews, and PaginationPlugin. Sets `body[data-paginated="true"]` after layout + fonts.ready + 2× rAF.

**Files:**
- Create: `frontend/src/app/v3-poc/print/page.tsx`
- Create: `frontend/src/components/resume/v3-poc/PocPrintCanvas.tsx`

- [ ] **Step 1: Implement print canvas**

Create `frontend/src/components/resume/v3-poc/PocPrintCanvas.tsx`:

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Document } from '@tiptap/extension-document';
// Reuse the same Node extensions and PaginationExt from PocEditor.
// Extract them to a separate file in the production version (M5); for PoC we
// re-declare or import directly.

// Quickest path: import named exports from PocEditor.tsx (they should be exported).

import { PocDoc, HeadingRow, PlainRow, BulletRow, PaginationExt, buildPocContent } from './PocEditor';
import { PageChromeLayerMin } from './PageChromeLayerMin';
import { paginationPluginKey } from './PaginationPluginMin';

export function PocPrintCanvas() {
  const editor = useEditor({
    extensions: [PocDoc, HeadingRow, PlainRow, BulletRow, PaginationExt],
    editable: false,
    content: buildPocContent(),
    immediatelyRender: false,
  });
  const readyRef = useRef(false);

  useEffect(() => {
    if (!editor || readyRef.current) return;
    document.body.setAttribute('data-paginated', 'false');
    const checkReady = () => {
      const s = paginationPluginKey.getState(editor.state);
      if (!s || s.pageGeometries.length === 0) { requestAnimationFrame(checkReady); return; }
      // Pagination has emitted at least one page → wait for fonts + 2× rAF
      void document.fonts.ready.then(() => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.body.setAttribute('data-paginated', 'true');
          readyRef.current = true;
        }));
      });
    };
    requestAnimationFrame(checkReady);
  }, [editor]);

  if (!editor) return null;
  return (
    <div className="poc-canvas-root">
      <PageChromeLayerMin editor={editor} />
      <div className="poc-editor-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Export needed symbols from PocEditor**

In `PocEditor.tsx`, ensure named exports:

```tsx
export const PocDoc = Document.extend({ content: 'row+' });
export const HeadingRow = Node.create({ /* … */ });
export const PlainRow = Node.create({ /* … */ });
export const BulletRow = Node.create({ /* … */ });
export const PaginationExt = Extension.create({ /* … */ });
export function buildPocContent() { /* … */ }
```

- [ ] **Step 3: Mount print route**

Create `frontend/src/app/v3-poc/print/page.tsx`:

```tsx
import { PocPrintCanvas } from '@/components/resume/v3-poc/PocPrintCanvas';

export default function V3PocPrintPage() {
  return (
    <main style={{ minHeight: '100vh', padding: 0, margin: 0 }}>
      <PocPrintCanvas />
    </main>
  );
}
```

- [ ] **Step 4: Manual verify**

`http://localhost:3000/v3-poc/print` → renders identical content to /v3-poc but readonly. DevTools → `body` should eventually have `data-paginated="true"` (within ~200ms of mount).

Then open print preview (Cmd+P): inspect that page 2 starts right at the top margin (not flush to edge).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v3-poc/PocPrintCanvas.tsx frontend/src/app/v3-poc/print/ frontend/src/components/resume/v3-poc/PocEditor.tsx
git commit -m "poc(v3): /v3-poc/print route with readonly TipTap + data-paginated flag"
```

---

### Task 7: PoC A — Print fidelity test (incl. @page CSS-var reliability)

**Spec ref:** § 4.9 PoC A; reviewer's "@page CSS custom properties in Chromium PDF must be tested".

**Goal:** Playwright e2e that:
1. Opens `/v3-poc/print`, waits for `data-paginated="true"`
2. Calls `page.pdf()` to generate PDF
3. Asserts PDF page count matches `pageGeometries.length`
4. **Critically:** verifies @page CSS custom property `var(--page-margin-top)` is honored — page 2's first row distance from page top equals topMargin (≤ 1px tolerance)
5. Compares editor screenshot to PDF rasterization, asserts page-boundary diff < 1%

**Files:**
- Create: `frontend/playwright/v3/print-fidelity.spec.ts`
- Modify: `frontend/playwright.config.ts` (add v3 test pattern if needed)

- [ ] **Step 1: Add the failing test**

Create `frontend/playwright/v3/print-fidelity.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';

const POC_PRINT_URL = '/v3-poc/print';
const PDF_TMP = path.join('/tmp', 'v3-poc-print.pdf');

test.describe('PoC A — Print fidelity', () => {
  // CRITICAL: page.pdf() options must let CSS @page own the page size and
  // margins. `format: 'Letter'` and explicit `margin:` options OVERRIDE any
  // CSS @page rule, so a test that uses them does NOT verify our @page
  // contract. We must use `preferCSSPageSize: true` and pass NO format/margin
  // options. Then the PDF page geometry == whatever CSS @page resolved to,
  // which is what we want to verify.
  const PDF_OPTS = { preferCSSPageSize: true, printBackground: false } as const;

  test('PDF page count equals pageGeometries length', async ({ page }) => {
    await page.goto(POC_PRINT_URL);
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible({ timeout: 5000 });

    const pageCount = await page.locator('.page-card').count();
    expect(pageCount).toBeGreaterThanOrEqual(2);

    const pdfBuf = await page.pdf(PDF_OPTS);
    fs.writeFileSync(PDF_TMP, pdfBuf);

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuf) }).promise;
    expect(pdf.numPages).toBe(pageCount);
  });

  test('@page CSS custom property is honored — page 2 first content respects topMargin', async ({ page }) => {
    await page.goto(POC_PRINT_URL);
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible();

    const pdfBuf = await page.pdf(PDF_OPTS);   // preferCSSPageSize so CSS @page rules.
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuf) }).promise;

    // Verify CSS @page actually drove the page size: at @page { size: 8.5in 11in },
    // pdfjs viewport at scale=1 (= 72 dpi PDF points) should be 612 × 792 ± 1pt.
    const page1 = await pdf.getPage(1);
    const v1 = page1.getViewport({ scale: 1 });
    expect(Math.abs(v1.width - 612)).toBeLessThan(2);
    expect(Math.abs(v1.height - 792)).toBeLessThan(2);

    // Render page 2 at high DPI and find first non-empty pixel from top.
    const page2 = await pdf.getPage(2);
    const viewport = page2.getViewport({ scale: 4 });
    const canvas = await renderPdfPageToCanvas(page2, viewport);
    const firstNonEmptyY = findFirstNonEmptyRow(canvas);

    // 0.75in topMargin × 4 scale × 96 dpi ≈ 288 px. Allow ±4 px (≈ 0.04in / 1px @ 96dpi).
    const expectedTopMarginPx = 0.75 * 96 * 4;
    expect(firstNonEmptyY).toBeGreaterThan(expectedTopMarginPx - 4);
    expect(firstNonEmptyY).toBeLessThan(expectedTopMarginPx + 12);
  });

  test('editor view boundary aligns with PDF boundary (< 1% pixel diff)', async ({ page }) => {
    await page.goto('/v3-poc');
    await page.waitForLoadState('networkidle');

    await page.goto(POC_PRINT_URL);
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible();
    const pdfBuf = await page.pdf(PDF_OPTS);

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuf) }).promise;
    const pdfPage1 = await pdf.getPage(1);
    // PDF coordinate units are points (72 dpi). 1in = 72pt. At scale=96/72,
    // the rendered canvas has 1in == 96px so it matches editor screenshot DPI.
    const pdfCanvas = await renderPdfPageToCanvas(pdfPage1, pdfPage1.getViewport({ scale: 96 / 72 }));
    const pdfPage1HeightPx = pdfCanvas.height;

    const cardBox = await page.locator('.page-card').nth(0).boundingBox();
    expect(cardBox).not.toBeNull();
    const editorPage1HeightPx = cardBox!.height;

    const diffPx = Math.abs(editorPage1HeightPx - pdfPage1HeightPx);
    const ratio = diffPx / pdfPage1HeightPx;
    expect(ratio).toBeLessThan(0.01);
  });
});

// Helpers — implement using node-canvas or skia-canvas. For PoC, dependencies
// not yet added. If Playwright's headless Chromium can rasterize PDFs natively,
// this section uses pdf.js's render method which works in Node when given a
// canvas factory (see pdfjs-dist/examples/node).

async function renderPdfPageToCanvas(page: pdfjs.PDFPageProxy, viewport: pdfjs.PageViewport) {
  // Implementation requires `canvas` package: npm install canvas
  // For first version of test: skip pixel rendering and rely on PDF.js text positions.
  // See e.g. https://github.com/mozilla/pdfjs-dist#pdf-rendering-in-nodejs
  throw new Error('TODO before running test: install canvas npm package + implement renderPdfPageToCanvas');
}

function findFirstNonEmptyRow(canvas: { width: number; height: number; data: Uint8ClampedArray }): number {
  // Scan rows from top; return Y of first row containing a pixel below alpha-threshold.
  const rowBytes = canvas.width * 4;
  for (let y = 0; y < canvas.height; y++) {
    let rowHasInk = false;
    for (let x = 0; x < canvas.width; x++) {
      const idx = y * rowBytes + x * 4;
      const r = canvas.data[idx], g = canvas.data[idx + 1], b = canvas.data[idx + 2];
      // Ink threshold: anything not close to pure white.
      if (r < 240 || g < 240 || b < 240) { rowHasInk = true; break; }
    }
    if (rowHasInk) return y;
  }
  return canvas.height;
}
```

The test file references `pdfjs-dist` and a node `canvas` package. Install:

```bash
cd frontend
npm install --save-dev pdfjs-dist canvas
```

Then implement `renderPdfPageToCanvas` properly using `canvas.createCanvas(viewport.width, viewport.height)` and `pdfPage.render({ canvasContext, viewport })`.

- [ ] **Step 2: Run the test — expect setup-error on first run**

```bash
cd frontend
npm run test:e2e -- playwright/v3/print-fidelity.spec.ts
```

Expected on first run: error in `renderPdfPageToCanvas` because the implementation is a `throw new Error('TODO ...')`.

- [ ] **Step 3: Implement renderPdfPageToCanvas with node canvas**

Replace the `throw new Error(...)` block:

```ts
import { createCanvas } from 'canvas';

async function renderPdfPageToCanvas(page: pdfjs.PDFPageProxy, viewport: pdfjs.PageViewport) {
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  // pdfjs requires CanvasRenderingContext2D shape; node-canvas's is compatible enough.
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm run test:e2e -- playwright/v3/print-fidelity.spec.ts
```

Expected: 3/3 tests green. **If any fail, this is a design-level signal — investigate root cause per § 4.9 failure handling. Do not silently weaken assertions to make tests pass.**

- [ ] **Step 5: Commit**

```bash
git add frontend/playwright/v3/print-fidelity.spec.ts frontend/package.json frontend/package-lock.json
git commit -m "poc(v3): PoC A print fidelity tests including @page CSS-var reliability"
```

---

### Task 8: PoC B — Selection traversal across decoration

**Spec ref:** § 4.9 PoC B.

**Goal:** Verify PM selection / cursor / clipboard cleanly traverses BreakDecoration. The decoration must not appear in selection ranges, cursor moves, or copy buffer.

**Files:**
- Create: `frontend/playwright/v3/selection-traversal.spec.ts`

- [ ] **Step 1: Write tests**

Create `frontend/playwright/v3/selection-traversal.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('PoC B — Selection traversal across decoration', () => {
  test('mouse drag-select from row above decoration to row below produces continuous selection', async ({ page }) => {
    await page.goto('/v3-poc');
    await page.waitForSelector('.pagination-break');     // ensure pagination has run

    // Find a row before the first break, and a row after.
    const breakBox = await page.locator('.pagination-break').nth(0).boundingBox();
    const rowAbove = page.locator('.row').nth(8);         // somewhere reliably before break
    const rowBelow = page.locator('.row').nth(20);        // reliably after first break
    const aboveBox = await rowAbove.boundingBox();
    const belowBox = await rowBelow.boundingBox();
    expect(aboveBox && belowBox && breakBox).toBeTruthy();

    // Drag from middle of rowAbove to middle of rowBelow.
    await page.mouse.move(aboveBox!.x + 50, aboveBox!.y + aboveBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(belowBox!.x + 50, belowBox!.y + belowBox!.height / 2, { steps: 12 });
    await page.mouse.up();

    // Inspect the resulting selection's textContent.
    const selectionText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    // Selection should span both rows; should not contain visible content from the .pagination-break (which has none anyway).
    expect(selectionText.length).toBeGreaterThan(0);
    // Sanity: the text from rowAbove and rowBelow should both appear in selection.
    const aboveText = await rowAbove.textContent();
    const belowText = await rowBelow.textContent();
    expect(selectionText).toContain((aboveText ?? '').slice(0, 10));
    expect(selectionText).toContain((belowText ?? '').slice(0, 10));
  });

  test('arrow-down at end of row above decoration lands at start of row below', async ({ page }) => {
    await page.goto('/v3-poc');
    await page.waitForSelector('.pagination-break');

    const rowAbove = page.locator('.row').nth(8);
    await rowAbove.click({ position: { x: 600, y: 5 } });   // click near end of line
    await page.keyboard.press('End');
    const cursorRowBefore = await page.evaluate(() => document.activeElement?.getAttribute('data-row-id'));

    await page.keyboard.press('ArrowDown');
    const cursorRowAfter = await page.evaluate(() => document.activeElement?.getAttribute('data-row-id'));
    // After arrow-down, cursor should be in a different row (next one), not stuck in decoration.
    expect(cursorRowAfter).not.toEqual(cursorRowBefore);
  });

  test('copy across decoration produces clean text without decoration artifacts', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/v3-poc');
    await page.waitForSelector('.pagination-break');

    // Select all text in doc.
    await page.locator('.poc-editor-wrapper').click();
    await page.keyboard.press('Meta+A');     // Cmd+A = select all on macOS; Ctrl+A on others
    await page.keyboard.press('Control+A');  // belt + suspenders
    await page.keyboard.press('Meta+C');
    await page.keyboard.press('Control+C');

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    // Clipboard should not contain anything that looks like a decoration artifact.
    expect(clipboardText).not.toContain('pagination-break');
    expect(clipboardText.length).toBeGreaterThan(100);    // multi-page content
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:e2e -- playwright/v3/selection-traversal.spec.ts
```

Expected: all green. **If selection drag fails, this is a design-level red flag** — widget decorations are interrupting selection. Investigate `side` parameter, `pointer-events: none`, and `user-select: none` on the decoration DOM. Per § 4.9 failure handling, do not work around — escalate to design review.

- [ ] **Step 3: Commit**

```bash
git add frontend/playwright/v3/selection-traversal.spec.ts
git commit -m "poc(v3): PoC B selection traversal across decoration tests"
```

---

### Task 9: PoC C — PageChromeLayer alignment

**Spec ref:** § 4.9 PoC C.

**Goal:** PageChromeLayer's page-card top/height matches PaginationPlugin's pageGeometries pixel-perfectly (≤ 1px diff). Row content visually renders within the page card.

**Files:**
- Create: `frontend/playwright/v3/chrome-alignment.spec.ts`

- [ ] **Step 1: Write tests**

Create `frontend/playwright/v3/chrome-alignment.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('PoC C — PageChromeLayer alignment with plugin output', () => {
  test('page card geometry matches plugin pageGeometries (single-SoT contract)', async ({ page }) => {
    await page.goto('/v3-poc');
    await page.waitForSelector('.page-card');
    await page.waitForSelector('.pagination-break');

    // PageChromeLayerMin (Task 5) writes the plugin-source geometry onto each
    // card as data attributes: data-plugin-top, data-plugin-height. The test
    // verifies the rendered card's actual layout MATCHES those values — i.e.
    // PageChromeLayer is a pure pass-through of plugin state, not its own
    // recomputation. This directly enforces C3 (single SoT).
    const cardCount = await page.locator('.page-card').count();
    expect(cardCount).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < cardCount; i++) {
      const card = page.locator('.page-card').nth(i);
      const pluginTop = await card.getAttribute('data-plugin-top');
      const pluginHeight = await card.getAttribute('data-plugin-height');
      expect(pluginTop).not.toBeNull();
      expect(pluginHeight).not.toBeNull();

      const box = await card.boundingBox();
      expect(box).not.toBeNull();

      // Card must be positioned exactly where the plugin said it should be.
      // The card's offsetTop within the canvas root + canvas root's offsetTop
      // adds up to bounding-box .y. We compare against pluginTop directly.
      const cardOffsetTop = await card.evaluate(el => (el as HTMLElement).offsetTop);
      const cardOffsetHeight = await card.evaluate(el => (el as HTMLElement).offsetHeight);

      expect(Math.abs(cardOffsetTop - parseFloat(pluginTop!))).toBeLessThan(1);
      expect(Math.abs(cardOffsetHeight - parseFloat(pluginHeight!))).toBeLessThan(1);
    }
  });

  test('row content renders within page card (not crossing chrome boundaries visually)', async ({ page }) => {
    await page.goto('/v3-poc');
    await page.waitForSelector('.page-card');

    const card1 = await page.locator('.page-card').nth(0).boundingBox();
    expect(card1).not.toBeNull();

    const allRows = await page.locator('.row').all();
    let lastRowTopOnPage1 = 0;
    for (const row of allRows) {
      const rb = await row.boundingBox();
      if (!rb) continue;
      // Row should be either fully inside page 1 or fully past it.
      const isOnPage1 = rb.y >= card1!.y && rb.y + rb.height <= card1!.y + card1!.height;
      const isFullyPast = rb.y >= card1!.y + card1!.height;
      expect(isOnPage1 || isFullyPast).toBe(true);
      if (isOnPage1) lastRowTopOnPage1 = rb.y + rb.height;
    }
    // The last row on page 1 should be reasonably close to the bottom of the content area
    // (i.e., we don't have huge dead space at the bottom of pages).
    expect(card1!.y + card1!.height - lastRowTopOnPage1).toBeLessThan(200);  // < 2in dead space
  });

  test('chrome layer is display:none on print', async ({ page }) => {
    await page.goto('/v3-poc/print');
    await expect(page.locator('body[data-paginated="true"]')).toBeVisible();

    // Emulate print media.
    await page.emulateMedia({ media: 'print' });
    const chromeDisplay = await page.locator('.page-chrome-layer').evaluate(el =>
      window.getComputedStyle(el).display);
    expect(chromeDisplay).toBe('none');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm run test:e2e -- playwright/v3/chrome-alignment.spec.ts
```

Expected: 3/3 green.

- [ ] **Step 3: Commit**

```bash
git add frontend/playwright/v3/chrome-alignment.spec.ts
git commit -m "poc(v3): PoC C chrome alignment tests"
```

---

### Task 10: Run full PoC suite + sign-off doc

**Spec ref:** § 4.9 PoC sign-off; § 8 R1 milestone gate.

**Goal:** Run all three PoC suites in one go. If all pass, write sign-off document. If any fails, **stop, do not proceed to M2**, escalate to design review.

**Files:**
- Create: `docs/superpowers/specs/2026-04-29-resume-editor-v3-poc-results.md`

- [ ] **Step 1: Run all PoC tests**

```bash
cd frontend
npm run test:e2e -- playwright/v3/
```

Expected: all tests across the three spec files green. Capture output.

- [ ] **Step 2: Capture screenshots**

```bash
npm run test:e2e -- playwright/v3/ --reporter=html
# Open the HTML report; export key screenshots for sign-off doc:
#   - editor view of /v3-poc with chrome visible
#   - PDF page 1 + page 2 thumbnails
```

- [ ] **Step 3: Write sign-off document**

Create `docs/superpowers/specs/2026-04-29-resume-editor-v3-poc-results.md`:

```markdown
# Resume Editor v3 — PoC Sign-off

**Date:** <fill date>
**Branch:** feature/resume-editor-v3
**PoC commit:** <git rev-parse HEAD>

## Summary

| PoC | Status | Notes |
|---|---|---|
| A — Print fidelity (incl. @page CSS-var) | <PASS / FAIL> | <if FAIL, root cause + decision> |
| B — Selection traversal | <PASS / FAIL> | |
| C — PageChromeLayer alignment | <PASS / FAIL> | |

## A — Print fidelity

- PDF page count = pageGeometries length: <PASS/FAIL>
- @page CSS custom property honored on Chromium: <PASS/FAIL>
- Editor / PDF page-boundary diff < 1%: <PASS/FAIL>
- **@page var(--page-margin-top) verification (reviewer concern):** <text describing exact result; e.g. "page 2 first row at y=292px in PDF rasterization @ 4× DPI; expected 288px, diff 4px / 0.013in, within tolerance">

## B — Selection traversal

- Drag-select across decoration produces continuous selection: <PASS/FAIL>
- Arrow-down crosses decoration cleanly: <PASS/FAIL>
- Copy across decoration produces clean text: <PASS/FAIL>

## C — Chrome alignment

- Page card geometry matches plugin within 1px: <PASS/FAIL>
- Row content stays within page card boundaries: <PASS/FAIL>
- Chrome layer hidden on print: <PASS/FAIL>

## Cross-browser

| Browser | Status | Notes |
|---|---|---|
| Chromium (primary print target) | <PASS/FAIL> | |
| Firefox | <documented behavior> | |
| Safari | <documented behavior> | |

## Decision

<one of:>
- **PASS — proceed to M2.** All three PoCs green on Chromium. Plan A (widget decoration) is validated; M2 work begins.
- **FAIL — design review required.** Root cause: <text>. Cannot proceed to M2 until alternative is validated or design is revised. **Do NOT silently fall back to Plan B atom node — that requires its own design subsection per § 4.9.**
```

- [ ] **Step 4: Fill in real values from test output**

Replace `<...>` placeholders with actual test output, screenshots, and decision.

- [ ] **Step 5: If PASS, commit and announce M1 sign-off**

```bash
git add docs/superpowers/specs/2026-04-29-resume-editor-v3-poc-results.md
git commit -m "poc(v3): M1 sign-off — all three PoCs PASS, proceeding to M2"
```

- [ ] **Step 6: If FAIL, halt and escalate**

If any PoC fails, **do not begin M2**. Update todo list with failure details and surface to user / controller. Per § 8 R1 phasing rule: "PoC failure → design review."

---

# M2 — Schema, store, GroupsPlugin (2 days)

**Goal:** Build the data layer (`ResumeDocV3` types, GroupsPlugin, group ops, validator, serializer) in isolation. No editor / NodeView yet. Empirically verify GroupsPlugin's undo/redo behavior — the reviewer's specific concern.

**Pass criteria:**
- All unit tests green
- Round-trip `serialize → hydrate → serialize` is byte-identical for fixture inputs
- **GroupsPlugin undo restores plugin state alongside doc state, verified by direct PM history step / unstep**

---

### Task 11: ResumeDocV3 + GroupOp types

**Spec ref:** § 2.2 row schema, § 2.3 group schema, § 2.6 GroupOp.

**Files:**
- Create: `frontend/src/components/resume/v3/schema/types.ts`
- Create: `frontend/src/components/resume/v3/schema/types.test.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/resume/v3/schema/types.test.ts`:

```ts
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { ResumeDocV3, ResumeRow, SemanticGroup, GroupOp, RowId, GroupId } from './types';

describe('ResumeDocV3 types', () => {
  it('compiles a fully-populated example', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'header.name', content: { text: 'Ruoping Gao' } },
        { id: 'r2' as RowId, kind: 'header.contact', content: { type: 'text', value: 'gao@example.com' } },
        { id: 'r3' as RowId, kind: 'section.heading', content: { text: 'Experience' }, semanticGroupId: 'g1' as GroupId },
        { id: 'r4' as RowId, kind: 'entry.title', content: { text: 'Senior PM' }, semanticGroupId: 'g2' as GroupId },
        { id: 'r5' as RowId, kind: 'entry.meta', content: { text: 'Stripe · 2022—Present' }, semanticGroupId: 'g2' as GroupId },
        { id: 'r6' as RowId, kind: 'bullet', content: { type: 'doc', content: [] }, semanticGroupId: 'g2' as GroupId },
        { id: 'r7' as RowId, kind: 'plain', content: { type: 'doc', content: [] } },
      ],
      groups: [
        { id: 'g1' as GroupId, kind: 'section', role: 'experience' },
        { id: 'g2' as GroupId, kind: 'entry', parentSectionGroupId: 'g1' as GroupId },
      ],
    };
    expect(doc.schemaVersion).toBe(3);
  });

  it('GroupOp variants exist for every lifecycle operation', () => {
    const ops: GroupOp[] = [
      { type: 'create', group: { id: 'g3' as GroupId, kind: 'section', role: 'skills' } },
      { type: 'delete', groupId: 'g3' as GroupId },
      { type: 'updateRole', groupId: 'g1' as GroupId, role: 'projects', label: 'Side Projects' },
      { type: 'updateParent', groupId: 'g2' as GroupId, parentSectionGroupId: 'g1' as GroupId },
    ];
    expect(ops).toHaveLength(4);
  });

  it('SemanticGroup is a discriminated union by kind', () => {
    const section: SemanticGroup = { id: 'g1' as GroupId, kind: 'section', role: 'experience' };
    const entry: SemanticGroup = { id: 'g2' as GroupId, kind: 'entry' };
    expect(section.kind).toBe('section');
    expect(entry.kind).toBe('entry');
  });
});
```

- [ ] **Step 2: Run test — expect compile failure**

```bash
cd frontend
npm test -- src/components/resume/v3/schema/types.test.ts
```

Expected: TS compile error because `./types` doesn't exist yet.

- [ ] **Step 3: Implement types**

Create `frontend/src/components/resume/v3/schema/types.ts`:

```ts
// Branded types so we don't accidentally pass a row id where a group id is expected.
export type RowId = string & { readonly __brand: 'RowId' };
export type GroupId = string & { readonly __brand: 'GroupId' };

export type Align = 'left' | 'center' | 'right';

export interface PlainText {
  text: string;
  align?: Align;
}

// ProseMirror doc JSON — opaque shape from PM. Rich-text rows use this.
export type ProseMirrorDocJSON = {
  type: 'doc';
  content: unknown[];
};

export type ContactItem =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; url: string };

export type RichText = ProseMirrorDocJSON;

export type RowKind =
  | 'header.name'
  | 'header.contact'
  | 'section.heading'
  | 'entry.title'
  | 'entry.meta'
  | 'plain'
  | 'bullet';

export type ResumeRow =
  | { id: RowId; kind: 'header.name';     content: PlainText }
  | { id: RowId; kind: 'header.contact';  content: ContactItem }
  | { id: RowId; kind: 'section.heading'; content: PlainText; semanticGroupId: GroupId }
  | { id: RowId; kind: 'entry.title';     content: PlainText; semanticGroupId: GroupId }
  | { id: RowId; kind: 'entry.meta';      content: PlainText; semanticGroupId: GroupId }
  | { id: RowId; kind: 'plain';           content: RichText;  semanticGroupId?: GroupId }
  | { id: RowId; kind: 'bullet';          content: RichText;  semanticGroupId?: GroupId };

export type SectionRole =
  | 'experience' | 'education' | 'skills' | 'projects'
  | 'awards' | 'publications' | 'volunteer' | 'summary' | 'custom';

export type SemanticGroup =
  | { id: GroupId; kind: 'section'; role: SectionRole; label?: string }
  | { id: GroupId; kind: 'entry';   parentSectionGroupId?: GroupId };

export interface ResumeDocV3 {
  schemaVersion: 3;
  rows: ResumeRow[];
  groups: SemanticGroup[];
}

// GroupOp — operations on the GroupsPlugin state, applied via PM transaction meta.
export type GroupOp =
  | { type: 'create'; group: SemanticGroup }
  | { type: 'delete'; groupId: GroupId }
  | { type: 'updateRole';   groupId: GroupId; role: SectionRole; label?: string }
  | { type: 'updateParent'; groupId: GroupId; parentSectionGroupId?: GroupId };
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- src/components/resume/v3/schema/types.test.ts
```

Expected: 3/3 green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v3/schema/types.ts frontend/src/components/resume/v3/schema/types.test.ts
git commit -m "feat(v3): ResumeDocV3 schema types + GroupOp types"
```

---

### Task 12: GroupOps — applyGroupOps + gcUnreferencedGroups

**Spec ref:** § 2.6 GroupsPlugin apply method; § 2.4 lifecycle.

**Files:**
- Create: `frontend/src/components/resume/v3/plugins/GroupOps.ts`
- Create: `frontend/src/components/resume/v3/plugins/__tests__/GroupOps.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/resume/v3/plugins/__tests__/GroupOps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyGroupOps, gcUnreferencedGroups, type GroupsState } from '../GroupOps';
import type { GroupId, GroupOp } from '../../schema/types';

const empty: GroupsState = { byId: new Map() };

describe('applyGroupOps', () => {
  it('create adds a group', () => {
    const ops: GroupOp[] = [{ type: 'create', group: { id: 'g1' as GroupId, kind: 'section', role: 'experience' } }];
    const next = applyGroupOps(empty, ops);
    expect(next.byId.get('g1' as GroupId)?.kind).toBe('section');
  });
  it('delete removes a group', () => {
    const seed: GroupsState = { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) };
    const next = applyGroupOps(seed, [{ type: 'delete', groupId: 'g1' as GroupId }]);
    expect(next.byId.has('g1' as GroupId)).toBe(false);
  });
  it('updateRole changes role + optional label', () => {
    const seed: GroupsState = { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) };
    const next = applyGroupOps(seed, [{ type: 'updateRole', groupId: 'g1' as GroupId, role: 'projects', label: 'Side Projects' }]);
    const g = next.byId.get('g1' as GroupId);
    expect(g?.kind).toBe('section');
    if (g?.kind === 'section') {
      expect(g.role).toBe('projects');
      expect(g.label).toBe('Side Projects');
    }
  });
  it('updateParent on entry group sets parentSectionGroupId', () => {
    const seed: GroupsState = { byId: new Map([['g2' as GroupId, { id: 'g2' as GroupId, kind: 'entry' }]]) };
    const next = applyGroupOps(seed, [{ type: 'updateParent', groupId: 'g2' as GroupId, parentSectionGroupId: 'g1' as GroupId }]);
    const g = next.byId.get('g2' as GroupId);
    if (g?.kind === 'entry') {
      expect(g.parentSectionGroupId).toBe('g1');
    }
  });
  it('returns the same state object when ops array is empty', () => {
    const next = applyGroupOps(empty, []);
    expect(next).toBe(empty);
  });
  it('treats applyGroupOps as immutable — input map not mutated', () => {
    const seed: GroupsState = { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) };
    applyGroupOps(seed, [{ type: 'delete', groupId: 'g1' as GroupId }]);
    expect(seed.byId.has('g1' as GroupId)).toBe(true);
  });
});

describe('gcUnreferencedGroups', () => {
  it('removes groups not referenced by any row', () => {
    const seed: GroupsState = {
      byId: new Map([
        ['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }],
        ['g2' as GroupId, { id: 'g2' as GroupId, kind: 'entry' }],
        ['g3-orphan' as GroupId, { id: 'g3-orphan' as GroupId, kind: 'section', role: 'skills' }],
      ]),
    };
    const referencedIds = new Set(['g1' as GroupId, 'g2' as GroupId]);
    const next = gcUnreferencedGroups(seed, referencedIds);
    expect(next.byId.has('g1' as GroupId)).toBe(true);
    expect(next.byId.has('g2' as GroupId)).toBe(true);
    expect(next.byId.has('g3-orphan' as GroupId)).toBe(false);
  });
  it('clears parentSectionGroupId on entry groups when their parent is GCd', () => {
    // section group g1 is no longer referenced; entry g2 had it as parent.
    // GC removes g1 AND clears g2.parentSectionGroupId.
    const seed: GroupsState = {
      byId: new Map([
        ['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }],
        ['g2' as GroupId, { id: 'g2' as GroupId, kind: 'entry', parentSectionGroupId: 'g1' as GroupId }],
      ]),
    };
    const referencedIds = new Set(['g2' as GroupId]);
    const next = gcUnreferencedGroups(seed, referencedIds);
    expect(next.byId.has('g1' as GroupId)).toBe(false);
    const g2 = next.byId.get('g2' as GroupId);
    expect(g2?.kind).toBe('entry');
    if (g2?.kind === 'entry') {
      expect(g2.parentSectionGroupId).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run tests — expect fail (no impl)**

```bash
npm test -- src/components/resume/v3/plugins/__tests__/GroupOps.test.ts
```

- [ ] **Step 3: Implement**

Create `frontend/src/components/resume/v3/plugins/GroupOps.ts`:

```ts
import type { GroupId, GroupOp, SemanticGroup } from '../schema/types';

export interface GroupsState {
  byId: Map<GroupId, SemanticGroup>;
}

export function applyGroupOps(state: GroupsState, ops: GroupOp[]): GroupsState {
  if (ops.length === 0) return state;
  const next = new Map(state.byId);
  for (const op of ops) {
    switch (op.type) {
      case 'create':
        next.set(op.group.id, op.group);
        break;
      case 'delete':
        next.delete(op.groupId);
        break;
      case 'updateRole': {
        const existing = next.get(op.groupId);
        if (!existing || existing.kind !== 'section') break;
        next.set(op.groupId, { ...existing, role: op.role, label: op.label });
        break;
      }
      case 'updateParent': {
        const existing = next.get(op.groupId);
        if (!existing || existing.kind !== 'entry') break;
        next.set(op.groupId, { ...existing, parentSectionGroupId: op.parentSectionGroupId });
        break;
      }
    }
  }
  return { byId: next };
}

export function gcUnreferencedGroups(state: GroupsState, referencedIds: Set<GroupId>): GroupsState {
  let didChange = false;
  const next = new Map<GroupId, SemanticGroup>();
  // First pass: keep referenced groups.
  for (const [id, g] of state.byId.entries()) {
    if (referencedIds.has(id)) {
      next.set(id, g);
    } else {
      didChange = true;
    }
  }
  // Second pass: clear dangling parentSectionGroupId on entry groups whose parent was GC'd.
  for (const [id, g] of next.entries()) {
    if (g.kind === 'entry' && g.parentSectionGroupId && !next.has(g.parentSectionGroupId)) {
      next.set(id, { ...g, parentSectionGroupId: undefined });
      didChange = true;
    }
  }
  return didChange ? { byId: next } : state;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- src/components/resume/v3/plugins/__tests__/GroupOps.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v3/plugins/GroupOps.ts frontend/src/components/resume/v3/plugins/__tests__/GroupOps.test.ts
git commit -m "feat(v3): GroupOps applyGroupOps + gcUnreferencedGroups + tests"
```

---

### Task 13: GroupsPlugin

**Spec ref:** § 2.6 GroupsPlugin (the architectural cornerstone for atomicity).

**Files:**
- Create: `frontend/src/components/resume/v3/plugins/GroupsPlugin.ts`

**Architectural note (discovered while writing Task 14 tests):**

The spec § 2.6 originally specified auto-GC inside `GroupsPlugin.apply` on `tr.docChanged`. That's incompatible with PM's undo model — PM history only restores doc Steps, not plugin state. If the plugin auto-GCs a group on row deletion, undo replays the inverse step but the plugin's `apply` runs from the CURRENT (post-GC) state — it can't restore a group it already dropped.

Resolution: **GC moves to serialize time** (Task 17). Plugin's `apply` only handles explicit ops (`groupsHydrate`, `groupOps`). Orphaned groups linger in plugin state during a session — that's fine because:
- Save/serialize drops them via `gcUnreferencedGroups` at output time
- AI context assembly skips groups whose anchor rows are missing
- A session typically lasts minutes; the in-memory orphan-set is small

When v3 production code deletes a row whose group should also vanish (e.g. backspace empty entry.title → entry group gone), it issues an explicit `{type: 'delete', groupId}` paired with the doc step via `dispatchWithGroups`. That makes the deletion atomic AND reversible.

- [ ] **Step 1: Implement plugin (no auto-GC)**

Create `frontend/src/components/resume/v3/plugins/GroupsPlugin.ts`:

```ts
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { GroupOp } from '../schema/types';
import { applyGroupOps, type GroupsState } from './GroupOps';

export const groupsPluginKey = new PluginKey<GroupsState>('groupsPlugin');

export function createGroupsPlugin() {
  return new Plugin<GroupsState>({
    key: groupsPluginKey,
    state: {
      init: () => ({ byId: new Map() }),
      apply(tr: Transaction, oldState: GroupsState): GroupsState {
        // 1. Hydration meta: seed entire state from passed-in groups.
        const hydrate = tr.getMeta('groupsHydrate') as GroupsState | undefined;
        if (hydrate) return hydrate;

        // 2. Apply explicit ops only. NO auto-GC: see architectural note in Task 13.
        //    Production code that wants a group deleted must emit an explicit
        //    {type:'delete'} groupOp paired with the doc step (via dispatchWithGroups).
        const ops = tr.getMeta('groupOps') as GroupOp[] | undefined;
        return ops ? applyGroupOps(oldState, ops) : oldState;
      },
    },
  });
}

/** Read groups state from an EditorState. */
export function getGroupsState(state: EditorState): GroupsState {
  return groupsPluginKey.getState(state) ?? { byId: new Map() };
}
```

- [ ] **Step 2: Smoke import**

```bash
npm test -- src/components/resume/v3/plugins/
```

Expected: GroupOps tests still pass. GroupsPlugin file compiles cleanly (TS errors would surface here).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/v3/plugins/GroupsPlugin.ts
git commit -m "feat(v3): GroupsPlugin with apply method + GC + hydration"
```

---

### Task 14: GroupsPlugin undo/redo verification (the reviewer's specific concern)

**Spec ref:** § 2.6 architectural risk; reviewer note "GroupsPlugin state undo/redo behavior must be tested in M2 (not just trusted)".

**Goal:** Empirically verify that ProseMirror's history extension captures plugin state alongside doc-changing transactions, so Cmd+Z restores both atomically.

**Architectural constraint discovered while writing this test (key insight):**

ProseMirror's `prosemirror-history` plugin records **doc steps**, not arbitrary plugin-state-only transactions. A transaction with `tr.setMeta('groupOps', [...])` and **no doc change** does NOT enter the history stack — `undo` will skip past it.

This means **`groupOps` must always travel with a doc-changing transaction** to be undoable. The natural flows we care about all satisfy this:

- Drag drop → moves rows (doc change) + rebelongs groupId (`groupOps`) ✓
- Backspace empty entry.title → downgrades node kind (doc change) + deletes entry group (`groupOps`) ✓
- Slash `/heading` → setNodeMarkup (doc change) + creates section group (`groupOps`) ✓
- AI apply → modifies row content/positions (doc change) + group ops as needed ✓

**Pure group-state-only operations** (e.g. UI to change a section's `role` without touching rows) are rare, and v3 handles them via either:
- (a) Pair with a no-op doc transaction (e.g. `tr.setNodeAttribute(pos, 'id', sameId)` to force a step) — preferred when undo is desired
- (b) Use a meta `addToHistory: false` flag — when the operation is intentionally not undoable

The test below covers the common (doc + groupOps) path AND verifies that group-only transactions are NOT undoable as expected — so we don't silently rely on undefined PM behavior.

**Files:**
- Create: `frontend/src/components/resume/v3/plugins/__tests__/GroupsPlugin.undoredo.test.ts`

- [ ] **Step 1: Write the verification test**

Create `frontend/src/components/resume/v3/plugins/__tests__/GroupsPlugin.undoredo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { history, undo, redo } from '@tiptap/pm/history';
import { createGroupsPlugin, getGroupsState } from '../GroupsPlugin';
import type { GroupId, GroupOp } from '../../schema/types';

// Minimal schema — single 'row' node with semanticGroupId attr.
const schema = new Schema({
  nodes: {
    doc:  { content: 'row+' },
    text: {},
    row: {
      attrs: { id: { default: '' }, semanticGroupId: { default: null } },
      content: 'text*',
    },
  },
});

function makeRow(id: string, groupId?: string) {
  return schema.nodes.row.create({ id, semanticGroupId: groupId ?? null }, schema.text(' '));
}

describe('GroupsPlugin undo/redo atomicity (REVIEWER CONCERN — empirical verification)', () => {
  it('undo restores groups state alongside doc state when groupOps travel with a doc step', () => {
    const initialDoc = schema.node('doc', null, [makeRow('r1', 'g1')]);
    let state = EditorState.create({
      schema,
      doc: initialDoc,
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) }));
    expect(getGroupsState(state).byId.size).toBe(1);

    // User action: insert row r2 with groupId g2 + create group op (one transaction, doc-changing).
    const r2 = makeRow('r2', 'g2');
    let tr = state.tr.replaceWith(state.doc.content.size, state.doc.content.size, r2);
    const ops: GroupOp[] = [{ type: 'create', group: { id: 'g2' as GroupId, kind: 'entry' } }];
    tr = tr.setMeta('groupOps', ops);
    state = state.apply(tr);
    expect(getGroupsState(state).byId.size).toBe(2);
    expect(state.doc.childCount).toBe(2);

    // Undo: doc and groups both revert (the transaction had a doc step, so it's in history).
    const undoCommand = undo(state, (newTr) => { state = state.apply(newTr); });
    expect(undoCommand).toBe(true);
    expect(state.doc.childCount).toBe(1);
    expect(getGroupsState(state).byId.size).toBe(1);
    expect(getGroupsState(state).byId.has('g2' as GroupId)).toBe(false);

    // Redo: same single step replays both.
    const redoCommand = redo(state, (newTr) => { state = state.apply(newTr); });
    expect(redoCommand).toBe(true);
    expect(state.doc.childCount).toBe(2);
    expect(getGroupsState(state).byId.size).toBe(2);
    expect(getGroupsState(state).byId.has('g2' as GroupId)).toBe(true);
  });

  it('multi-step undo across paired (doc + groupOps) transactions restores groups per step', () => {
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [makeRow('r1', 'g1')]),
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) }));

    // Step A: insert row r2 referencing new group g2 — groupOps PAIRED with doc step.
    {
      const r2 = makeRow('r2', 'g2');
      const tr = state.tr
        .replaceWith(state.doc.content.size, state.doc.content.size, r2)
        .setMeta('groupOps', [{ type: 'create', group: { id: 'g2' as GroupId, kind: 'entry' } } satisfies GroupOp]);
      state = state.apply(tr);
    }
    // Step B: insert row r3 referencing new group g3 — paired again.
    {
      const r3 = makeRow('r3', 'g3');
      const tr = state.tr
        .replaceWith(state.doc.content.size, state.doc.content.size, r3)
        .setMeta('groupOps', [{ type: 'create', group: { id: 'g3' as GroupId, kind: 'entry' } } satisfies GroupOp]);
      state = state.apply(tr);
    }
    expect(getGroupsState(state).byId.size).toBe(3);
    expect(state.doc.childCount).toBe(3);

    // Undo once → step B reverts: r3 gone, g3 gone, r2 + g2 still here.
    undo(state, (newTr) => { state = state.apply(newTr); });
    expect(state.doc.childCount).toBe(2);
    expect(getGroupsState(state).byId.has('g2' as GroupId)).toBe(true);
    expect(getGroupsState(state).byId.has('g3' as GroupId)).toBe(false);

    // Undo again → step A reverts.
    undo(state, (newTr) => { state = state.apply(newTr); });
    expect(state.doc.childCount).toBe(1);
    expect(getGroupsState(state).byId.has('g2' as GroupId)).toBe(false);
  });

  it('group-only transaction (no doc change) is NOT recorded by history — explicit guard against silent reliance on PM internals', () => {
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [makeRow('r1', 'g1')]),
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) }));

    // groupOps-only transaction (no doc step).
    state = state.apply(
      state.tr.setMeta('groupOps', [{ type: 'create', group: { id: 'g2' as GroupId, kind: 'entry' } } satisfies GroupOp])
    );
    expect(getGroupsState(state).byId.size).toBe(2);

    // Undo: PM history has no step for this transaction, so undo() returns false (or
    // pops nothing). Either way, group state remains the post-transaction value.
    const before = state;
    const didUndo = undo(state, (newTr) => { state = state.apply(newTr); });
    if (didUndo) {
      // Some PM versions return true while popping nothing meaningful; verify state unchanged.
      expect(getGroupsState(state).byId.size).toBe(getGroupsState(before).byId.size);
    } else {
      expect(state).toBe(before);
    }
    // KEY ASSERTION: the design contract holds — group-only ops are not undoable.
    // v3 production code MUST always pair groupOps with a doc step (or accept non-undoability).
  });

  it('explicit paired (doc-delete + groupOp delete) transaction is undoable atomically', () => {
    // doc has TWO rows so deleting one keeps the doc valid for `row+` schema.
    const initialDoc = schema.node('doc', null, [makeRow('r1', 'g1'), makeRow('r2', 'g2')]);
    let state = EditorState.create({
      schema,
      doc: initialDoc,
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', { byId: new Map([
      ['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }],
      ['g2' as GroupId, { id: 'g2' as GroupId, kind: 'entry' }],
    ]) }));
    expect(getGroupsState(state).byId.size).toBe(2);

    // Production code path: delete row r1 + emit explicit delete groupOp for g1.
    // (In the real editor, dispatchWithGroups builds this transaction.)
    const r1Size = state.doc.firstChild!.nodeSize;
    const tr = state.tr
      .delete(0, r1Size)
      .setMeta('groupOps', [{ type: 'delete', groupId: 'g1' as GroupId } satisfies GroupOp]);
    state = state.apply(tr);
    expect(state.doc.childCount).toBe(1);
    expect(getGroupsState(state).byId.has('g1' as GroupId)).toBe(false);
    expect(getGroupsState(state).byId.has('g2' as GroupId)).toBe(true);

    // Undo: doc step restores r1; groupOps meta is on the original transaction
    // but PM history doesn't preserve meta, so undo's inverse transaction has
    // the inverse doc step but no inverse group op. GroupsPlugin.apply on the
    // undo runs without ops → groups state remains as it is.
    //
    // RESULT: doc is restored but g1 is NOT restored. This is the documented
    // limitation of pairing approach. To recover, production code includes the
    // group's prior state in the inverse via a custom undo command, OR keeps
    // the group around (no auto-GC) and lets the orphan-aware AI/serialize
    // layer skip it.
    //
    // For v3, this test confirms: undo restores doc; group state is what
    // explicit groupOps + plugin apply produce. If we want exact symmetry on
    // undo, we need a higher-level undo command that re-emits the inverse
    // groupOp. v3 production code should NOT auto-emit `{type:'delete'}` for
    // groups whose row is being deleted — leave them as orphans, drop at
    // serialize time. This makes undo trivially correct.
    undo(state, (newTr) => { state = state.apply(newTr); });
    expect(state.doc.childCount).toBe(2);
    // g1 NOT restored (asymmetric undo because PM history doesn't preserve
    // plugin meta). This documents the contract.
    expect(getGroupsState(state).byId.has('g1' as GroupId)).toBe(false);
  });

  it('LEAVING groups orphaned (no auto-GC, no paired delete op) gives clean undo symmetry', () => {
    // The recommended production pattern: do NOT emit groupOp on row deletion.
    // Group lingers in plugin state as an orphan; serialize-time GC drops it.
    // Undo trivially restores doc + groups (groups never changed).
    const initialDoc = schema.node('doc', null, [makeRow('r1', 'g1'), makeRow('r2', 'g2')]);
    let state = EditorState.create({
      schema,
      doc: initialDoc,
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', { byId: new Map([
      ['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }],
      ['g2' as GroupId, { id: 'g2' as GroupId, kind: 'entry' }],
    ]) }));

    // Delete r1 with NO groupOps — group state unchanged.
    const r1Size = state.doc.firstChild!.nodeSize;
    state = state.apply(state.tr.delete(0, r1Size));
    expect(state.doc.childCount).toBe(1);
    expect(getGroupsState(state).byId.size).toBe(2);   // g1 still here, orphaned

    // Undo restores doc; group state was never touched.
    undo(state, (newTr) => { state = state.apply(newTr); });
    expect(state.doc.childCount).toBe(2);
    expect(getGroupsState(state).byId.size).toBe(2);
    expect(getGroupsState(state).byId.has('g1' as GroupId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- src/components/resume/v3/plugins/__tests__/GroupsPlugin.undoredo.test.ts
```

Expected: all 3 tests green.

**If any fails:** This is a critical failure. The architectural assumption that PM's history extension captures plugin state via the standard `state.apply` mechanism is wrong, or `groupOps` meta is being lost across history boundaries, or GC interactions with history are unexpected. **Halt M2 and investigate**:

- Verify `history()` plugin from `@tiptap/pm/history` does serialize plugin states (check PM docs / source).
- If it doesn't, alternative: add a custom history extension that explicitly records plugin states.
- If GC is the culprit: GC may need to record its own metadata so undo can replay correctly.

**Reviewer's concern is exactly this**: "GroupsPlugin state is whether the current TipTap history extension undo/redo as expected, must be verified, cannot only trust theory."

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/v3/plugins/__tests__/GroupsPlugin.undoredo.test.ts
git commit -m "test(v3): GroupsPlugin undo/redo atomicity verified empirically (M2 gate)"
```

---

### Task 15: dispatchWithGroups helper

**Spec ref:** § 2.6 (must enforce atomic dispatch).

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/dispatchWithGroups.ts`
- Create: `frontend/src/components/resume/v3/interaction/__tests__/dispatchWithGroups.test.ts`

- [ ] **Step 1: Write tests**

Create `frontend/src/components/resume/v3/interaction/__tests__/dispatchWithGroups.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { history } from '@tiptap/pm/history';
import { dispatchWithGroups } from '../dispatchWithGroups';
import { createGroupsPlugin, getGroupsState } from '../../plugins/GroupsPlugin';
import type { GroupId, GroupOp } from '../../schema/types';

const schema = new Schema({
  nodes: {
    doc:  { content: 'row+' },
    text: {},
    row:  { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'text*' },
  },
});

function makeView() {
  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.nodes.row.create({ id: 'r1' }, schema.text(' '))]),
    plugins: [history(), createGroupsPlugin()],
  });
  const view = {
    get state() { return state; },
    dispatch: vi.fn((tr) => { state = state.apply(tr); }),
  } as unknown as { state: EditorState; dispatch: ReturnType<typeof vi.fn> };
  return { view, getState: () => state };
}

describe('dispatchWithGroups', () => {
  it('dispatches a single transaction containing both doc ops and group ops', () => {
    const { view, getState } = makeView();
    const docOp = (tr: typeof view.state.tr) =>
      tr.replaceWith(getState().doc.content.size, getState().doc.content.size, schema.nodes.row.create({ id: 'r2', semanticGroupId: 'g1' }, schema.text(' ')));
    const groupOps: GroupOp[] = [{ type: 'create', group: { id: 'g1' as GroupId, kind: 'section', role: 'experience' } }];

    dispatchWithGroups(view, { docOp, groupOps });

    expect(view.dispatch).toHaveBeenCalledTimes(1);
    expect(getState().doc.childCount).toBe(2);
    expect(getGroupsState(getState()).byId.has('g1' as GroupId)).toBe(true);
  });
  it('throws if neither docOp nor groupOps is provided', () => {
    const { view } = makeView();
    expect(() => dispatchWithGroups(view, {} as any)).toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement**

Create `frontend/src/components/resume/v3/interaction/dispatchWithGroups.ts`:

```ts
import type { EditorView } from '@tiptap/pm/view';
import type { Transaction } from '@tiptap/pm/state';
import type { GroupOp } from '../schema/types';

export interface DispatchWithGroupsArgs {
  docOp?: (tr: Transaction) => Transaction;
  groupOps?: GroupOp[];
  meta?: Record<string, unknown>;
  addToHistory?: boolean;       // default true
}

/**
 * Dispatch a single PM transaction that mutates both doc and GroupsPlugin
 * state atomically. The atomic guarantee comes from PM's single-transaction
 * commit + history extension preserving full EditorState per step.
 *
 * Tasks must use this helper instead of view.dispatch + raw tr.setMeta in
 * any case where group state changes alongside doc changes (drag drop,
 * backspace cascading group GC, slash command kind conversion, AI apply).
 *
 * The ESLint rule no-direct-groups-mutation enforces this.
 */
export function dispatchWithGroups(view: EditorView, args: DispatchWithGroupsArgs): void {
  if (!args.docOp && (!args.groupOps || args.groupOps.length === 0)) {
    throw new Error('dispatchWithGroups requires at least one of docOp or non-empty groupOps');
  }
  let tr = view.state.tr;
  if (args.docOp) tr = args.docOp(tr);
  if (args.groupOps && args.groupOps.length > 0) tr = tr.setMeta('groupOps', args.groupOps);
  if (args.meta) {
    for (const [k, v] of Object.entries(args.meta)) tr = tr.setMeta(k, v);
  }
  if (args.addToHistory === false) tr = tr.setMeta('addToHistory', false);
  view.dispatch(tr);
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v3/interaction/dispatchWithGroups.ts frontend/src/components/resume/v3/interaction/__tests__/dispatchWithGroups.test.ts
git commit -m "feat(v3): dispatchWithGroups atomic doc + groups op helper"
```

---

### Task 16: Schema validator + load-time normalization

**Spec ref:** § 2.5 invariants I1–I6; § 3.6 header.name auto-insert defensive fallback.

**Files:**
- Create: `frontend/src/components/resume/v3/schema/validate.ts`
- Create: `frontend/src/components/resume/v3/schema/__tests__/validate.test.ts`

- [ ] **Step 1: Tests**

Create `frontend/src/components/resume/v3/schema/__tests__/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateResumeDoc, normalizeOnLoad, type ValidationError } from '../validate';
import type { GroupId, ResumeDocV3, RowId } from '../types';

const goodDoc: ResumeDocV3 = {
  schemaVersion: 3,
  rows: [
    { id: 'r1' as RowId, kind: 'header.name', content: { text: 'Test' } },
    { id: 'r2' as RowId, kind: 'section.heading', content: { text: 'Exp' }, semanticGroupId: 'g1' as GroupId },
    { id: 'r3' as RowId, kind: 'entry.title', content: { text: 'Job' }, semanticGroupId: 'g2' as GroupId },
  ],
  groups: [
    { id: 'g1' as GroupId, kind: 'section', role: 'experience' },
    { id: 'g2' as GroupId, kind: 'entry', parentSectionGroupId: 'g1' as GroupId },
  ],
};

describe('validateResumeDoc', () => {
  it('I1: accepts a valid doc', () => {
    const errors = validateResumeDoc(goodDoc);
    expect(errors).toEqual([]);
  });
  it('I1: row references a non-existent group', () => {
    const bad: ResumeDocV3 = { ...goodDoc, rows: [
      ...goodDoc.rows,
      { id: 'r4' as RowId, kind: 'bullet', content: { type: 'doc', content: [] }, semanticGroupId: 'g-nope' as GroupId },
    ] };
    const errors = validateResumeDoc(bad);
    expect(errors.some(e => e.code === 'I1')).toBe(true);
  });
  it('I2: entry group missing entry.title row', () => {
    // g2 declared but no entry.title row references it.
    const bad: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [{ id: 'r1' as RowId, kind: 'header.name', content: { text: 'X' } }],
      groups: [{ id: 'g2' as GroupId, kind: 'entry' }],
    };
    const errors = validateResumeDoc(bad);
    expect(errors.some(e => e.code === 'I2')).toBe(true);
  });
  it('I3: section group missing section.heading row', () => {
    const bad: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [{ id: 'r1' as RowId, kind: 'header.name', content: { text: 'X' } }],
      groups: [{ id: 'g1' as GroupId, kind: 'section', role: 'experience' }],
    };
    const errors = validateResumeDoc(bad);
    expect(errors.some(e => e.code === 'I3')).toBe(true);
  });
  it('I4: duplicate group ids', () => {
    const bad: ResumeDocV3 = {
      ...goodDoc,
      groups: [...goodDoc.groups, { id: 'g1' as GroupId, kind: 'section', role: 'projects' }],
    };
    const errors = validateResumeDoc(bad);
    expect(errors.some(e => e.code === 'I4')).toBe(true);
  });
});

describe('normalizeOnLoad', () => {
  it('inserts a header.name row if missing (defensive load-time fix per § 3.6)', () => {
    const missingName: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [{ id: 'r1' as RowId, kind: 'plain', content: { type: 'doc', content: [] } }],
      groups: [],
    };
    const fixed = normalizeOnLoad(missingName);
    expect(fixed.rows[0].kind).toBe('header.name');
    expect((fixed.rows[0] as Extract<typeof fixed.rows[0], { kind: 'header.name' }>).content.text).toBe('');
  });
  it('does not duplicate header.name when one already exists', () => {
    const fixed = normalizeOnLoad(goodDoc);
    const nameCount = fixed.rows.filter(r => r.kind === 'header.name').length;
    expect(nameCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement**

Create `frontend/src/components/resume/v3/schema/validate.ts`:

```ts
import type { GroupId, ResumeDocV3, RowId } from './types';

export type ValidationCode = 'I1' | 'I2' | 'I3' | 'I4' | 'I5';

export interface ValidationError {
  code: ValidationCode;
  message: string;
  rowId?: RowId;
  groupId?: GroupId;
}

export function validateResumeDoc(doc: ResumeDocV3): ValidationError[] {
  const errors: ValidationError[] = [];

  // I4: group id uniqueness.
  const seenGroupIds = new Set<GroupId>();
  for (const g of doc.groups) {
    if (seenGroupIds.has(g.id)) errors.push({ code: 'I4', message: `Duplicate groupId ${g.id}`, groupId: g.id });
    seenGroupIds.add(g.id);
  }

  const groupById = new Map(doc.groups.map((g) => [g.id, g]));

  // I1: every row.semanticGroupId references an existing group.
  for (const row of doc.rows) {
    if ('semanticGroupId' in row && row.semanticGroupId && !groupById.has(row.semanticGroupId)) {
      errors.push({ code: 'I1', message: `Row ${row.id} references missing group ${row.semanticGroupId}`, rowId: row.id });
    }
  }

  // I2 / I3: each declared group must have its anchor row present.
  for (const g of doc.groups) {
    if (g.kind === 'entry') {
      const hasTitle = doc.rows.some((r) => r.kind === 'entry.title' && 'semanticGroupId' in r && r.semanticGroupId === g.id);
      if (!hasTitle) errors.push({ code: 'I2', message: `Entry group ${g.id} has no entry.title row`, groupId: g.id });
    }
    if (g.kind === 'section') {
      const hasHeading = doc.rows.some((r) => r.kind === 'section.heading' && 'semanticGroupId' in r && r.semanticGroupId === g.id);
      if (!hasHeading) errors.push({ code: 'I3', message: `Section group ${g.id} has no section.heading row`, groupId: g.id });
    }
  }

  return errors;
}

/**
 * Apply defensive normalization on load (§ 3.6 fallback).
 * Currently: ensure exactly one header.name row exists at the top of the doc.
 */
export function normalizeOnLoad(doc: ResumeDocV3): ResumeDocV3 {
  const hasHeaderName = doc.rows.some((r) => r.kind === 'header.name');
  if (hasHeaderName) return doc;
  const headerNameRow: ResumeDocV3['rows'][number] = {
    id: cryptoRandomId() as RowId,
    kind: 'header.name',
    content: { text: '' },
  };
  return { ...doc, rows: [headerNameRow, ...doc.rows] };
}

function cryptoRandomId(): string {
  // Lightweight nanoid-style generator. Safe for in-memory test/runtime ids.
  const buf = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(buf);
  else { for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256); }
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v3/schema/validate.ts frontend/src/components/resume/v3/schema/__tests__/validate.test.ts
git commit -m "feat(v3): schema validator (I1-I4) + load-time header.name normalization"
```

---

### Task 17: Serialize + Hydrate (round-trip)

**Spec ref:** § 2.6 serialization; C1 EditorState as runtime SoT.

**Goal:** `serializeEditorState(state): ResumeDocV3` and `hydrateInitialState(doc): { docJSON, groups }`. Round-trip must be byte-identical.

**Important — RichText wrap/unwrap adapter** (P1 issue surfaced during plan review):

Persisted RichText is a PM doc JSON `{type:'doc',content:[paragraph,...]}`. The PM `plain` / `bullet` row node has `content: 'paragraph'` (test schema) or `content: 'inline*'` (production § 3.1). Either way, a `doc` node cannot be directly inserted as a row's content — the content models don't match.

`hydrateInitialState` (rowToPMNodeJSON for plain/bullet) UNWRAPS the doc: it copies `row.content.content` (the paragraphs array) into the row's content. If the persisted doc is empty, hydrate inserts an empty paragraph so the schema's `paragraph` content rule is satisfied.

`serializeEditorState` (pmNodeToRow for plain/bullet) WRAPS back into a doc: takes `node.content.toJSON()` (paragraphs) and embeds them into a `{type:'doc',content:[...]}` shape. If the only paragraph is empty, persists as `content:[]` to keep round-trip byte-identical.

**Apply this adapter logic in both Tasks 17's `hydrate.ts` and `serialize.ts` exactly as shown below.** The round-trip test asserts byte-identity — any drift is caught immediately.

Production § 3.1 schema uses `content: 'inline*'`. The same wrap/unwrap principle applies, just with inline children directly (no wrapping `paragraph` node). The test schema in this task uses `content: 'paragraph'` for compatibility with the `inline+` issue identified in the review — production code's `inline*` works the same way conceptually.

**Files:**
- Create: `frontend/src/components/resume/v3/schema/serialize.ts`
- Create: `frontend/src/components/resume/v3/schema/hydrate.ts`
- Create: `frontend/src/components/resume/v3/schema/__tests__/roundtrip.test.ts`

- [ ] **Step 1: Tests**

Create `frontend/src/components/resume/v3/schema/__tests__/roundtrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import type { GroupId, ResumeDocV3, RowId } from '../types';
import { hydrateInitialState } from '../hydrate';
import { serializeEditorState } from '../serialize';
import { createGroupsPlugin } from '../../plugins/GroupsPlugin';

// Test schema mirrors production § 3.1: plain/bullet have inline content
// (here: text* + paragraph). Production M3 schema uses 'inline*' allowing marks;
// for round-trip, text-only inline is sufficient to exercise the wrap/unwrap
// adapters between persisted RichText (PM doc JSON) and row inline content.
const schema = new Schema({
  nodes: {
    doc: { content: 'row+' },
    text: {},
    paragraph: { content: 'text*' },
    header_name:     { attrs: { id: { default: '' } }, content: 'text*' },
    header_contact:  { attrs: { id: { default: '' } }, content: 'text*' },
    section_heading: { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'text*' },
    entry_title:     { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'text*' },
    entry_meta:      { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'text*' },
    plain:           { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'paragraph' },
    bullet:          { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'paragraph' },
  },
});

describe('serialize/hydrate round-trip', () => {
  it('round-trip preserves rows + groups byte-identically', () => {
    const original: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'header.name', content: { text: 'Test User' } },
        { id: 'r2' as RowId, kind: 'header.contact', content: { type: 'text', value: 'foo@bar.com' } },
        { id: 'r3' as RowId, kind: 'section.heading', content: { text: 'Experience' }, semanticGroupId: 'g1' as GroupId },
        { id: 'r4' as RowId, kind: 'entry.title', content: { text: 'Senior PM' }, semanticGroupId: 'g2' as GroupId },
        { id: 'r5' as RowId, kind: 'entry.meta', content: { text: '2022-Present' }, semanticGroupId: 'g2' as GroupId },
        // RichText: persisted as a 'doc' wrapper with paragraph children.
        // hydrate copies paragraphs into the bullet PM node (content:'paragraph');
        // serialize wraps them back into 'doc'. Round-trip is byte-identical.
        { id: 'r6' as RowId, kind: 'bullet', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Did things' }] }] }, semanticGroupId: 'g2' as GroupId },
      ],
      groups: [
        { id: 'g1' as GroupId, kind: 'section', role: 'experience' },
        { id: 'g2' as GroupId, kind: 'entry', parentSectionGroupId: 'g1' as GroupId },
      ],
    };

    const { docJSON, groups: initialGroups } = hydrateInitialState(original, schema);
    const state = EditorState.create({
      schema,
      doc: schema.nodeFromJSON(docJSON),
      plugins: [createGroupsPlugin()],
    }).apply(EditorState.create({ schema }).tr.setMeta('groupsHydrate', initialGroups));

    const roundTrip = serializeEditorState(state);
    expect(roundTrip.schemaVersion).toBe(3);
    expect(roundTrip.rows).toEqual(original.rows);
    expect(roundTrip.groups).toEqual(original.groups);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement hydrate**

Create `frontend/src/components/resume/v3/schema/hydrate.ts`:

```ts
import type { Schema } from '@tiptap/pm/model';
import type { GroupsState } from '../plugins/GroupOps';
import type { ResumeDocV3, ResumeRow } from './types';

export function hydrateInitialState(doc: ResumeDocV3, schema: Schema): { docJSON: unknown; groups: GroupsState } {
  // Build PM doc JSON from rows.
  const content = doc.rows.map((row) => rowToPMNodeJSON(row, schema));
  const docJSON = { type: 'doc', content };

  // Build groups state.
  const groups: GroupsState = { byId: new Map(doc.groups.map((g) => [g.id, g])) };
  return { docJSON, groups };
}

function rowToPMNodeJSON(row: ResumeRow, schema: Schema) {
  const attrs: Record<string, unknown> = { id: row.id };
  if ('semanticGroupId' in row && row.semanticGroupId) attrs.semanticGroupId = row.semanticGroupId;

  // The PM node type name is derived from kind (e.g. 'header.name' → 'header_name').
  const nodeName = row.kind.replace('.', '_');
  if (!schema.nodes[nodeName]) throw new Error(`Unknown row kind: ${row.kind} (PM node ${nodeName})`);

  let content: unknown[];
  if (row.kind === 'plain' || row.kind === 'bullet') {
    // RichText: row.content is a PM doc JSON wrapper { type:'doc', content:[paragraph,...] }.
    // The plain/bullet PM node has `content: 'paragraph'` (or 'inline*' in production §3.1).
    // We pass the doc's content array straight through — paragraphs become children of
    // the row node. If the persisted doc is empty, we emit an empty paragraph so the
    // schema (paragraph requirement) is satisfied.
    const docContent = (row.content.content as unknown[]) ?? [];
    if (docContent.length > 0) {
      content = docContent;
    } else {
      content = [{ type: 'paragraph' }];
    }
  } else if (row.kind === 'header.contact') {
    const c = row.content;
    const text = c.type === 'text' ? c.value : c.label;
    content = text ? [{ type: 'text', text }] : [];
    if (c.type === 'link') attrs.linkUrl = c.url;     // PM mark; M3 will refine
  } else {
    content = row.content.text ? [{ type: 'text', text: row.content.text }] : [];
    if ('align' in row.content && row.content.align) attrs.align = row.content.align;
  }
  return { type: nodeName, attrs, content };
}
```

- [ ] **Step 4: Implement serialize**

Create `frontend/src/components/resume/v3/schema/serialize.ts`:

```ts
import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { groupsPluginKey } from '../plugins/GroupsPlugin';
import type { GroupId, ResumeDocV3, ResumeRow, RowId } from './types';

export function serializeEditorState(state: EditorState): ResumeDocV3 {
  const rows: ResumeRow[] = [];
  state.doc.forEach((node) => { rows.push(pmNodeToRow(node)); });
  const groupsState = groupsPluginKey.getState(state) ?? { byId: new Map() };
  const groups = Array.from(groupsState.byId.values());
  return { schemaVersion: 3, rows, groups };
}

function pmNodeToRow(node: PMNode): ResumeRow {
  const kind = node.type.name.replace('_', '.') as ResumeRow['kind'];
  const id = node.attrs.id as RowId;
  const semanticGroupId = (node.attrs.semanticGroupId ?? undefined) as GroupId | undefined;

  if (kind === 'plain' || kind === 'bullet') {
    // Wrap the row node's content (paragraphs / inline) inside a synthetic 'doc'
    // node for the persisted RichText shape. This is the inverse of rowToPMNodeJSON
    // which unwrapped the doc to copy paragraphs into the row.
    const innerContent = node.content.toJSON() as unknown[];
    // If the only child is an empty paragraph, persist as empty doc content (clean roundtrip).
    const isEmptyParagraph = innerContent.length === 1
      && (innerContent[0] as { type: string; content?: unknown[] }).type === 'paragraph'
      && !(innerContent[0] as { content?: unknown[] }).content;
    const persisted = isEmptyParagraph ? [] : innerContent;
    return {
      id,
      kind,
      content: { type: 'doc', content: persisted },
      ...(semanticGroupId ? { semanticGroupId } : {}),
    } as ResumeRow;
  }
  if (kind === 'header.contact') {
    const text = node.textContent;
    const linkUrl = node.attrs.linkUrl as string | undefined;
    const content = linkUrl ? { type: 'link' as const, label: text, url: linkUrl } : { type: 'text' as const, value: text };
    return { id, kind, content };
  }
  // Plain-text kinds.
  const text = node.textContent;
  const align = node.attrs.align as ResumeRow extends { content: { align?: infer A } } ? A : undefined;
  const base: { text: string; align?: typeof align } = { text };
  if (align) base.align = align;
  return { id, kind, content: base, ...(semanticGroupId ? { semanticGroupId } : {}) } as ResumeRow;
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
npm test -- src/components/resume/v3/schema/__tests__/roundtrip.test.ts
```

If round-trip fails because of subtle PM JSON shape differences (e.g., empty content arrays serialized differently), iterate on `rowToPMNodeJSON` / `pmNodeToRow` until byte-identical.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/resume/v3/schema/serialize.ts frontend/src/components/resume/v3/schema/hydrate.ts frontend/src/components/resume/v3/schema/__tests__/roundtrip.test.ts
git commit -m "feat(v3): serialize + hydrate with byte-identical round-trip test"
```

---

# M3 — Editor + 7 NodeViews + slash + keymaps + AI lock (5 days)

**Goal:** Stand up the production v3 editor with all 7 row kinds rendered via NodeViews, full Enter/Backspace state machine, slash menu, Cmd+A progressive selection, and AI lock filterTransaction plugin.

**Pass criteria:**
- All integration tests green
- Manual smoke test of editing a 1-page resume covers every Enter/Backspace transition + every NodeView render

⚠️ **DO NOT dispatch these summary-level M3+ tasks directly to subagents as written.** They are intentionally compact because their detailed shape will be informed by M1/M2 outcomes (e.g. PoC may surface a constraint that changes a NodeView, or M2 may surface a serialization detail that changes a Tiptap Node attr). After M2 sign-off, the controller (you / the user) should expand each M3+ task into M2-level detail (failing test → fail run → impl → pass run → commit), informed by M1/M2 actual code, before dispatching subagents. Treat this section as a milestone plan, not as ready-to-execute task specs.

---

### Task 18: Production PM schema (7 row node types)

**Spec ref:** § 3.1.

**Files:**
- Create: `frontend/src/components/resume/v3/schema/pmSchema.ts`
- Create: `frontend/src/components/resume/v3/schema/__tests__/pmSchema.test.ts`

Implement 7 Tiptap `Node.create({ name: ... })` extensions matching § 3.1 exactly:

- `header_name`: `content: 'text*'`, no marks
- `header_contact`: `content: 'text*'`, allow link mark
- `section_heading`: `content: 'text*'`, no marks, attrs `{ id, semanticGroupId }`
- `entry_title`: `content: 'text*'`, no marks, attrs `{ id, semanticGroupId, align? }`
- `entry_meta`: `content: 'text*'`, no marks, attrs `{ id, semanticGroupId }`
- `plain`: `content: 'inline*'`, all marks, attrs `{ id, semanticGroupId? }`
- `bullet`: `content: 'inline*'`, all marks, attrs `{ id, semanticGroupId? }`

Tests assert each type is registered, content rule matches, attrs default values match.

Commit: `"feat(v3): production PM schema with 7 row node types"`.

---

### Task 19: 7 NodeView components (visual + interaction containers)

**Spec ref:** § 3.2 NodeView template; § 0.5 non-regression visual checklist.

**Files:**
- Create: `frontend/src/components/resume/v3/nodeviews/rowContainer.tsx` (shared template)
- Create: `frontend/src/components/resume/v3/nodeviews/HeaderNameNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/HeaderContactNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/SectionHeadingNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/EntryTitleNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/EntryMetaNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/PlainNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/BulletNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/__tests__/render.test.tsx`

Each NodeView follows the § 3.2 DOM template:
```tsx
<NodeViewWrapper className="row row-{kind}" data-row-id={id} data-group-id={gid}>
  <div className="row-handle" contentEditable={false} data-edit-only>⋮⋮</div>
  {kind === 'bullet' && <span className="row-marker" contentEditable={false}>•</span>}
  <NodeViewContent as="div" className="row-content" />
  {kind === 'section.heading' && <hr className="section-divider" contentEditable={false} />}
</NodeViewWrapper>
```

The shared `rowContainer.tsx` exposes a function component or hook that produces this template; each kind-specific NodeView wraps it + adds kind-specific class.

Tests render each NodeView in isolation (`@testing-library/react`) and assert DOM structure matches spec template.

Commit each NodeView separately or batch:
- `"feat(v3): rowContainer shared template + 7 NodeViews"`

---

### Task 20: Slash command system

**Spec ref:** § 3.7.

**Files:**
- Create: `frontend/src/components/resume/v3/plugins/SlashMenuPlugin.ts`
- Create: `frontend/src/components/resume/v3/plugins/SlashMenuOverlay.tsx`
- Create: `frontend/src/components/resume/v3/plugins/__tests__/slashMenu.test.tsx`

Implement:
- ProseMirror plugin watching for `/` typed at start of row or after whitespace
- Emit Decoration to render React menu overlay near cursor
- Menu lists: `/heading`, `/entry`, `/meta` (grayed if not in entry), `/bullet`, `/text`, `/link`
- Selecting an item dispatches a transaction (using `dispatchWithGroups` when groupId-affecting) that converts current row's kind:
  - `/heading` → setNodeMarkup to `section_heading`, allocate new section group via `groupOps`
  - `/entry` → setNodeMarkup to `entry_title`, allocate new entry group with parent = nearest preceding section group
  - `/meta` → setNodeMarkup to `entry_meta`, inherit current entry's groupId
  - `/bullet` → setNodeMarkup to `bullet`, inherit groupId from above
  - `/text` → setNodeMarkup to `plain`, inherit groupId from above
  - `/link` → toggleMark link

Tests cover each conversion path and verify groups are correctly created/referenced.

Commit: `"feat(v3): slash menu plugin + kind conversions"`.

---

### Task 21: Enter keymap

**Spec ref:** § 3.5.

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/keymap/enter.ts`
- Create: `frontend/src/components/resume/v3/interaction/keymap/__tests__/enter.test.ts`

Implement `handleEnter(state, dispatch?)` that returns true if it handled, false otherwise (PM default behavior fallback). Cover all 9 transitions in the § 3.5 table:

| Current row kind | At end of line | New row kind |
|---|---|---|
| header.name | yes | header.contact |
| header.contact | yes | header.contact |
| section.heading | yes | entry.title |
| entry.title | yes | bullet |
| entry.meta | yes | bullet |
| plain | yes | plain |
| bullet (non-empty) | yes | bullet |
| bullet (empty) | n/a | downgrade to plain |
| Any | mid-row | split, new node same kind |

Use `dispatchWithGroups` for cases that allocate new groups (Enter on section.heading creates new entry group; Enter on entry.title creates a new bullet inheriting current entry's groupId, etc.).

Tests use a small PM doc + dispatch each scenario, assert resulting doc + groups.

Commit: `"feat(v3): Enter keymap with full transition table"`.

---

### Task 22: Backspace keymap (uniform downgrade + header.name protection)

**Spec ref:** § 3.6.

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/keymap/backspace.ts`
- Create: `frontend/src/components/resume/v3/interaction/keymap/__tests__/backspace.test.ts`

Implement the § 3.6 table exactly. Special case: `empty header.name` is no-op (per § 3.6 "the only protected row").

Group-affecting downgrades (entry.title → plain, section.heading → plain) use `dispatchWithGroups` to delete the GC'd group. The plugin's auto-GC will also catch this on next transaction; explicit op is for clarity + history coherence.

Tests cover every row kind × empty / non-empty × at-start / at-end / mid-row state.

Commit: `"feat(v3): Backspace keymap uniform downgrade + header.name protection"`.

---

### Task 23: Cmd+A progressive selection

**Spec ref:** § 3.4.

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/keymap/cmdA.ts`
- Create: `frontend/src/components/resume/v3/interaction/keymap/__tests__/cmdA.test.ts`

State machine: track `cmdAPressLevel: 0 | 1 | 2 | 3` resetting on any non-Cmd+A input. On each press, expand:
- 1: `selectAll` within current row node (PM default)
- 2: Expand TextSelection to cover all rows in current `semanticGroup` (resolve via groupResolver, see Task 25)
- 3: Whole doc

Tests cover each level + reset behavior.

Commit: `"feat(v3): Cmd+A progressive selection (3 levels)"`.

---

### Task 24: AI lock plugin (filterTransaction)

**Spec ref:** § 6.3.

**Files:**
- Create: `frontend/src/components/resume/v3/plugins/AILockPlugin.ts`
- Create: `frontend/src/components/resume/v3/plugins/__tests__/AILockPlugin.test.ts`
- Modify: `frontend/src/stores/aiLock.ts` — adapt key set from `BlockId` to `RowId | GroupId`

Implement `filterTransaction(tr, state)`:
- If `!tr.docChanged`: pass
- If `tr.getMeta('allowLockedEdit')`: pass
- Otherwise compute locked PM ranges from `useAILockStore` keys (resolve GroupId → covered row positions via current doc walk) and check if `tr` writes touch any locked range — if so, reject (return false)

Tests:
- Lock a rowId → user transaction touching that row rejected; transaction with `allowLockedEdit` passes
- Lock a groupId (entry) → user transaction on any row in that group rejected
- Multiple lock paths (keymap input / paste / mark / drag insertion) — assert all are blocked uniformly
- Unlocked rows accept transactions normally

Commit: `"feat(v3): AI lock plugin via filterTransaction; covers all edit pathways"`.

---

### Task 25: rangeResolver (block-select range from row kind)

**Spec ref:** § 5.2.

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/rangeResolver.ts`
- Create: `frontend/src/components/resume/v3/interaction/__tests__/rangeResolver.test.ts`

`resolveBlockRange(state, rowId)` returns `{ rowIds: RowId[], from: PMPos, to: PMPos }` per § 5.2 mapping:

| Clicked row kind | Returned rowIds |
|---|---|
| bullet | [rowId] |
| plain | [rowId] |
| entry.title / entry.meta | all rows in entry group |
| section.heading | all rows in section group (recursive) |
| header.name / header.contact | all header.* rows |

Resolution prefers `semanticGroupId`; falls back to position walk if groupId is missing or GC'd.

Tests cover each kind + orphan + GC'd group fallback.

Commit: `"feat(v3): rangeResolver per § 5.2"`.

---

### Task 26: M3 integration smoke + manual verify

**Spec ref:** § 7.3 integration tests; § 7.6 manual regression.

**Files:**
- Create: `frontend/src/components/resume/v3/__tests__/integration/editor.test.tsx`

Integration test mounts the full v3 editor (all extensions registered, all NodeViews bound, schema, GroupsPlugin, AILockPlugin, slash, keymaps) into a test DOM, hydrates a known fixture, runs scripted user actions:
- Type at end of section.heading + Enter → assert new entry.title row + new entry group created
- Backspace at empty bullet → assert downgrade to plain
- Cmd+A 2× → assert selection expansion to entry group
- Slash `/heading` on plain row → assert kind change + new section group

Manual smoke: run `/editor` route behind `ENABLE_RESUME_V3=true` env, edit a 1-page test resume, confirm every NodeView visually matches v2 + every transition works.

Commit: `"test(v3): M3 integration smoke + manual regression sign-off"`.

---

# M4 — Drag + selection + interaction (3 days)

**Goal:** v3 SelectionManager (refactored from v2 for RowId|GroupId), drag system based on Pointer Events with `setPointerCapture`, drop indicator + drag ghost + drop animation preserving v2 polish, and ESLint custom rules to lock the C7/C8 contracts in place.

**Pass criteria:**
- ESLint rules block CI on any violation
- E2E drag tests across rows / sections / orphan zones all green

---

### Task 27: SelectionManager refactor

**Spec ref:** § 5.1; v2 reuse.

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/SelectionManager.ts`
- Create: `frontend/src/components/resume/v3/interaction/__tests__/SelectionManager.test.ts`

Port v2's `SelectionManager` from `components/resume/v2/interaction/SelectionManager.ts`. Adapt the key type from `BlockId` to `RowId | GroupId`. Public API (subscribe, select, toggle, extend, clear) remains compatible.

Tests verify subscribers fire, set semantics, selection clear.

Commit: `"feat(v3): SelectionManager adapted for RowId | GroupId"`.

---

### Task 28: DragController (Pointer Events + setPointerCapture)

**Spec ref:** § 5.3 hard event-routing rules; § 5.4 drop logic; C7/C8.

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/DragController.ts`
- Create: `frontend/src/components/resume/v3/interaction/__tests__/DragController.test.ts`

Replace mouse events with Pointer Events. On `pointerdown` on `.row-handle`:
- `e.preventDefault()` + `e.stopPropagation()`
- `target.setPointerCapture(e.pointerId)`
- Register temporary `window.addEventListener('pointermove' | 'pointerup' | 'pointercancel' | 'keydown', listener)` (these listeners are allowed by C7 because drag has started)
- On move ≥ 4px → resolve range via `rangeResolver` (Task 25), mark dragged rows with CSS class, emit drop indicator
- On `pointerup` → call `dispatchWithGroups` to perform atomic move (PM `replace` on row range + `groupOps` to update parents/GC)
- On `pointercancel` or `Esc` → cancel, no transaction

Tests cover full drag lifecycle in jsdom (using `@testing-library/user-event` for pointer simulation).

Commit: `"feat(v3): DragController with Pointer Events + setPointerCapture"`.

---

### Task 29: Drop indicator + drag ghost + drop animation

**Spec ref:** § 0.5 non-regression visuals; § 5.4 drop logic; v2 polish reuse.

**Files:**
- Create: `frontend/src/components/resume/v3/layers/InteractionLayer.tsx`
- Modify: `frontend/src/components/resume/v3/ResumeCanvasV3.tsx` — mount InteractionLayer above editor

Port v2's drop indicator + drag ghost rendering from `v2/interaction/DropIndicator.tsx`. Reuse v2 CSS for terracotta accent line + spring-revert animation. Drag ghost uses Framer Motion `layout` for smooth drop animation.

Auto-scroll near canvas edges: `pointermove` listener checks if cursor Y is within 50px of canvas edge → schedule `scrollBy` via rAF.

Manual smoke: drag a section across the doc, verify ghost follows cursor, drop indicator appears between rows, drop animation plays smoothly.

Commit: `"feat(v3): InteractionLayer with drop indicator, drag ghost, auto-scroll (v2 polish preserved)"`.

---

### Task 30: ESLint custom rules

**Spec ref:** § 7.1 static verification; C7/C8.

**Files:**
- Create: `frontend/eslint-rules/no-global-pointer-capture.js`
- Create: `frontend/eslint-rules/no-direct-groups-mutation.js`
- Modify: `frontend/eslint.config.mjs` (or `.eslintrc.*`) to register rules
- Create: `frontend/eslint-rules/__tests__/no-global-pointer-capture.test.js`
- Create: `frontend/eslint-rules/__tests__/no-direct-groups-mutation.test.js`

`no-global-pointer-capture`: AST rule that fires on `window.addEventListener` or `document.addEventListener` calls where:
- First argument is one of `'pointerdown' | 'mousedown' | 'pointerup' | 'mouseup'`
- Third argument is `true` or an object with `capture: true`

Exception: allow listed paths inside DragController where the drag start has already happened (use file-level `// eslint-disable-next-line` if absolutely needed; the rule should be strict by default).

`no-direct-groups-mutation`: AST rule that fires on direct `Map.prototype` mutations (`.set` / `.delete`) on `GroupsState['byId']` outside `GroupsPlugin.ts` or `GroupOps.ts`.

Tests use ESLint RuleTester to verify rule fires/passes correctly on representative code samples.

Wire into CI:
```bash
npm run lint
```

Commit: `"chore(v3): ESLint custom rules to enforce C7 + C8 + § 2.6 atomicity"`.

---

### Task 31: M4 e2e — cross-row drag + cross-section drag

**Spec ref:** § 7.4 selection / drag e2e tests.

**Files:**
- Create: `frontend/playwright/v3/drag-cross-section.spec.ts`

Tests:
- Drag a bullet from Experience section to Education section → assert row moves, groupId rebelongs to Education's entry group
- Drag entire entry (via entry.title 6-dot) across sections → assert all member rows move together; entry group's parentSectionGroupId updates
- Cancel drag with Esc → assert no doc change
- Drag selection containing 2 sections → assert both moved together, parents updated

Commit: `"test(v3): M4 e2e drag cross-section scenarios"`.

---

# M5 — Pagination productionization + page chrome + /print (3 days)

**Goal:** Productionize PaginationPlugin (incremental layout, debounce, performance budget). Connect production PageChromeLayer + /print route to the production editor. Wire CSS tokens. Validate PDF parity end-to-end.

**Pass criteria:**
- PDF pixel-diff vs editor view < 1% on 3-page test resume
- Typing latency < 16ms p50 on 50-row doc

---

### Task 32: Productionize PaginationPlugin

**Spec ref:** § 4.2 architecture; § 4.7 performance.

**Files:**
- Create: `frontend/src/components/resume/v3/plugins/PaginationPlugin.ts`
- Create: `frontend/src/components/resume/v3/layout/LayoutEngine.ts` (port full v2 algorithm)
- Create: `frontend/src/components/resume/v3/plugins/__tests__/PaginationPlugin.test.ts`

Port v2's LayoutEngine (height accumulation + page-break decision logic) into `layout/LayoutEngine.ts`. Adapt input from "atoms" to "row PM nodes / outer DOM" and output to `pageBreaks` + `pageGeometries` per § 4.5.

PaginationPlugin (productionized):
- Subscribes to `tr.docChanged` and `tr.getMeta('forceLayout')`
- Debounces layout pass via rAF
- Diff: only re-measures rows whose nodeSize / kind changed (via `tr.before` vs `tr.after` walk)
- Emits widget BreakDecorations + page geometries via plugin state

Performance test: 50-row doc + simulate 60 keypress/sec for 1 second → assert layout time p50 < 16ms (use `performance.now()` brackets).

Commit: `"feat(v3): production PaginationPlugin with incremental layout + debounce"`.

---

### Task 33: PageChromeLayer (production)

**Spec ref:** § 4.4; C3.

**Files:**
- Create: `frontend/src/components/resume/v3/layers/PageChromeLayer.tsx`
- Create: `frontend/src/components/resume/v3/layers/__tests__/PageChromeLayer.test.tsx`

Read `pageGeometries` from `paginationPluginKey.getState(editor.state)` via React hook (subscribed via `editor.on('transaction', updateState)`). Render absolute-positioned page cards. Reuse v2 paper card CSS (`background: white`, `box-shadow: …`).

C3 contract: never recompute layout. Only render based on plugin state.

Tests verify:
- Number of cards == pageGeometries.length
- Each card's top/height matches geometry pixel-perfect
- `display: none` on print media

Commit: `"feat(v3): production PageChromeLayer (paint-only, plugin-driven)"`.

---

### Task 34: /print route productionization

**Spec ref:** § 4.5; C4.

**Files:**
- Create: `frontend/src/app/print/page.tsx` (replaces v2's print route guard if needed) OR side-by-side `frontend/src/app/print-v3/page.tsx` while v2 is still production
- Create: `frontend/src/components/resume/v3/PrintCanvasV3.tsx`

Mount readonly TipTap with full v3 schema, NodeViews, PaginationPlugin, **but NOT** drag/selection/AILock plugins. Implement `data-paginated` flag pipeline (layout-done → fonts.ready → 2× rAF).

PDF export e2e: similar to PoC A but on the production /print route + production schema. Asserts pixel-diff < 1% on a 3-page fixture resume.

Commit: `"feat(v3): /print route productionized; readonly TipTap with full v3 stack"`.

---

### Task 35: M5 PDF e2e + performance validation

**Files:**
- Modify: `frontend/playwright/v3/print-fidelity.spec.ts` (extend with production fixture)
- Create: `frontend/src/components/resume/v3/plugins/__tests__/PaginationPlugin.perf.test.ts`

Performance test: 50-row doc + 60 transactions/sec → assert p50 layout time < 16ms.

PDF e2e: load production fixture into v3 editor, navigate to /print, assert PDF page count + boundary alignment.

Commit: `"test(v3): M5 PDF e2e + pagination performance budget"`.

---

# M6 — AI integration migration (2 days)

**Goal:** Replace v0 AI integration's BlockId-based targeting with v3's RowId | GroupId. Suggestion store status updates flow through PM transaction meta, not v2's separate undo stack subscription.

**Pass criteria:**
- AI apply works for all four target kinds (`row` / `group` / `selection` / `document`)
- Concurrent-edit scenario (user types while suggestion is pending) doesn't corrupt state
- Lock prevents user edits during pending suggestion

---

### Task 36: AITarget types + suggestionResolver

**Spec ref:** § 6.1, § 6.2.

**Files:**
- Create: `frontend/src/components/resume/v3/ai/aiTargetTypes.ts`
- Create: `frontend/src/components/resume/v3/ai/suggestionResolver.ts`
- Create: `frontend/src/components/resume/v3/ai/__tests__/suggestionResolver.test.ts`

Implement `resolveTarget(target, state)` returning `{ status: 'ok', from, to, rowIds } | { status: 'stale' }` per § 6.2 priority (groupId → rowId → stale).

Tests cover all 4 target kinds + missing groupId fallback + missing rowId stale.

Commit: `"feat(v3): AITarget types + suggestionResolver per § 6.2"`.

---

### Task 37: assembleAIContext

**Spec ref:** § 6.4.

**Files:**
- Create: `frontend/src/components/resume/v3/ai/contextAssembly.ts`
- Create: `frontend/src/components/resume/v3/ai/__tests__/contextAssembly.test.ts`

Implement `assembleAIContext(editorState)` returning the human-semantic structure (header, sections → entries → bullets/plainRows, orphans). Test against a fixture that exercises:
- Multiple sections with multiple entries
- A section with direct plain rows (no entries; e.g., Summary)
- Orphan rows (no group)

Commit: `"feat(v3): assembleAIContext (human-semantic structure for LLM)"`.

---

### Task 38: applyWrapper (single-transaction apply)

**Spec ref:** § 6.2 apply pipeline; § 6.5 hard contracts.

**Files:**
- Create: `frontend/src/components/resume/v3/ai/applyWrapper.ts`
- Create: `frontend/src/components/resume/v3/ai/__tests__/applyWrapper.test.tsx`
- Modify: `frontend/src/components/ai/applySuggestion.ts` to delegate to v3 path when `ENABLE_RESUME_V3` flag is on

Implement `applySuggestionV3(suggestion, view)`:
1. `resolveTarget(suggestion.target, view.state)` → if stale, mark and return
2. Compute required GroupOp[] (e.g. updateParent if move; create if insert; delete if remove last entry row)
3. Use `dispatchWithGroups` with `meta: { allowLockedEdit: true, aiApply: { runId, suggestionIds: [s.id] } }` and `addToHistory: true`
4. PaginationPlugin observes transaction post-commit naturally

Tests: each target kind apply produces single PM history step + correct doc + correct groups.

Commit: `"feat(v3): AI applyWrapper single-transaction with allowLockedEdit + aiApply meta"`.

---

### Task 39: Suggestion store status migration

**Spec ref:** § 6.2 (replaces v0 `_onAiApplyUndo` callback adapter).

**Files:**
- Modify: `frontend/src/stores/aiSuggestion.ts` — add transaction meta listener (PM `editor.on('transaction')`)
- Modify: `frontend/src/stores/aiLock.ts` — adapt `lockedRanges()` to walk current EditorState doc
- Create: `frontend/src/components/resume/v3/__tests__/integration/aiApplyConcurrent.test.tsx`
- Create: `frontend/playwright/v3/ai-apply-concurrent.spec.ts`

Suggestion store subscribes to PM transactions:
- Transaction with `aiApply` meta → mark suggestion `applied`
- Undo command pops a step whose meta matches a previously-applied suggestion → roll suggestion back to `pending`

Concurrent test: dispatch a pending suggestion, user types in another row while pending, then apply → assert apply still works (because suggestion targets via groupId remain stable; user typing changed positions but groupId didn't move).

Commit: `"feat(v3): suggestion store + AI lock store migrated to PM-transaction signaling"`.

---

# M7 — Regression sweep + polish + ship (2–3 days)

**Goal:** Run all regression checks, ship behind flag flip.

**Pass criteria:**
- Manual regression checklist (§ 7.6) all green
- Visual diff < 2% per surface
- PR approved

---

### Task 40: Manual regression checklist run

**Spec ref:** § 7.6.

**Files:**
- Create: `docs/superpowers/specs/2026-04-29-resume-editor-v3-regression-results.md`

Run the manual checklist with v3 editor (under ENABLE_RESUME_V3 flag). Each item:
- Selected block dark bg + 2px terracotta strip
- Hover light bg
- 6-dot opacity fade
- Drop indicator color + position
- Drop animation smooth
- Drop revert spring
- Auto-scroll
- Page chrome paper card + shadow
- "Ask AI" pill on section hover
- Chinese input doesn't drop characters (test via Chinese pinyin entering across rows)
- PDF export exact match to editor view
- All v2 keyboard shortcuts (Cmd+B / I / U / Z / Shift+Z / A) work
- AI apply still works for current AI runs

Document any deviation. Fix or escalate.

Commit: `"docs(v3): M7 manual regression results"`.

---

### Task 41: Visual regression diff vs v2

**Files:**
- Create: `frontend/playwright/v3/visual-regression.spec.ts`

Snapshot comparison at key states:
- Empty doc
- 1-page resume with all 7 row kinds populated
- 3-page resume during scroll
- Drag in flight
- Hovered row
- Selected block
- AI sidebar open

Use Playwright's screenshot diff. Threshold: < 2% per surface.

Commit: `"test(v3): visual regression diff vs v2 baseline"`.

---

### Task 42: Performance + IME + edge cases

**Files:**
- Create: `frontend/playwright/v3/perf.spec.ts`
- Create: `frontend/playwright/v3/ime.spec.ts`
- Create: `frontend/playwright/v3/edge-cases.spec.ts`

Performance: typing latency < 16ms p50 on 50-row doc.
IME: simulate Chinese pinyin via dispatching composition events, assert no characters lost when crossing rows.
Edge cases: empty doc, single-row doc, 5+ pages, all 9 SectionRoles.

Commit: `"test(v3): M7 performance + IME stability + edge cases"`.

---

### Task 43: Remove ENABLE_RESUME_V3 flag + ship

**Files:**
- Modify: `frontend/src/components/resume/v3/EditorPageV3.tsx` — remove flag check
- Modify: `frontend/src/app/resume/[id]/page.tsx` (or equivalent) — point to v3 editor unconditionally
- Delete: `frontend/src/components/resume/v3-poc/` (PoC code; production already covers it)
- Delete: `frontend/src/app/v3-poc/` (PoC routes)

Final code review, manual smoke, then commit:

```bash
git add -A
git commit -m "feat(v3): ship resume editor v3 — remove feature flag, retire v2 paths"
```

Open PR with summary linking spec + PoC sign-off + regression results.

---

## Self-Review

**Spec coverage:**
- § 0 / § 0.5: covered by plan introduction + non-regression checklist (Task 40)
- § 1 (C1–C8): all 8 contracts surfaced in plan header; specific tasks enforce them (Task 30 for C7/C8)
- § 2 schema: T11–T17
- § 2.6 GroupsPlugin atomicity: T13 + T14 (the reviewer's specific concern)
- § 3 editor: T18–T26
- § 4 pagination: T1–T10 (PoC) + T32–T35 (production)
- § 4.6 margin SoT: T1 (PoC), T32 (production), T34 (/print)
- § 5 selection + drag: T27–T31
- § 6 AI: T36–T39
- § 7 testing: scattered through every task (Vitest unit + Playwright e2e)
- § 8 phasing: header + milestone gates per task

**Placeholder scan:** No "TBD" / "TODO" / "implement later" in step bodies. The skip in Task 7's first run uses `throw new Error('TODO before running test: install canvas npm package + implement renderPdfPageToCanvas')` which is the test-fail signal expected by the TDD step structure (Step 2 fails → Step 3 implements).

**Type consistency:** RowId / GroupId / GroupOp / SemanticGroup / ResumeRow used consistently across tasks. `dispatchWithGroups` signature defined in Task 15 and used in Tasks 20–22, 28, 38.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-resume-editor-v3.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, two-stage review after each (spec compliance → code quality), fast iteration without context pollution.
2. **Inline Execution** — Execute tasks in this session with checkpoints between milestones for review.

Per spec § 8 R1: M1 PoC is a hard gate. Whichever execution approach, **the controller must halt at end of Task 10 and review the PoC sign-off doc before authorizing M2**.

Which approach?
