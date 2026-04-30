# Resume Editor v3 — Unified Row Model + Single TipTap

**Status:** Design locked § 1–§ 6, drafted § 7–§ 8.
**Predecessors:** v2 (`2026-04-26-resume-editor-v2-design.md`), v0 AI integration (`2026-04-28-resume-editor-ai-design.md`).
**Goal:** Replace v2's nested `Section → Entry → Bullet` model and per-field TipTap instances with (a) a flat `Row[]` model with positional truth + semantic group anchors, and (b) a single TipTap editor + per-kind NodeViews. This eliminates the cross-editor selection / undo / paste bug class permanently while giving users Notion-style "drag any element anywhere" freedom.

---

## § 0 Why v3

v2 ships a working editor but accumulated a structural bug class around cross-field operations. Each new interaction (cross-row selection, cross-row delete, cross-row replace, multi-row Cmd+Z, cross-row paste, multi-row formatting…) requires its own bridge code stitching N independent TipTap instances together. The bridge layer is leaky — every new gesture surfaces another seam.

The root cause is the architecture: each row is its own isolated editor instance with its own ProseMirror state, history, and selection. The browser's native cross-field text gestures don't compose across instances. We have been re-implementing what the browser already does, badly.

v3 addresses both:

1. **Data model:** Flat `Row[]` list. Position is the rendering / pagination / drag truth. Optional `semanticGroupId` provides stable anchors for AI / diff / suggestion targeting. No parent-ID hierarchy in storage.
2. **Editor architecture:** One TipTap editor with the resume as a single ProseMirror document. Each row is a top-level PM node with a custom NodeView for visual / interaction concerns. Cross-row text gestures are native PM, not bridged.

Existing v2 polish (selection highlight, hover background, drag animations, page chrome, paginated PDF export) is **non-negotiable to preserve**. v3 is "v2 visuals, better data + editor model."

---

## § 0.5 Scope & non-regression

### In scope
- New schema (`ResumeDocV3` + `ResumeRow[]` + `SemanticGroup[]`)
- Single TipTap editor + per-kind NodeViews
- New pagination architecture (PaginationPlugin + page chrome layer + readonly print instance)
- New selection / drag system based on row + group range
- AI integration adapted for row + groupId targeting
- All v2 visual polish preserved or improved
- Migration: **none**. Existing v2 resumes are not migrated; user re-uploads.

### Out of scope (v3.1+)
- Nested bullets / sub-bullets (Tab indent)
- Group hover polish (entry / section bg highlight on row hover)
- Page chrome page numbers / paper textures beyond v2 visual fidelity
- Alt+drag "preserve old groupId" modifier
- Cmd+drag duplicate
- Subsection / quote / image / gap row kinds
- Server-side PDF rendering distinct from /print route
- Mobile / touch optimization beyond what Pointer Events naturally give

### Non-regression mandate
Any change to v3 that degrades a v2 user-visible behavior is rejected. Specific items that must continue to work bit-for-bit:

- Selected block visual: dark bg + 2px terracotta left strip
- Hovered block visual: light bg
- 6-dot drag handle: opacity fade-in on row hover
- Drag drop indicator: terracotta horizontal line in target gap
- Drag ghost: visual replica of dragged rows following cursor
- Drop animation: smooth (FLIP / Framer Motion `layout`)
- Drop revert on cancel: spring animation back
- Auto-scroll while dragging near canvas edges
- Page chrome: white paper card per page + soft shadow + page-to-page gap
- "Ask AI" pill on section heading hover
- IME composition stability (no lost characters during Chinese / Japanese / Korean input)
- PDF output identical to editor view, page break for page break

A `regression` test checklist runs at every implementation milestone (§ 7).

---

## § 1 Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│ Persistence layer (ResumeDocV3 JSON)                             │
│   rows: ResumeRow[]                                              │
│   groups: SemanticGroup[]                                        │
└──────────────────────────────────────────────────────────────────┘
                          ↑                ↓ load
                   serialize         hydrate to PM doc
                          ↑                ↓
┌──────────────────────────────────────────────────────────────────┐
│ Editor layer (single TipTap / ProseMirror, primary runtime SoT)  │
│   PM doc = ordered list of row nodes (one node type per RowKind) │
│   NodeViews per kind own visual + interaction affordances        │
│   Cross-row text selection / delete / paste / Cmd+Z = PM native  │
└──────────────────────────────────────────────────────────────────┘
                          ↓ derives                ↓ injects (runtime only)
┌────────────────────────────────────┐  ┌──────────────────────────────┐
│ Pagination layer                   │  │ Decoration layer              │
│   PaginationPlugin (PM plugin)     │  │   PageBreakDecoration (widget)│
│   single source of truth for       │  │   PaginationPlugin emits      │
│   pageBreaks + pageGeometries      │  │   based on row geometries     │
└────────────────────────────────────┘  └──────────────────────────────┘
        │                                     │
        ↓ consumed by                         ↓ rendered into PM view DOM
┌────────────────────────────────────────────────────────────────────┐
│ Visual layers                                                       │
│   PageChromeLayer (absolute, z below editor)                        │
│     - reads pageGeometries from PaginationPlugin                    │
│     - never recomputes layout                                       │
│     - paper card + shadow + gap per page (preserves v2 visuals)     │
│   InteractionLayer (absolute, z above editor)                       │
│     - drop indicators / drag ghost / "Ask AI" pill                  │
│     - selection highlights driven by SelectionManager (v2 reused)   │
└────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Semantic / AI layer                                              │
│   Group resolution from rows[]: row → entry group → section group │
│   AI target uses RowId / GroupId (groupId preferred for stability)│
│   AI context = assembled human-semantic structure (sections →    │
│   entries → bullets), not raw PM JSON                             │
│   AI lock enforced via PM filterTransaction plugin                │
└──────────────────────────────────────────────────────────────────┘
```

### Architecture hard contracts

These are non-negotiable. Any implementation that violates them is wrong by definition.

- **C1.** PM doc is the primary runtime source of truth. ResumeDocV3 JSON is `serialize(PM doc + groups state)`. Persistence is one-way derivation; no bidirectional sync layer. Save = serialize once.
- **C2.** Page break markers are runtime-only. They are never persisted in `rows`, never present in PM doc serialization, never enter undo history, never sent to the AI as part of context.
- **C3.** PaginationPlugin / LayoutEngine is the single source of truth for `pageBreaks` and `pageGeometries`. PageChromeLayer, BreakDecoration, and the /print route all consume the same plugin output. No layer recomputes layout independently.
- **C4.** /print route uses a separate readonly TipTap Editor instance that shares schema, NodeView code, CSS tokens, and PaginationPlugin with the /edit route. It does not reuse the live editor's DOM. /print waits for `body[data-paginated="true"]` (set after layout done + fonts.ready + 2× requestAnimationFrame) before triggering PDF export.
- **C5.** Page card padding is the only margin source of truth (top + bottom + left + right). `@page { margin: 0 }`. The widget BreakDecoration height is the on-screen page-to-page gap; on print it collapses to 0 and `break-before: page` triggers the actual break.
- **C6.** Position is the visual / layout / drag truth. `semanticGroupId` is a semantic anchor for AI / diff / suggestion targeting. There is never a state where "visually in A but semantically in B" persists past a single drag commit — drop always rewrites groupId per new position.
- **C7.** No `window` or `document` capture-phase pointerdown / mousedown listener may exist anywhere in v3 code. Block-drag input is captured at the row's `.row-handle` / `.section-divider` element, with `setPointerCapture` for the duration of the drag. Once drag is in flight, temporary `window` listeners for `pointermove` / `pointerup` / `pointercancel` / `keydown(Esc)` are allowed and required.
- **C8.** Pointer Events (not mouse events) for all drag input.

---

## § 2 Data model

### § 2.1 Top level

```ts
type ResumeDocV3 = {
  schemaVersion: 3;
  rows: ResumeRow[];           // order = visual / pagination / drag truth
  groups: SemanticGroup[];     // semantic anchors for AI / diff
};
```

`rows` order is the only authoritative source for visual sequence. `groups` is a flat pool of semantic anchors referenced by row.semanticGroupId.

### § 2.2 Row schema

Seven row kinds. Each is a distinct ProseMirror node type at the editor layer (§ 3.1).

```ts
type RowId = string;     // ulid / nanoid
type GroupId = string;   // ulid / nanoid
type Align = 'left' | 'center' | 'right';

type PlainText = { text: string; align?: Align };
type RichText = ProseMirrorDocJSON;  // inline content + marks
type ContactItem =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; url: string };

type ResumeRow =
  | { id: RowId; kind: 'header.name';     content: PlainText }
  | { id: RowId; kind: 'header.contact';  content: ContactItem }
  | { id: RowId; kind: 'section.heading'; content: PlainText; semanticGroupId: GroupId }
  | { id: RowId; kind: 'entry.title';     content: PlainText; semanticGroupId: GroupId }
  | { id: RowId; kind: 'entry.meta';      content: PlainText; semanticGroupId: GroupId }
  | { id: RowId; kind: 'plain';           content: RichText;  semanticGroupId?: GroupId }
  | { id: RowId; kind: 'bullet';          content: RichText;  semanticGroupId?: GroupId };
```

`section.divider` is **not** a persisted row. It is a NodeView affordance inside `section.heading`'s rendering. Clicks on the divider area are forwarded to the heading's drag handle hit target (selection of the entire section group).

`entry.meta` is **optional within an entry group**. An entry group is anchored only by its `entry.title` row(s); meta count ranges 0..N (UI default 1 when user adds an entry).

### § 2.3 Group schema

```ts
type SectionRole =
  | 'experience' | 'education' | 'skills' | 'projects'
  | 'awards' | 'publications' | 'volunteer' | 'summary' | 'custom';

type SemanticGroup =
  | { id: GroupId; kind: 'section'; role: SectionRole; label?: string }
  | { id: GroupId; kind: 'entry';   parentSectionGroupId?: GroupId };
```

`SectionRole` is set explicitly by the user when creating the section (UI offers preset options). The AI relies on `role` rather than guessing from heading text ("Work" vs "Experience" vs "Professional Experience").

`entry.parentSectionGroupId` is recomputed when the entry's first member row is moved across section boundaries (per § 1 lifecycle).

### § 2.4 Group lifecycle

| Trigger | Action |
|---|---|
| User creates `section.heading` row (slash command or first content) | New `SemanticGroup{ kind: 'section', role: <user choice> }` allocated; row.semanticGroupId set |
| User creates `entry.title` row | New `SemanticGroup{ kind: 'entry' }` allocated; row.semanticGroupId set; entry.parentSectionGroupId = nearest preceding section group, or undefined if none |
| User inserts `entry.meta` / `plain` / `bullet` row inside entry range | row.semanticGroupId = nearest preceding `entry.title` row's groupId (or section's groupId if no entry; or undefined for header / orphan) |
| User drags row to new position | row.semanticGroupId rewritten by walking back from new position to nearest `entry.title` (or `section.heading` if no entry) ahead of it; if rules walk past the doc start, groupId becomes undefined (orphan) |
| User backspaces empty `entry.title` row → downgraded to `plain` | entry group GC'd; remaining rows that pointed at this group recomputed by the same backward-walk rule |
| User backspaces empty `section.heading` row → downgraded to `plain` | section group GC'd; entry groups whose `parentSectionGroupId` pointed at this section recomputed |

### § 2.5 Runtime invariants

- I1. Every `row.semanticGroupId` references an existing group.
- I2. Every entry group has ≥ 1 entry.title row (deleting the last one auto-GCs the entry group).
- I3. Every section group has ≥ 1 section.heading row (deleting the last one auto-GCs the section group).
- I4. `groups[].id` is unique.
- I5. When a section group is GC'd, all entry groups that had it as parent get `parentSectionGroupId = undefined`. They are not deleted.
- I6. Undo restores invariants by replaying the pre-edit snapshot.

Invariants are enforced by store actions, not by PM schema.

---

## § 3 Editor layer

### § 3.1 ProseMirror schema

```
doc → row_node+

row_node = header_name | header_contact | section_heading
         | entry_title | entry_meta | plain | bullet

header_name      attrs:{id}                    content: text*    marks: ''
header_contact   attrs:{id}                    content: text*    marks: 'link'
section_heading  attrs:{id, semanticGroupId}   content: text*    marks: ''
entry_title      attrs:{id, semanticGroupId}   content: text*    marks: ''
entry_meta       attrs:{id, semanticGroupId}   content: text*    marks: ''
plain            attrs:{id, semanticGroupId?}  content: inline*  marks: 'all'
bullet           attrs:{id, semanticGroupId?}  content: inline*  marks: 'all'
```

- `inline*` (not `inline+`) so empty rows are schema-legal.
- Plain-text kinds disallow inline marks except where structural (link on header.contact). This prevents users from bolding random words inside a heading and breaking visual consistency.
- `plain` and `bullet` allow the full v2 mark set: bold, italic, underline, color, fontSize, fontFamily, highlight, link, textAlign.
- `bullet` is **not** nested in v3. Tab and Shift+Tab are no-ops on bullet rows. Nested bullets are deferred to v3.1 (separate schema work).
- `doc` content rule is intentionally permissive: any row sequence is valid. Semantic validity (a section containing entries, an entry containing meta + bullets) is enforced by store action lifecycle, not the schema. This matches the Notion-style "any block can go anywhere" UX.

### § 3.2 NodeView pattern

Each row kind registers a NodeView. The DOM template:

```html
<div class="row row-{kind}" data-row-id="{id}" data-group-id="{gid}">
  <div class="row-handle" contenteditable="false" data-edit-only>⋮⋮</div>
  <div class="row-marker" contenteditable="false">•</div>   <!-- bullet only -->
  <div class="row-content">
    {PM-rendered content}                                   <!-- contentDOM -->
  </div>
  <hr class="section-divider" contenteditable="false">      <!-- section.heading only -->
</div>
```

- `dom` = outer `<div>`. `contentDOM` = `.row-content`. PM renders the row's children into `contentDOM` only.
- All non-content elements (handle, marker, divider) are `contenteditable="false"` so PM does not place cursors in them or include them in serialization.
- `<hr class="section-divider">` clicks forward to the same hit logic as the parent heading's `.row-handle` (block-select the section group).

### § 3.3 Cross-row PM behaviors (the core win)

These all work natively without bridge code:

- ↑ / ↓ / ← / → cursor traversal across rows
- Mouse drag-select across multiple rows
- Backspace / Delete deleting cross-row selections
- Typing replaces cross-row selections
- Cmd+Z one-step undoing cross-row operations
- Cross-row mark application (bold, color, link)
- Cross-row copy / cut / paste

v2's `CrossEditorSelection` / `editorRangesBetween` / `atomFocusManager` are obsolete in v3 and removed.

### § 3.4 Cmd+A progressive selection (3 levels)

```
1st Cmd+A:    select all text within current row (PM selectAll within node)
2nd Cmd+A:    expand to current semantic group
3rd Cmd+A:    expand to whole document
```

`current semantic group` resolution:

| Current row | 2nd Cmd+A range |
|---|---|
| bullet / plain with entry groupId | entry group's rows |
| bullet / plain with section groupId (no entry) | section group's rows |
| entry.title / entry.meta | entry group's rows |
| section.heading | section group's rows (incl. all entry groups within) |
| header.name / header.contact | all header rows |
| orphan (no group) | current row only (same as 1st press) |

Implementation: a custom keymap tracks expansion state across consecutive Cmd+A presses. Any non-Cmd+A input clears the state.

### § 3.5 Enter behavior

| Current row at end of line | New row created below |
|---|---|
| header.name | header.contact |
| header.contact | header.contact |
| section.heading | entry.title |
| entry.title | bullet (skipping meta — meta is opt-in via slash) |
| entry.meta | bullet |
| plain | plain |
| bullet (non-empty) | bullet |
| bullet (empty) | demoted to plain (Notion outdent) |
| Enter in middle of any row | row split; new row inherits same kind |

User can override with slash commands (§ 3.7).

### § 3.6 Backspace behavior (uniform downgrade)

| Position | Action |
|---|---|
| Mid-text | PM native delete |
| Start of non-empty row | Merge into previous row (PM native join) |
| Empty bullet | Downgrade to plain |
| Empty entry.meta | Downgrade to plain |
| Empty entry.title | Downgrade to plain; entry group GC; downstream rows recompute groupId |
| Empty section.heading | Downgrade to plain; section group GC; downstream rows recompute groupId |
| Empty header.contact | Delete row; merge cursor to previous |
| Empty header.name | Downgrade to plain |
| Empty plain | Delete row; merge cursor to previous |

The principle: empty + Backspace = uniform downgrade-to-plain (same as v2's existing bullet→plain). No special-case protection; deletion of a section is an explicit gesture (6-dot menu).

### § 3.7 Slash commands

Typing `/` at the start of a row (or after whitespace) opens a menu:

- `/heading` — convert to section.heading (allocates a new section group)
- `/entry` — convert to entry.title (allocates a new entry group)
- `/meta` — convert to entry.meta (must be inside an entry; otherwise grayed out)
- `/bullet` — convert to bullet
- `/text` — convert to plain
- `/link` — insert link at cursor (PM mark, not row conversion)

Type conversion preserves text content as best-effort (text* ↔ inline*, marks dropped on conversion to plain-text kinds). groupId is recomputed per § 2.4 lifecycle.

### § 3.8 Pagination integration

PM doc contains only row nodes. Page break markers are widget decorations injected by PaginationPlugin (§ 4). PM doc.toJSON() is clean — no break markers in serialization, no break markers in undo history, no break markers in AI context.

---

## § 4 Pagination layer

### § 4.1 Goal

- Single contenteditable PM doc with continuous DOM
- Editor visual page boundaries match PDF export page boundaries (within 1px)
- Page breaks computed once per doc-affecting transaction, consumed by all visual layers from one source
- Performance: layout pass ≤ 8ms p50 for 50-row doc on continuous typing

### § 4.2 PaginationPlugin (single source of truth)

A ProseMirror plugin that:

1. Subscribes to PM transactions
2. On `tr.docChanged` (and `tr.getMeta('forceLayout')`), schedules a layout pass via debounced rAF
3. Layout pass:
   - Walks PM doc's row nodes in order
   - Measures each row's NodeView outer DOM height (via getBoundingClientRect)
   - Accumulates Y positions, decides page breaks per pageHeight - 2 × verticalMargin
   - Outputs `pageBreaks: { afterRowPos: number }[]` and `pageGeometries: { pageIndex: number, top: number, height: number }[]`
4. Stores output in plugin state
5. Re-emits widget decorations from `pageBreaks`
6. PageChromeLayer (React) reads `pageGeometries` from plugin state via React hook

**Hard contracts:**

- Plugin output is the only authoritative `pageBreaks` / `pageGeometries`.
- PageChromeLayer never recomputes geometry. It is a pure renderer of plugin state.
- BreakDecoration widget DOM and PageChromeLayer page card DOM are guaranteed to be aligned in Y because they consume the same numbers from the same layout pass.

### § 4.3 BreakDecoration

```ts
const decoration = Decoration.widget(
  afterRowPos,
  () => createBreakDom(),
  { side: 1, key: `break-${pageIndex}` }
);

function createBreakDom(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pagination-break';
  el.setAttribute('contenteditable', 'false');
  el.setAttribute('aria-hidden', 'true');
  el.style.userSelect = 'none';
  el.style.pointerEvents = 'none';
  return el;
}
```

CSS:

```css
.pagination-break {
  display: block;
  height: var(--page-break-screen-gap, 32px);
  break-before: page;
}
@media print {
  .pagination-break { height: 0; }
}
```

The `break-before: page` triggers Chromium's actual page break for print. The `height` provides the on-screen visual gap between page cards. `pointer-events: none` ensures the rendered DOM never participates in click / drag / hover.

### § 4.4 PageChromeLayer

```tsx
function PageChromeLayer() {
  const pageGeometries = usePaginationGeometries();   // reads PaginationPlugin state
  return (
    <div className="page-chrome-layer" aria-hidden>
      {pageGeometries.map((g, i) => (
        <div
          key={i}
          className="page-card"
          style={{ position: 'absolute', top: g.top, height: g.height, /* width */ }}
        />
      ))}
    </div>
  );
}
```

CSS:
```css
.page-chrome-layer { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.page-card        { background: var(--paper); box-shadow: var(--paper-shadow); border-radius: 4px; }
@media print { .page-chrome-layer { display: none; } }
```

The PM editor layer sits at z-index above this layer. The InteractionLayer (drop indicators / drag ghost) sits above the editor.

### § 4.5 /print route

```
/print:
  - Mounts a separate React tree with <PrintCanvas resumeDoc={...}>
  - PrintCanvas creates a readonly TipTap Editor instance
  - Same schema, same NodeViews, same CSS, same PaginationPlugin
  - All interaction plugins (drag, selection, hover, AI sidebar) disabled
  - Body attribute lifecycle:
      data-paginated="false" on mount
      → PaginationPlugin emits "layout-done"
      → wait for document.fonts.ready
      → 2 × requestAnimationFrame
      → data-paginated="true"
  - Export (Playwright page.pdf() / window.print()) waits for data-paginated="true"
```

This guarantees PDF capture happens after fonts are loaded, layout is final, and 2 paint frames have stabilized.

### § 4.6 Margin ownership (single SoT)

```
HORIZONTAL margins (left / right):
  - PageChromeLayer page-card has padding-left = padding-right = horizontalMargin
  - Editor row content renders within the page card's padded area (visually)
  - On print: @page { margin: 0 } — page card padding is the only margin

VERTICAL margins (top / bottom):
  - Each page-card has padding-top = topMargin, padding-bottom = bottomMargin
  - Page 1 row 1 starts at page1.top + topMargin
  - Page 2 row 1 starts at page2.top + topMargin (NOT flush to page edge)
  - On print: page-card padding is the only margin source
  - BreakDecoration height (screen) = visual gap between pages (e.g. 32px)
  - BreakDecoration height (print) = 0
```

### § 4.7 Performance

- Debounce layout pass via rAF
- Diff: only re-measure rows whose content / kind changed since last layout
- If the doc length grew, only re-decide breaks from the changed row downward
- Worker (deferred): move height measurement to OffscreenCanvas (v3.1+)

### § 4.8 Failure modes

| Failure | Recovery |
|---|---|
| Layout pass throws | Catch in plugin; emit empty pageBreaks; PageChromeLayer renders one continuous page; user can keep editing; PDF export warns "page layout failed" |
| Layout pass > 16ms continuously | Two-phase: first emit row-count-based estimate; refine in next idle frame |
| Widget decoration `break-before` not honored by Chromium | See § 4.10 PoC |

### § 4.9 PoC (mandatory before implementation)

A spike branch must validate three things before v3 implementation begins. PoC duration: 3–4 days.

**PoC A — Print fidelity:**
- Widget BreakDecoration is rendered as a block-level sibling of row nodes (verify in DevTools).
- PDF page 2's first row's distance from page top equals topMargin (≤ 1px tolerance).
- Edit-mode screenshot vs PDF raster page boundary mismatch < 1% (pixelmatch).
- Stable across 3+ pages of content.
- Stable under continuous editing + drag operations.

**PoC B — Selection traversal:**
- Mouse drag from a row above the decoration through to a row below produces a continuous PM selection that contains all text in between, with no decoration artifact in the selection range (selection.from / selection.to land on row content, not on the decoration).
- ↓ arrow at end of row above decoration → cursor lands at start of row below.
- Cmd+C across decoration → clipboard text contains both rows, no decoration DOM artifact.

**PoC C — PageChromeLayer alignment:**
- PageChromeLayer page card top/bottom edges align pixel-perfect with PaginationPlugin's pageGeometries output.
- Row content visually renders within page card padding (no "content crosses paper edge" artifact).
- On doc change, page chrome and break decoration update in the same animation frame.

**Pass criteria:** all three PoCs pass on Chromium (primary). Firefox / Safari behavior documented for awareness; Chromium is the print target.

**Failure handling:** if PoC A fails, do not silently fall back to a Plan B atom node. Re-analyze the failure root cause (DOM structure / CSS specificity / decoration timing). Try alternative injection paths (NodeView wrapper, inline decoration, post-row node attribute). Plan B (real PM atom node with `persistent: false` flag, custom serializer skip, explicit history exclusion) is the last resort and requires its own design subsection.

### § 4.10 Hard contracts

```
- PaginationPlugin / LayoutEngine owns pageBreaks + pageGeometries (single SoT).
- BreakDecoration / PageChromeLayer / /print route all consume same plugin output.
- PageChromeLayer never recomputes layout.
- /print uses readonly TipTap instance, same schema / NodeViews / CSS / LayoutEngine.
- /print waits for body[data-paginated="true"] before export.
- Page card padding is the only margin source; @page margin = 0.
- Break decoration is widget-only (Plan A); not persisted in any form.
```

---

## § 5 Selection + drag layer

### § 5.1 Two selection modes (mutually exclusive)

```
Mode A — TEXT selection
  - Native PM / browser
  - Mousedown on .row-content (or descendants) belongs to this mode
  - App code does not register listeners or intercept
  - Cross-row text selection is native PM (free)

Mode B — BLOCK selection
  - Managed by SelectionManager (v2 reused, key set adapted from BlockId to RowId | GroupId)
  - Triggered ONLY from .row-handle / .section-divider / row gutter
  - On entering mode B, window.getSelection().removeAllRanges() and any focused PM editor blurred
  - On entering mode A, SelectionManager.clear()
  - Visual: dark bg + 2px terracotta left strip (v2 SectionHighlightLayer reused)
```

### § 5.2 Block-select range resolution

When the user clicks the 6-dot of a row, the selected range is determined by row kind:

| Clicked row | Selected range |
|---|---|
| bullet | The clicked row only |
| plain | The clicked row only |
| entry.title | All rows in the entry group |
| entry.meta | All rows in the entry group |
| section.heading | All rows in the section group (including all entry groups within) |
| section.divider | Same as the parent section.heading |
| header.name | All header rows |
| header.contact | All header rows |

Range resolution: prefer `semanticGroupId` for stability. If groupId is missing or its group is GC'd, fall back to the position-based walk (find anchor rows above / below).

### § 5.3 Event routing (the v2-bug-prevention contract)

Strict rules to prevent the cross-field selection-hijack bug class:

```
DISALLOW:
  - window.addEventListener('pointerdown', ..., { capture: true })
  - document.addEventListener('pointerdown', ..., { capture: true })
  - Any global capture-phase listener on pointer/mouse down events
  - Any listener attached above .row-handle / .row-content scope

ALLOW (during active drag only):
  - .row-handle / .section-divider element receives pointerdown
  - On pointerdown: handle.setPointerCapture(e.pointerId)
  - Drag in flight: window.addEventListener('pointermove' | 'pointerup' | 'pointercancel' | 'keydown', listener)
  - Drag end: removeEventListener for all the above + handle.releasePointerCapture(pointerId)

ROUTE BY DOM TARGET (mousedown / pointerdown):
  Target is .row-content or descendant         → 100% PM, app does nothing
  Target is .row-handle or .section-divider    → app block-drag system
  Target is row gutter (handle-to-content gap) → app block-selection (single click)
  Target is .row-marker (bullet dot)            → CSS pointer-events: none, passes through to .row-content

USE Pointer Events, NOT mouse events:
  pointerdown / pointermove / pointerup / pointercancel
  setPointerCapture / releasePointerCapture
  Reasons: trackpad / stylus / touch unification; reliable event delivery across element boundaries
```

These rules are checked by an ESLint custom rule (added in § 7.1) and verified by an end-to-end Playwright test that drag-selects across multiple rows and asserts the resulting PM selection is contiguous text.

### § 5.4 Drag visual + drop logic

```
Drag start:
  pointerdown on .row-handle, then pointermove ≥ 4px from start
  Resolve range per § 5.2
  Mark range rows as "dragging" (opacity 0.6, CSS class)
  Create drag ghost: visual replica of dragged rows following cursor
  Compute drop indicator based on cursor Y vs row geometries

Drop targets:
  Any inter-row gap is a valid drop slot, including immediately above / below page break decorations
  Rejected: drop into the moving range itself (no-op)

Drop execution (atomic):
  1. Compute source range and target index in rows[]
  2. PM transaction:
     - Remove source row nodes
     - Insert removed nodes at target position
     - Recompute semanticGroupId of moved rows per § 2.4 (drop ALWAYS rewrites)
     - GC empty groups per § 2.4
     - setMeta('addToHistory', true) — single history step
  3. Dispatch transaction
  4. PaginationPlugin schedules one layout pass post-commit
  5. Drop animation: smooth FLIP / Framer Motion layout

Cancel (Esc / drop on invalid target):
  Drag ghost spring-revert; no PM transaction
```

### § 5.5 Multi-block selection

```
Click on .row-handle (no drag)            → Block-select that row's group range
Cmd/Ctrl + click on .row-handle           → Toggle block selection of that row's group
Shift + click on .row-handle              → Range-extend block selection (rows[oldIndex..newIndex])
Click outside any row but inside canvas   → Clear block selection
Esc                                        → Clear block selection

NOT intercepted (per § 5.3):
  - Cmd/Ctrl/Shift + click inside .row-content (PM owns it)
```

Block selection actions:
- Backspace / Delete → delete selected block range (single PM transaction, single store undo entry)
- Cmd+D → duplicate selected block range
- Drag handle of any selected row → drags the entire selection together

### § 5.6 Hover affordances

**v3 MVP:**
- Hover row → row-handle fades in (opacity 0 → 1, 0.15s)
- Hover row → row-content gets light bg (v2 hover bg reused)
- Hover section.heading → "Ask AI" pill fades in (v2 reused)

**Deferred to v3.1:**
- Hover any row in an entry/section group → entire group's rows get bg highlight
- Implementation will be React state (`hoveredGroupId` via context) propagated to NodeViews; not CSS sibling selectors (which can't match dynamic groupIds without runtime style injection).

### § 5.7 Modifier-key drag

v3 MVP: no drag modifiers. All drops rewrite groupId per new position. Alt+drag and Cmd+drag are reserved for v3.1; for v3, document them as "no-op same-as-plain-drag" so users who try them get sensible behavior.

### § 5.8 Hard contracts

```
- 0 capture-phase global down-event listeners.
- All input via Pointer Events + setPointerCapture.
- Block selection ONLY triggered from .row-handle / .section-divider / row gutter.
- Drag drop ALWAYS rewrites groupId per new position.
- Hover group polish deferred to v3.1.
- v2 visual polish (selection bg + strip, drop indicator, drag ghost, drop animation, auto-scroll, "Ask AI" pill) all preserved.
```

---

## § 6 AI integration

### § 6.1 Target types

```ts
type AITarget =
  | { kind: 'row';       rowId: RowId }
  | { kind: 'group';     groupId: GroupId }
  | { kind: 'selection'; rowIds: RowId[]; from?: PMPos; to?: PMPos }
  | { kind: 'document' };
```

- `'row'` — finest granularity (rewrite this bullet)
- `'group'` — entry / section level (rewrite the Stripe entry's bullets)
- `'selection'` — user dragged a text selection across rows; AI rewrites that range; from / to give precise PM positions, rowIds give the row coverage as fallback
- `'document'` — whole-resume operations (rare; mostly tone / formatting passes)

### § 6.2 Suggestion resolution + apply

```
Resolution priority on suggestion apply:
  1. Resolve target.groupId → current rows belonging to that group
     (groupId is stable across user edits between AI request and apply)
  2. groupId not found (GC'd) → fallback to target.rowId(s)
  3. rowId(s) not found → mark suggestion.status = 'stale'
     UI shows "Content has changed. Regenerate suggestion."
  4. Apply runs against the current PM doc, never against a snapshot taken at suggestion-creation time.

Apply pipeline (single transaction):
  Runtime write path = PM transaction (primary):
    1. Resolve target → PM positions
    2. Build a single transaction:
       - replaceRangeWith / addMark / deleteRange / insert as needed
       - setMeta('allowLockedEdit', true)
       - setMeta('aiApply', { runId, suggestionIds: [sid] })
       - addToHistory: true
    3. dispatch
  Persistence path (one-way, on save):
    Serialize PM doc + groups → ResumeDocV3 JSON
    No bidirectional sync. PM doc is authoritative at runtime.
  Post-commit:
    PaginationPlugin observes the transaction and schedules one layout pass
    (no special "skip pagination during apply" flag needed; single transaction = single commit)
    useSuggestionStore listens to PM transaction meta to update suggestion.status pending → applied

Undo:
  One PM history step = one user-visible Cmd+Z to revert the entire AI apply
  useSuggestionStore listens to PM history transaction meta to detect aiApply undo and roll suggestion back to pending
  (v2's _onAiApplyUndo callback adapter rewritten: monitors PM transactions, not store undo stack pushes)
```

### § 6.3 Lock enforcement (filterTransaction)

```ts
const aiLockPlugin = new Plugin({
  filterTransaction(tr, state) {
    if (!tr.docChanged) return true;
    if (tr.getMeta('allowLockedEdit')) return true;

    const lockedRangeSet = useAILockStore.getState().lockedRanges();
    if (transactionTouchesRanges(tr, lockedRangeSet)) {
      return false;  // reject
    }
    return true;
  },
});
```

This catches all edit pathways uniformly:

- Keymap input (typing, backspace, delete, enter)
- Paste (PM ClipboardEvent → transaction)
- Toolbar mark commands (bold, color, link)
- Drag-drop (block move = transaction)
- Composition (IME) input
- Programmatic commands (slash menu, etc.)
- Selection-replace (deleteSelection)

AI apply transactions tag themselves with `allowLockedEdit: true` and pass through.

`useAILockStore` stores a set of locked keys: `RowId | GroupId`. `lockedRanges()` returns the resolved PM position ranges by walking the current doc. The set is updated when a suggestion enters / leaves `pending` status.

### § 6.4 AI context assembly

The AI does not receive raw PM doc.toJSON(). Context is human-semantic:

```ts
function assembleAIContext(doc: ResumeDocV3): AIContext {
  return {
    header: {
      name: findRow(doc, 'header.name')?.content.text ?? '',
      contact: findRows(doc, 'header.contact').map(r => r.content),
    },
    sections: buildSectionTree(doc),  // section group → entry groups → rows
    orphanRows: findOrphans(doc),
  };
}
```

Section / entry / row IDs are preserved in the context so the AI can reference them in responses. Suggestions reference `rowId` and / or `groupId`; the resolver in § 6.2 takes care of mapping back to current PM positions.

`SectionRole` (e.g. 'experience', 'skills') is included so the AI knows what kind of content is appropriate without guessing from heading text.

### § 6.5 Hard contracts

```
- AI lock enforced via PM filterTransaction plugin (covers all edit pathways uniformly).
- AI apply = one PM transaction = one undo step.
- PM doc is primary runtime SoT; ResumeDocV3 JSON = serialize(PM doc + groups).
- AI context = human-semantic structure (section → entries → rows), not PM JSON.
- Suggestion target prefers groupId, falls back to rowId, then marks stale.
- PaginationPlugin observes the apply transaction post-commit (no special skip flag needed).
```

---

## § 7 Testing strategy

### § 7.1 Static verification

- TypeScript strict — schema types catch malformed rows
- ESLint custom rule: `no-global-pointer-capture` — fails CI on any `window.addEventListener('pointerdown' | 'mousedown' | 'pointerup' | 'mouseup', ..., true)` outside the drag system's known temporary listener call sites
- Schema validator: `validateResumeDoc(doc)` checks invariants I1–I6; runs in dev on every save

### § 7.2 Unit tests (Vitest)

- Group resolution: clicking 6-dot of any row kind returns the correct range (per § 5.2). Cover all 8 row kinds × normal/orphan/GC'd-group states.
- Drag drop: moving rows across sections correctly rewrites groupId. Cover crossing entry boundary, section boundary, into header, into orphan zone.
- Group lifecycle: backspacing empty entry.title GCs the entry group and reassigns downstream rows. Cover § 2.4 lifecycle table.
- Enter / Backspace state machine: every (current kind, position-in-row, content-emptiness) combination produces the right new row / merge / downgrade per § 3.5 / § 3.6.
- Cmd+A progressive: 1st / 2nd / 3rd press selection scope per § 3.4.
- Schema validator: I1–I6 all rejection paths covered.

### § 7.3 Integration tests (TipTap-level)

- Cross-row PM behaviors that v3 claims as native: mouse drag-select, Backspace on cross-row selection, character replace, copy / cut / paste, mark application, Cmd+Z. Each returns expected doc state.
- AI lock plugin: filterTransaction rejects edits to locked ranges; AI apply with `allowLockedEdit` passes; reflects all edit pathways (keymap / paste / toolbar / drag / composition).
- PaginationPlugin: doc edit triggers one layout pass; output stable; large docs (50+ rows) within performance budget.
- Apply transaction: single suggestion produces single undo step; cross-row apply atomic.

### § 7.4 E2E tests (Playwright)

- Cross-row text selection drag end-to-end + Backspace deletes the selection cleanly + Cmd+Z restores.
- 6-dot drag of a section across to a different position; subsequent AI suggestion targeting that section still resolves.
- AI apply diff: user edits another row mid-stream while suggestion is pending; apply still succeeds (groupId resolution).
- /print route mount + waits for `data-paginated="true"` before allowing PDF export trigger.
- Visual regression: baseline screenshots from v2 vs v3 at key states (empty doc / 1-page / 3-page resume / drag in flight / hovered row / selected block / AI sidebar open). Diff < 2% for non-changed surfaces.
- IME composition: simulate Chinese pinyin input across rows; no characters lost.

### § 7.5 PoC sign-off

The PoC (§ 4.9) has explicit pass/fail criteria. PoC must pass before any v3 implementation merges to main. PoC results documented in a sign-off file `docs/superpowers/specs/2026-04-29-resume-editor-v3-poc-results.md` linked from this design.

### § 7.6 Manual regression checklist

A markdown checklist of v2 user-visible behaviors run by hand before each milestone:

- Selected block dark bg + 2px terracotta strip
- Hover light bg
- 6-dot opacity fade on hover
- Drop indicator color + position
- Drop animation smooth, no jank
- Drop revert spring back
- Auto-scroll near canvas edges during drag
- Page chrome paper card + shadow visible
- "Ask AI" pill on section hover
- Chinese input doesn't drop characters
- PDF export exact match to editor view
- All v2 keyboard shortcuts (Cmd+B / I / U / Z / Shift+Z / A) work as before
- AI apply still works for current AI runs

---

## § 8 Implementation phasing

Total estimate: **9–12 working days** (incl. PoC).

### Week 1: PoC (3–4 days, isolated branch)

- Day 1–2: Build minimal TipTap demo with PaginationPlugin, BreakDecoration, PageChromeLayer
- Day 3: Run PoC A (print fidelity), B (selection traversal), C (chrome alignment)
- Day 4: Document findings in PoC results file. If pass → green-light v3. If fail → re-analyze, attempt alternative injection paths, escalate to design re-review if all fail.

### Week 2: Schema + store (1.5 days)

- Define `ResumeDocV3` types
- Implement store (`useResumeStoreV3`) with row + group lifecycle actions
- Schema validator
- No editor / UI yet — store is testable in isolation
- Unit tests for § 7.2

### Week 2–3: Editor + NodeViews (3 days)

- Single TipTap editor scaffold with the 7 row node types
- One NodeView per kind, including section.heading's `<hr>` decoration, bullet's `<•>` marker, all `.row-handle` elements
- Slash command menu (§ 3.7)
- Keymap for Enter / Backspace per § 3.5 / § 3.6
- Cmd+A progressive (§ 3.4)
- AI lock plugin via filterTransaction (§ 6.3)
- Integration tests for § 7.3

### Week 3: Drag + selection + interaction layer (1.5 days)

- SelectionManager adapted for RowId | GroupId
- Block-select range resolver (§ 5.2)
- Drag with Pointer Events + setPointerCapture (§ 5.3 / § 5.4)
- Drop animation, drop indicator, drag ghost (preserve v2 polish)
- ESLint custom rule for capture-phase listeners (§ 7.1)
- E2E tests for § 7.4 selection / drag

### Week 4: Pagination + page chrome + /print (2 days)

- PaginationPlugin completed (initial scaffold from PoC)
- PageChromeLayer connected to plugin state
- /print route with readonly TipTap instance
- `data-paginated` flag pipeline
- PDF export end-to-end test (§ 7.4)

### Week 4–5: AI integration migration (1.5 days)

- AI target types (§ 6.1) + resolver (§ 6.2)
- AI context assembly (§ 6.4)
- Apply transaction wrapper (single transaction, allowLockedEdit, aiApply meta)
- Suggestion store status updates via PM transaction meta listener (replaces v0 `_onAiApplyUndo`)
- E2E test for AI apply mid-edit (§ 7.4)

### Week 5: Polish + manual regression (1 day)

- Run § 7.6 manual regression checklist
- Visual regression diff against v2 baseline screenshots
- Performance pass: typing latency, drag smoothness, AI apply latency
- Bug fixes
- Commit / PR

### Phasing rules

- **R1.** PoC must pass before any v3 work merges. PoC failure → design review, do not unblock implementation.
- **R2.** Each week's deliverables ship behind a feature flag (`ENABLE_RESUME_V3`). v2 remains the active editor until v3 is fully green.
- **R3.** Manual regression checklist runs at end of each phase. Any v2 regression blocks the phase.
- **R4.** Migration strategy: none. v3 reads only v3-format JSON. v2 resumes are not loadable in v3. User re-uploads.

### What doesn't change

- Suggestion store, conversation store, AI sidebar UI, AI session client, SSE streaming, applySuggestion service — all remain. Only the apply path's row/group resolution and the lock plugin's enforcement layer change.
- LayoutEngine algorithm (height accumulation, page break decision) — algorithmic core preserved; output format adapts from atom-per-page-wrapper to break-decoration positions + page geometries.
- v2 visual styles — CSS tokens (colors, shadows, paper, fonts) all reused.
- /api/resume backend, save/load endpoints — adapted only to accept/return ResumeDocV3 JSON; backend doesn't care about the schema beyond opaque storage.

---

## § 9 Open questions

These are explicitly deferred and do not block v3 design lock:

- Q1. Page numbers in PageChromeLayer? (v3.1 polish)
- Q2. Header rows' grouping — should they belong to a synthetic 'header' group for selection / AI consistency? Currently no group; treated as ungrouped header sequence. (v3 ships without; revisit if AI confusion arises.)
- Q3. Slash menu for v3 MVP scope — only the kinds listed in § 3.7, or richer (style switches, color)?
- Q4. Mobile / tablet — Pointer Events give us a free baseline; no responsive tweaks in v3 MVP.
- Q5. Collaborative editing — way out of scope; PM y-text would integrate naturally into the single-PM architecture if pursued later.

---

## § 10 References

- v2 spec: `docs/superpowers/specs/2026-04-26-resume-editor-v2-design.md`
- v0 AI spec: `docs/superpowers/specs/2026-04-28-resume-editor-ai-design.md`
- ProseMirror documentation:
  - Decorations: <https://prosemirror.net/docs/guide/#view.decorations>
  - Plugin API: <https://prosemirror.net/docs/guide/#state.plugins>
  - NodeView: <https://prosemirror.net/docs/guide/#view.node_views>
- TipTap NodeView API: <https://tiptap.dev/docs/editor/guide/node-views>
- Notion's block model (informal reference): each block is its own component with positional ordering, group hierarchy derived from indentation / heading levels rather than parent IDs.
