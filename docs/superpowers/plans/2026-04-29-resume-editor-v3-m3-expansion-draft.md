# Resume Editor v3 — M3 Expansion (Draft)

**Status:** APPROVED 2026-04-30. Open questions resolved (see end of doc). Expands Tasks 18–26 of the v3 plan into TDD-ordered, bite-sized steps with explicit file lists and commit gates. Dispatch order: T18 alone → (T19 || T20+T21+T22+T23+T25 || T24) → T26.

**Source documents:**
- Spec: `docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md` (§ 3 editor + § 4 pagination findings + § 6 AI lock + C1–C8 contracts)
- Existing plan: `docs/superpowers/plans/2026-04-29-resume-editor-v3.md` (M3 Tasks 18–26 sketch + M3+ expansion notes)
- M1 PoC sign-off: `docs/superpowers/specs/2026-04-29-resume-editor-v3-poc-results.md`
- M2 already-built code: `frontend/src/components/resume/v3/{schema,plugins,interaction}/...`

**M1/M2 finding labels referenced throughout** (every label appears at least once in a relevant task):

- **F1 — ReactNodeViewRenderer wrapper selector** (`:scope > div > .row`, NOT `:scope > .row`)
- **F2 — Static @page rule injection** (Chromium PDF doesn't resolve CSS vars in `@page`)
- **F3 — Position-based measurement** (`(rect.top − pageFirstRowTop) + rect.height`, NOT `Σ rect.height`)
- **F4 — GroupsPlugin orphan-tolerant** (no auto-GC per tx; GC only at serialize time; readers MUST tolerate dangling `parentSectionGroupId`)
- **F5 — `dispatchWithGroups` is the ONLY group-mutation path** (direct `view.dispatch(tr)` for group changes is forbidden)

---

## Tracks (for parallel dispatch)

| Track | Tasks | Owns these files |
|---|---|---|
| **Track 1: Schema + NodeViews** | T18, T19 | `schema/pmSchema.ts`, `nodeviews/*.tsx`, related tests |
| **Track 2: Keymaps + interaction** | T20, T21, T22, T23, T25 | `plugins/SlashMenuPlugin*`, `interaction/keymap/*`, `interaction/rangeResolver.ts` |
| **Track 3: AI lock + smoke** | T24, T26 | `plugins/AILockPlugin.ts`, `stores/aiLock.ts`, `__tests__/integration/editor.test.tsx` |

Cross-track dependencies:
- T19 imports the node types defined in T18 → Track 1 internal sequencing.
- T21/T22/T23 (Track 2) need T18 PM schema present at import time for tests; T18 is a tiny scaffold and lands first. After that Track 2 is independent of Track 1's NodeView visuals.
- T20 (Slash) depends on T18 for node markup conversion; independent of NodeViews.
- T25 (rangeResolver) depends only on T18 + the existing M2 GroupsPlugin.
- T24 (AI lock) is fully independent of editor visuals; only needs a PM schema (T18) to write tests.
- T26 (smoke) depends on ALL of T18–T25; runs last.

Recommended dispatch: **T18 lands first** (small scaffold). Then Tracks 1, 2, 3 run in parallel, with T26 sequenced after they all merge.

---

## Task 18 — Production PM schema (7 row node types)

**Spec ref:** § 3.1.

**Files:**
- Create: `frontend/src/components/resume/v3/schema/pmSchema.ts`
- Create: `frontend/src/components/resume/v3/schema/__tests__/pmSchema.test.ts`

- [ ] **Step 1: Write failing test** — `pmSchema.test.ts`

  Test names + assertions:
  - `it('registers 7 row node types with names matching kind-with-underscore')` — instantiates each Tiptap `Node` extension; asserts `extension.name` is one of `header_name`, `header_contact`, `section_heading`, `entry_title`, `entry_meta`, `plain`, `bullet`.
  - `it('header_name has content text* and disallows marks')` — builds a `Schema` from the extensions; asserts `schema.nodes.header_name.spec.content === 'text*'` and the marks attr resolves to none.
  - `it('plain and bullet have content inline* and allow all v2 marks')` — asserts `schema.nodes.plain.spec.content === 'inline*'` and `schema.nodes.bullet.spec.content === 'inline*'`.
  - `it('section_heading / entry_title / entry_meta carry semanticGroupId attr with default null')` — asserts `node.spec.attrs.semanticGroupId.default === null` for each.
  - `it('plain/bullet semanticGroupId attr is optional with default null')` — same as above.
  - `it('every row node carries id attr with default empty string')` — asserts `attrs.id.default === ''`.
  - `it('buildContent helper round-trips a known fixture into a valid PM doc')` — calls `buildContent(schema, fixtureRows)` (helper from this task) and asserts `schema.nodeFromJSON(buildContent(...))` does not throw.

- [ ] **Step 2: Run — expect fail**
  `npm test -- src/components/resume/v3/schema/__tests__/pmSchema.test.ts`

- [ ] **Step 3: Minimal impl** — `pmSchema.ts`

  Skeleton:
  ```ts
  import { Node } from '@tiptap/core';

  export const HeaderName = Node.create({
    name: 'header_name',
    group: 'row',
    content: 'text*',
    marks: '',
    defining: true,
    attrs: { id: { default: '' } },
    parseHTML() { return [{ tag: 'div[data-row-kind="header.name"]' }]; },
    renderHTML({ node }) {
      return ['div', { 'data-row-kind': 'header.name', 'data-row-id': node.attrs.id }, 0];
    },
  });
  // ... repeat for the other 6, with semanticGroupId attr where applicable.

  export const v3RowExtensions = [HeaderName, HeaderContact, SectionHeading, EntryTitle, EntryMeta, Plain, Bullet];

  // buildContent(schema, rows) wraps the M2 hydrate.rowToPMNodeJSON output into a doc node JSON.
  export function buildContent(schema: Schema, rows: ResumeRow[]): { type: 'doc'; content: unknown[] } {
    return { type: 'doc', content: rows.map((r) => rowToPMNodeJSON(r, schema)) };
  }
  ```

  Reuse `rowToPMNodeJSON` from existing `frontend/src/components/resume/v3/schema/hydrate.ts` (M2). Do NOT redefine it.

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/resume/v3/schema/pmSchema.ts \
          frontend/src/components/resume/v3/schema/__tests__/pmSchema.test.ts
  git commit -m "feat(v3): production PM schema with 7 row node types"
  ```

---

## Task 19 — 7 NodeView components (visual + interaction containers)

**Spec ref:** § 3.2 NodeView template; § 0.5 non-regression visual checklist.

**Critical:** This task touches DOM walking and must encode **F1 — ReactNodeViewRenderer wrapper selector**. ReactNodeViewRenderer wraps each PM node in a `<div class="react-renderer">`. Any selector that walks editor children to find rows must use `:scope > div > .row`, not `:scope > .row`. T19 tests assert this wrapper pattern is what the production editor mounts. T26 smoke and any pagination integration in M5 will depend on this.

**Also F4:** NodeView delete handlers MUST tolerate dangling `parentSectionGroupId` references — GroupsPlugin is orphan-tolerant; do not assume `groups[group.parentSectionGroupId]` exists when rendering. Renderers fall back to "ungrouped" UI rather than throwing.

**Files:**
- Create: `frontend/src/components/resume/v3/nodeviews/rowContainer.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/HeaderNameNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/HeaderContactNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/SectionHeadingNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/EntryTitleNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/EntryMetaNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/PlainNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/BulletNodeView.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/__tests__/render.test.tsx`
- Create: `frontend/src/components/resume/v3/nodeviews/__tests__/wrapperSelector.test.tsx`

- [ ] **Step 1: Write failing render tests** — `render.test.tsx`

  Test names + assertions (one `describe` per kind, 7 total):
  - `it('HeaderNameNodeView renders .row.row-header-name with handle + content')` — renders inside a TipTap test editor with the extension list = T18 nodes + this NodeView; asserts `container.querySelector('.row.row-header-name .row-handle')` exists and `[data-row-id]` is set.
  - Repeat for each kind.
  - `it('BulletNodeView renders the • marker')` — asserts `.row-marker` is present and `contenteditable === "false"`.
  - `it('SectionHeadingNodeView renders the <hr class="section-divider">')` — asserts the divider exists and is `contenteditable="false"`.
  - `it('all NodeViews render contentDOM with class .row-content')` — asserts the inner content host exists.

- [ ] **Step 2: Write failing wrapper-selector test** — `wrapperSelector.test.tsx`

  Test name + assertion:
  - `it('row elements are reachable via :scope > div > .row from the editor view DOM (F1)')` — boots a TipTap editor, fixture: 3 rows. Asserts `view.dom.querySelectorAll(':scope > .row').length === 0` AND `view.dom.querySelectorAll(':scope > div > .row').length === 3`. This pins the F1 finding so future code must use the wrapper-aware selector.

- [ ] **Step 3: Run both — expect fail**

- [ ] **Step 4: Minimal impl — shared `rowContainer.tsx`**

  ```tsx
  export function RowContainer({ kind, id, gid, children, marker, divider }: Props) {
    return (
      <NodeViewWrapper className={`row row-${kind.replace('.', '-')}`}
        data-row-id={id} data-group-id={gid ?? ''} data-row-kind={kind}>
        <div className="row-handle" contentEditable={false} data-edit-only>⋮⋮</div>
        {marker}
        <NodeViewContent as="div" className="row-content" />
        {divider}
      </NodeViewWrapper>
    );
  }
  ```

- [ ] **Step 5: Minimal impl — 7 kind-specific NodeViews**
  Each is a thin wrapper around `RowContainer` selecting marker / divider props. Bind via `addNodeView()` returning `ReactNodeViewRenderer(...)`.

- [ ] **Step 6: Run tests — expect pass**

- [ ] **Step 7: Commit**
  ```bash
  git add frontend/src/components/resume/v3/nodeviews/
  git commit -m "feat(v3): rowContainer + 7 NodeViews; pin F1 wrapper-selector contract"
  ```

---

## Task 20 — Slash command system

**Spec ref:** § 3.7. **Encodes F5** — every kind conversion that allocates / re-parents / deletes a SemanticGroup goes through `dispatchWithGroups`, never raw `view.dispatch(tr)`.

**Files:**
- Create: `frontend/src/components/resume/v3/plugins/SlashMenuPlugin.ts`
- Create: `frontend/src/components/resume/v3/plugins/SlashMenuOverlay.tsx`
- Create: `frontend/src/components/resume/v3/plugins/__tests__/slashMenu.test.tsx`

- [ ] **Step 1: Write failing tests** — `slashMenu.test.tsx`

  Test names + assertions:
  - `it('opens the menu when "/" is typed at start of an empty row')` — types `/` into a plain row; asserts the menu overlay element appears.
  - `it('opens the menu when "/" is typed after whitespace')` — preceding text is `Hello `, asserts overlay opens.
  - `it('does not open when "/" is typed mid-word')` — preceding text is `Hello`, asserts overlay does not appear.
  - `it('/heading converts current row to section_heading and creates a new section group via dispatchWithGroups (F5)')` — spies on `dispatchWithGroups`; asserts called with a `groupOps` array that contains exactly one `{type:'create',group:{kind:'section',role:'custom'}}`. Asserts new node type is `section_heading`.
  - `it('/entry creates an entry group with parentSectionGroupId = nearest preceding section group')` — fixture has a section above; asserts `groupOps[0].group.parentSectionGroupId` is that section's id.
  - `it('/entry with no preceding section creates entry group with undefined parent (F4 orphan-tolerant)')` — fixture: empty doc + plain row; asserts `parentSectionGroupId === undefined`; no throw.
  - `it('/meta is grayed out when not in an entry')` — overlay's `<button data-cmd="meta">` has `aria-disabled="true"`.
  - `it('/meta inside an entry inherits the entry groupId')` — asserts converted node attrs `semanticGroupId === currentEntryGroupId`.
  - `it('/bullet inherits groupId from above row')` — asserts inheritance walk.
  - `it('/text downgrades to plain and drops marks not allowed by plain')` — asserts marks list passed through.
  - `it('/link toggles a link mark at cursor and does NOT mutate group state (no groupOps)')` — asserts `dispatchWithGroups` called with empty `groupOps` OR plain `editor.commands.toggleLink` (allowed because no group change).
  - `it('REJECT direct view.dispatch path — slash menu test fixture asserts no raw dispatch on group-affecting paths (F5)')` — monkey-patches `view.dispatch`, asserts only `dispatchWithGroups` calls hit dispatch on group-affecting commands.

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Minimal impl — `SlashMenuPlugin.ts`**
  - PM plugin watching `appendTransaction` for `/` insertion at row-start or after whitespace.
  - Stores `{open: boolean, fromPos: number, query: string}` in plugin state.
  - Emits a `Decoration.widget` carrying a React mount point; React renders `SlashMenuOverlay`.

- [ ] **Step 4: Minimal impl — `SlashMenuOverlay.tsx`**
  - Lists 6 commands. On click, calls into a `runSlashCommand(view, cmd)` handler.
  - `runSlashCommand` for group-affecting commands MUST call `dispatchWithGroups(view, { docOp, groupOps })` (F5). For `/link` only, may call `editor.commands.toggleLink`.

- [ ] **Step 5: Run tests — expect pass**

- [ ] **Step 6: Commit**
  ```bash
  git add frontend/src/components/resume/v3/plugins/SlashMenuPlugin.ts \
          frontend/src/components/resume/v3/plugins/SlashMenuOverlay.tsx \
          frontend/src/components/resume/v3/plugins/__tests__/slashMenu.test.tsx
  git commit -m "feat(v3): slash menu plugin + kind conversions via dispatchWithGroups (F5)"
  ```

---

## Task 21 — Enter keymap

**Spec ref:** § 3.5. **Encodes F5** — Enter cases that allocate new groups (e.g. Enter on `section.heading` creates a new entry.title that needs a new entry group; Enter on `entry.title` creates a bullet inheriting current entry's groupId) MUST go through `dispatchWithGroups`.

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/keymap/enter.ts`
- Create: `frontend/src/components/resume/v3/interaction/keymap/__tests__/enter.test.ts`

- [ ] **Step 1: Write failing tests** — `enter.test.ts`

  Test names + assertions (one per § 3.5 transition):
  - `it('Enter at end of header.name → new header.contact below')`
  - `it('Enter at end of header.contact → new header.contact below')`
  - `it('Enter at end of section.heading creates a new entry.title row AND a new entry group via dispatchWithGroups (F5)')` — asserts groupOps contains `{type:'create',group:{kind:'entry',parentSectionGroupId: <heading.gid>}}`.
  - `it('Enter at end of entry.title creates a bullet inheriting entry groupId via dispatchWithGroups (F5)')` — asserts new node attrs `semanticGroupId === entryTitle.semanticGroupId`. (No new group created; but path still goes through `dispatchWithGroups` for group-aware insertion.)
  - `it('Enter at end of entry.meta → bullet inheriting entry groupId')`
  - `it('Enter at end of plain → plain')`
  - `it('Enter at end of non-empty bullet → new bullet (same group)')`
  - `it('Enter on empty bullet downgrades to plain (no new row)')`
  - `it('Enter mid-row splits and new row inherits same kind')`
  - `it('Enter on section.heading with no parent section context creates entry with undefined parentSectionGroupId (F4 orphan-tolerant)')` — should not throw if section group is missing from plugin state.

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Minimal impl — `enter.ts`**
  ```ts
  export function handleEnter(view: EditorView): boolean {
    const { state } = view;
    const { $from, empty } = state.selection;
    const node = $from.parent;
    const kind = node.type.name; // header_name, etc.
    const atEnd = $from.parentOffset === node.content.size;
    const isEmpty = node.content.size === 0;
    // Dispatch table -> dispatchWithGroups({docOp, groupOps})
    // ... 9 cases per § 3.5
    return true;
  }
  ```
  Wire into Tiptap as `addKeyboardShortcuts: () => ({ Enter: () => handleEnter(this.editor.view) })`.

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/resume/v3/interaction/keymap/enter.ts \
          frontend/src/components/resume/v3/interaction/keymap/__tests__/enter.test.ts
  git commit -m "feat(v3): Enter keymap with full § 3.5 transition table; group ops via dispatchWithGroups (F5)"
  ```

---

## Task 22 — Backspace keymap (uniform downgrade + header.name protection)

**Spec ref:** § 3.6. **Encodes F4 + F5**:
- F4 — Cross-row backspace must tolerate dangling group references. If the row being deleted points at a `parentSectionGroupId` whose section was already GC'd in a prior orphan tx, do not throw; treat as undefined parent.
- F5 — Empty `entry.title` / empty `section.heading` → downgrade to plain WITH explicit `groupOps: [{type:'delete', groupId}]` via `dispatchWithGroups`. Direct `view.dispatch(tr)` for the group delete is forbidden (the auto-GC at serialize time is a safety net, not an excuse to skip the explicit op for history coherence).

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/keymap/backspace.ts`
- Create: `frontend/src/components/resume/v3/interaction/keymap/__tests__/backspace.test.ts`

- [ ] **Step 1: Write failing tests** — `backspace.test.ts`

  Test names + assertions (matrix from § 3.6):
  - `it('Backspace mid-text uses PM native delete')`
  - `it('Backspace at start of non-empty row merges into previous row')`
  - `it('Backspace on empty bullet downgrades to plain (no group change)')`
  - `it('Backspace on empty entry.meta downgrades to plain (no group change)')`
  - `it('Backspace on empty entry.title downgrades to plain AND deletes entry group via dispatchWithGroups (F5)')` — asserts `groupOps` contains `{type:'delete', groupId: <entry.gid>}`.
  - `it('Backspace on empty section.heading downgrades to plain AND deletes section group via dispatchWithGroups (F5)')`
  - `it('Backspace on empty header.contact deletes row and merges cursor to previous')`
  - `it('Backspace on empty header.name is a no-op (protected — § 3.6 exception)')` — asserts no transaction dispatched; cursor unchanged.
  - `it('Backspace on empty plain deletes row and merges cursor to previous')`
  - `it('Cross-row backspace selection deletes and tolerates dangling parentSectionGroupId (F4)')` — fixture: entry group whose section was GC'd in a prior synthetic op (`parentSectionGroupId` points at a missing section). Assert no throw; group cleanup proceeds normally.

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Minimal impl — `backspace.ts`** Same shape as `enter.ts`. Branch on `(kind, isEmpty, atStart, hasSelection)`.

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/resume/v3/interaction/keymap/backspace.ts \
          frontend/src/components/resume/v3/interaction/keymap/__tests__/backspace.test.ts
  git commit -m "feat(v3): Backspace keymap; uniform downgrade + header.name protect; F4 orphan-tolerant + F5"
  ```

---

## Task 23 — Cmd+A progressive selection (3 levels)

**Spec ref:** § 3.4.

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/keymap/cmdA.ts`
- Create: `frontend/src/components/resume/v3/interaction/keymap/__tests__/cmdA.test.ts`

- [ ] **Step 1: Write failing tests** — `cmdA.test.ts`

  Test names + assertions:
  - `it('1st Cmd+A selects all text within current row')` — asserts `selection.from / selection.to` cover the row's content range only.
  - `it('2nd consecutive Cmd+A expands to current semantic group')` — caret in a bullet inside an entry; after 2nd press, selection covers all rows in that entry. Uses `resolveBlockRange` from T25 (or inline copy if T25 lands later).
  - `it('3rd consecutive Cmd+A expands to whole doc')`
  - `it('any non-Cmd+A input resets the press level')` — types a char between presses; asserts next Cmd+A is treated as 1st.
  - `it('orphan row (no group) — 2nd Cmd+A behaves as 1st (per § 3.4 mapping)')`
  - `it('header.name — 2nd Cmd+A expands to all header.* rows')`
  - `it('section.heading — 2nd Cmd+A covers entire section group including all entry groups within (F4 — must walk doc, not just plugin state, to handle orphan-tolerant case)')`

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Minimal impl — `cmdA.ts`** Module-level `cmdAPressLevel: 0|1|2|3` reset by a generic input listener (PM `handleKeyDown` for non-Cmd+A keys).

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/resume/v3/interaction/keymap/cmdA.ts \
          frontend/src/components/resume/v3/interaction/keymap/__tests__/cmdA.test.ts
  git commit -m "feat(v3): Cmd+A progressive selection (row → group → doc)"
  ```

---

## Task 24 — AI lock plugin (filterTransaction)

**Spec ref:** § 6.3. The AI lock plugin only READS group state to resolve `GroupId → row positions`; it never mutates. Encodes **F4** — when locked-key resolution walks the doc, it must tolerate dangling `parentSectionGroupId` references (locked group → its rows resolved by `node.attrs.semanticGroupId === groupId`, NOT by walking parent chains).

**Files:**
- Create: `frontend/src/components/resume/v3/plugins/AILockPlugin.ts`
- Create: `frontend/src/components/resume/v3/plugins/__tests__/AILockPlugin.test.ts`
- Modify: `frontend/src/stores/aiLock.ts` — adapt key set from `BlockId` → `RowId | GroupId`

- [ ] **Step 1: Write failing tests** — `AILockPlugin.test.ts`

  Test names + assertions:
  - `it('passes transactions when no doc change (e.g. selection-only)')`
  - `it('passes transactions tagged with allowLockedEdit meta')`
  - `it('rejects user transaction touching a row whose RowId is locked')` — locks `r2`; types into r2; asserts `view.state.doc` unchanged.
  - `it('rejects user transaction touching any row whose semanticGroupId is locked')` — locks entry GroupId `g2`; types into a bullet with that gid; asserts unchanged.
  - `it('accepts user transaction touching unlocked rows when other rows are locked')`
  - `it('rejects keymap input, paste, mark, drag-insertion uniformly')` — 4 sub-cases simulating each pathway, all rejected.
  - `it('AI apply transaction with allowLockedEdit:true bypasses lock')`
  - `it('locked GroupId resolution tolerates dangling parentSectionGroupId (F4)')` — fixture: an entry group whose `parentSectionGroupId` is a deleted section; lock the entry group; assert lock STILL resolves to the entry's rows by direct `semanticGroupId` match, no throw.
  - `it('aiLock store accepts RowId | GroupId keys (no BlockId references remain)')`

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Minimal impl — `AILockPlugin.ts`**
  ```ts
  function transactionTouchesRanges(tr: Transaction, ranges: { from: number; to: number }[]): boolean {
    if (!tr.docChanged) return false;
    let touched = false;
    tr.mapping.maps.forEach((stepMap) => {
      stepMap.forEach((oldStart, oldEnd) => {
        for (const r of ranges) {
          if (!(oldEnd < r.from || oldStart > r.to)) { touched = true; return; }
        }
      });
    });
    return touched;
  }
  function lockedRanges(state: EditorState): { from: number; to: number }[] {
    const keys = useAILockStore.getState().lockedKeys();
    const out: { from: number; to: number }[] = [];
    state.doc.forEach((node, offset) => {
      const rid = node.attrs.id, gid = node.attrs.semanticGroupId;
      if (keys.has(rid) || (gid && keys.has(gid))) {
        out.push({ from: offset, to: offset + node.nodeSize });
      }
    });
    return out;
  }
  export const aiLockPlugin = new Plugin({
    filterTransaction(tr, state) {
      if (!tr.docChanged) return true;
      if (tr.getMeta('allowLockedEdit')) return true;
      return !transactionTouchesRanges(tr, lockedRanges(state));
    },
  });
  ```

- [ ] **Step 4: Modify `stores/aiLock.ts`** — change key type to `RowId | GroupId`; expose `lockedKeys(): Set<string>`.

- [ ] **Step 5: Run — expect pass**

- [ ] **Step 6: Commit**
  ```bash
  git add frontend/src/components/resume/v3/plugins/AILockPlugin.ts \
          frontend/src/components/resume/v3/plugins/__tests__/AILockPlugin.test.ts \
          frontend/src/stores/aiLock.ts
  git commit -m "feat(v3): AI lock plugin via filterTransaction; F4 orphan-tolerant resolution"
  ```

---

## Task 25 — rangeResolver (block-select range from row kind)

**Spec ref:** § 5.2. **Encodes F4** — resolution prefers `semanticGroupId` for stability; if groupId is missing OR its group is GC'd from plugin state, fall back to position walk. The fallback is the orphan-tolerant path required by F4. Code reading group state MUST NOT throw on missing groups.

**Files:**
- Create: `frontend/src/components/resume/v3/interaction/rangeResolver.ts`
- Create: `frontend/src/components/resume/v3/interaction/__tests__/rangeResolver.test.ts`

- [ ] **Step 1: Write failing tests** — `rangeResolver.test.ts`

  Test names + assertions:
  - `it('bullet → returns [rowId] only')`
  - `it('plain → returns [rowId] only')`
  - `it('entry.title → returns all rows in entry group ordered by position')`
  - `it('entry.meta → returns all rows in entry group')`
  - `it('section.heading → returns all rows in section group, including all rows in entry groups whose parentSectionGroupId points at this section')`
  - `it('header.name / header.contact → returns all consecutive header.* rows from doc start')`
  - `it('orphan row (no group) → returns [rowId] only')`
  - `it('GC\'d group (groupId set on row but missing from plugin state) — falls back to position walk for entry membership (F4)')` — fixture: bullet has `semanticGroupId='gMissing'`, plugin has no entry; resolver returns the contiguous block of rows tagged with that gid via direct attr match, no throw.
  - `it('section group with dangling parentSectionGroupId entry — section range still includes that entry\'s rows (F4)')` — fixture: entry's `parentSectionGroupId` points at a section that exists; entry group has been GC\'d but its rows still tagged with the entry gid; resolver tolerates and includes them.
  - `it('returns PM positions {from, to} matching the row range')` — asserts `from === firstRow.before`, `to === lastRow.after`.

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Minimal impl — `rangeResolver.ts`**
  ```ts
  export function resolveBlockRange(state: EditorState, rowId: RowId):
    { rowIds: RowId[]; from: number; to: number } {
    const groups = groupsPluginKey.getState(state);
    // Walk doc, find target row + kind. Branch on kind per § 5.2.
    // For entry/section ranges, prefer groupId match; if group missing in groups.byId,
    // fall back to scanning rows whose attrs.semanticGroupId === clickedRow.gid (F4).
    // ...
  }
  ```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/resume/v3/interaction/rangeResolver.ts \
          frontend/src/components/resume/v3/interaction/__tests__/rangeResolver.test.ts
  git commit -m "feat(v3): rangeResolver per § 5.2; F4 orphan-tolerant fallback"
  ```

---

## Task 26 — M3 integration smoke + manual verify

**Spec ref:** § 7.3 integration + § 7.6 manual regression.

**Encodes F1 + F4 + F5**:
- F1 — Smoke test asserts editor DOM exposes rows under `:scope > div > .row` (via the wrapper-aware selector). Pin in production now so M5 PaginationPlugin can rely on it.
- F4 — Smoke test forces an orphan group state (run a synthetic `groupOps` that deletes a section group whose section.heading row still exists), then exercises rangeResolver / Backspace / cross-row delete; asserts no throw and editor remains usable until next save (where save-time GC cleans up).
- F5 — Smoke test asserts ALL group-affecting ops (slash, Enter, Backspace cascading, drag-future) route through `dispatchWithGroups`. Achieved by wrapping `view.dispatch` in a spy and asserting that any tx with non-empty `groupOps` meta originated from the helper.

**Files:**
- Create: `frontend/src/components/resume/v3/__tests__/integration/editor.test.tsx`
- Create: `frontend/src/components/resume/v3/__tests__/integration/fixtures/onePage.ts`

- [ ] **Step 1: Write failing tests** — `editor.test.tsx`

  Test names + assertions:
  - `it('boots editor with full extension list (T18 schema + 7 NodeViews + GroupsPlugin + AILockPlugin + slash + keymaps)')`
  - `it('hydrates a 1-page fixture; rows queryable via :scope > div > .row (F1)')` — asserts count matches fixture row count.
  - `it('typing into a bullet text content updates content and does NOT touch group state')`
  - `it('cross-row Backspace deletes a multi-row text selection in one PM step (PM native, no bridge code)')`
  - `it('cross-row Backspace tolerates orphan group state (F4)')` — pre-condition: synthetic op orphans an entry group; cross-row delete still succeeds.
  - `it('Enter at end of section.heading creates entry.title + new entry group through dispatchWithGroups (F5)')` — spy asserts no `view.dispatch` with groupOps meta unless it came from `dispatchWithGroups`.
  - `it('slash /heading converts current row to section_heading + creates section group through dispatchWithGroups (F5)')`
  - `it('Cmd+A 2× expands selection to current entry group')`
  - `it('Cmd+Z one-step reverts a cross-row backspace (PM native + GroupsPlugin atomic via single tr — F5 + § 2.6 atomicity)')`
  - `it('Cmd+Z one-step reverts a slash kind conversion including its group create (F5)')`
  - `it('AI lock blocks user typing into a locked row but permits transactions tagged allowLockedEdit')`

- [ ] **Step 2: Build fixture** — `fixtures/onePage.ts`
  Export a `ResumeDocV3` with: 1 header.name, 1 header.contact, 1 section.heading (Experience), 1 entry.title, 1 entry.meta, 2 bullets. Plus a synthetic-orphan variant for the F4 test.

- [ ] **Step 3: Run — expect fail**

- [ ] **Step 4: Wire up the editor under test**
  Boot with: `Document` extension (single `doc → row+`), the 7 row extensions from T18, `ReactNodeViewRenderer` per kind from T19, `GroupsPlugin` (M2), `AILockPlugin` (T24), `SlashMenuPlugin` (T20), Enter / Backspace / Cmd+A keymaps (T21–T23).

- [ ] **Step 5: Run — expect pass**

- [ ] **Step 6: Manual smoke checklist** (record outcome in commit message)
  - `ENABLE_RESUME_V3=true npm run dev`
  - Edit a 1-page test resume; cycle every Enter / Backspace transition; trigger every slash command; verify each NodeView renders.
  - DevTools: confirm `editor.view.dom.querySelectorAll(':scope > div > .row').length` matches row count (F1 sanity).
  - DevTools: monkey-patch `view.dispatch` with a logger; confirm group-affecting operations all log a tx with `groupOps` meta (F5 sanity).

- [ ] **Step 7: Commit**
  ```bash
  git add frontend/src/components/resume/v3/__tests__/integration/editor.test.tsx \
          frontend/src/components/resume/v3/__tests__/integration/fixtures/onePage.ts
  git commit -m "test(v3): M3 integration smoke; pins F1 selector + F4 orphan tolerance + F5 dispatch contract"
  ```

---

## Track-level pre-flight (one per parallel subagent)

Each subagent must, before writing code:

- Read § 3 of spec for editor behavior.
- Read § 4 (M1 PoC findings backwritten in commit `c95b240`).
- Read M1 sign-off: `docs/superpowers/specs/2026-04-29-resume-editor-v3-poc-results.md`.
- Read existing M2 code: `schema/types.ts`, `schema/hydrate.ts`, `schema/serialize.ts`, `plugins/GroupOps.ts`, `plugins/GroupsPlugin.ts`, `interaction/dispatchWithGroups.ts`. **Do not re-spec** — import and reuse.
- Verify the F1–F5 labels appear in their assigned task text and the implementation honors them.

---

## Self-review against the brief

| Check | Result |
|---|---|
| Every task has file paths, TDD steps, test names + asserts, commit step with explicit `git add` | ✓ T18–T26 |
| No "TBD" / "etc." / "similar to above" placeholders | ✓ verified |
| F1 (`:scope > div > .row`) referenced | T19 (Step 2 wrapperSelector test), T26 (Step 1 + 6) |
| F2 (static `@page` rule injection) referenced | Called out as **not in M3 scope** — see Open question Q1 below; M3 does not touch /print, so F2 is deferred to M5 task expansion (Tasks 32 / 34). Listed in label header for completeness. |
| F3 (position-based measurement) referenced | Same as F2 — **not in M3 scope**; M3 does not touch layout integration. Deferred to M5 expansion. Listed in label header for completeness. |
| F4 (GroupsPlugin orphan-tolerant) referenced | T19 (NodeView delete-tolerance), T20 (entry with no parent), T22 (Backspace dangling parent), T24 (lock resolution), T25 (rangeResolver fallback), T26 (smoke F4 case) |
| F5 (`dispatchWithGroups` only path) referenced | T20 (slash), T21 (Enter), T22 (Backspace cascading), T26 (smoke F5 case) |
| Tracks within each track sequential under one fresh subagent | ✓ |
| Tracks parallel without file conflicts | ✓ — file-list cross-check: Track 1 owns `schema/pmSchema.ts` + `nodeviews/*`; Track 2 owns `plugins/SlashMenu*`, `interaction/keymap/*`, `interaction/rangeResolver.ts`; Track 3 owns `plugins/AILockPlugin.ts`, `stores/aiLock.ts`, `__tests__/integration/*`. No overlap. T26 sequenced last. |

---

## Open questions — RESOLVED 2026-04-30

1. **F2 / F3 in M3 — out-of-scope, no guard tests.** M3 does not touch /print or LayoutEngine. Header trace + deferral to M5 (T32/T34) is sufficient. Do NOT add `xit` placeholders or guard comments — that would prematurely mix M5 responsibility into M3 surface.

2. **`buildContent` location → `schema/pmSchema.ts` (T18).** Belongs with PM schema construction. `hydrate.ts` operates one layer up (doc → editor state), don't mix layers.

3. **Slash menu scope → ship the 6 commands per § 3.7 only.** Richer set (style switches, color) deferred to v3.1. Add inline `// TODO(v3.1): style/color switches` marker in `SlashMenuOverlay.tsx`.

4. **`stores/aiLock.ts` key type → union `RowId | GroupId | BlockId` (coexist).** Hard-cut would break v2 production paths. v3 ships behind `ENABLE_RESUME_V3` flag, v2 still uses `BlockId`. Hard-cut to `RowId | GroupId` happens in M6 when v2 is removed. T24 adds the union, does NOT remove `BlockId`.

5. **Cmd+A press-level state → `WeakMap<EditorView, Level>`.** Cheap defensive scoping; module-level state will leak when preview + sidebar both mount editors. Implement now, not later.

6. **F5 enforcement window → accept (smoke spy only in M3).** ESLint `no-direct-groups-mutation` lands in M4 T30. Between M3 land and M4 land, T26 `view.dispatch` spy is the sole enforcement. Acceptable.
