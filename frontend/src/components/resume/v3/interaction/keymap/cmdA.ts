import type { EditorView } from '@tiptap/pm/view';
import { AllSelection, TextSelection, type EditorState } from '@tiptap/pm/state';
import { groupsPluginKey } from '../../plugins/GroupsPlugin';
import type { GroupId } from '../../schema/types';

// Spec ref: § 3.4 — Cmd+A progressive selection.
// Per controller resolution (open question Q5): scope press level via WeakMap<EditorView, Level>
// to prevent leakage when multiple editors mount.

type Level = 0 | 1 | 2 | 3;
const pressLevels = new WeakMap<EditorView, Level>();

export function notePressBreak(view: EditorView): void {
  pressLevels.set(view, 0);
}

interface RowCtx {
  index: number;
  pos: number;
  node: import('@tiptap/pm/model').Node;
  kind: string;
  gid: string | null;
}

function rowAtSelection(view: EditorView): RowCtx | null {
  const { state } = view;
  const sel = state.selection;
  const $from = state.doc.resolve(sel.from);
  if ($from.depth < 1) return null;
  const node = $from.node(1);
  const before = $from.before(1);
  let idx = -1;
  state.doc.forEach((c, _o, i) => { if (c === node) idx = i; });
  return {
    index: idx,
    pos: before,
    node,
    kind: node.type.name,
    gid: (node.attrs.semanticGroupId as string | null) ?? null,
  };
}

function selectRowContent(view: EditorView, ctx: RowCtx): void {
  const from = ctx.pos + 1;
  const to = ctx.pos + 1 + ctx.node.content.size;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
}

function selectRange(view: EditorView, from: number, to: number): void {
  // FOLLOW-UP (file as ticket): when from/to land on node boundaries, PM emits
  // "endpoint not pointing into a node with inline content" stderr; PM clamps
  // gracefully so behavior is correct. Switching to TextSelection.between
  // requires updating boundary-position test assertions; deferred to T26 cleanup.
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
}

function selectWholeDoc(view: EditorView): void {
  // AllSelection avoids PM's "TextSelection endpoint not pointing into a node with
  // inline content" warning when anchoring at position 0.
  view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
}

// Find header range — all consecutive header_name / header_contact rows from doc start.
function headerRange(state: EditorState): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  state.doc.forEach((c, off) => {
    if (c.type.name === 'header_name' || c.type.name === 'header_contact') {
      if (from === -1) from = off;
      to = off + c.nodeSize;
    }
  });
  if (from === -1) return null;
  return { from, to };
}

// Entry-group range: rows tagged with `gid` (F4: walk attrs, not plugin state).
function groupAttrRange(state: EditorState, gid: string): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  state.doc.forEach((c, off) => {
    const cgid = c.attrs.semanticGroupId as string | null;
    if (cgid === gid) {
      if (from === -1) from = off;
      to = off + c.nodeSize;
    }
  });
  if (from === -1) return null;
  return { from, to };
}

// Section-group range: heading row + all rows whose semanticGroupId is the section gid OR
// an entry group whose parentSectionGroupId === sectionGid.
// F4: resolution walks doc attrs; plugin state used for parent lookup but missing groups don't throw.
function sectionRange(view: EditorView, sectionGid: string, headingIndex: number): { from: number; to: number } | null {
  const { state } = view;
  const groups = groupsPluginKey.getState(state);
  // Collect entry gids whose parent is sectionGid (from plugin state, tolerating missing).
  const entryGidsForSection = new Set<string>();
  if (groups) {
    for (const [gid, g] of groups.byId.entries()) {
      if (g.kind === 'entry' && g.parentSectionGroupId === (sectionGid as GroupId)) {
        entryGidsForSection.add(gid as string);
      }
    }
  }
  // F4 fallback: any row tagged with an unknown gid that appears between this heading and the next
  // heading is treated as belonging to this section.
  let from = -1;
  let to = -1;
  let stopped = false;
  state.doc.forEach((c, off, idx) => {
    if (stopped) return;
    if (idx < headingIndex) return;
    if (idx === headingIndex) {
      from = off;
      to = off + c.nodeSize;
      return;
    }
    // Stop at any other section_heading or header_* row.
    if (c.type.name === 'section_heading' || c.type.name === 'header_name' || c.type.name === 'header_contact') {
      stopped = true;
      return;
    }
    const cgid = (c.attrs.semanticGroupId as string | null) ?? null;
    const inSection =
      cgid === sectionGid ||
      (cgid !== null && entryGidsForSection.has(cgid)) ||
      (cgid !== null && groups != null && !groups.byId.has(cgid as GroupId)); // F4 orphan: include
    if (inSection) {
      to = off + c.nodeSize;
    } else {
      stopped = true;
    }
  });
  if (from === -1) return null;
  return { from, to };
}

export function handleCmdA(view: EditorView): boolean {
  const cur = pressLevels.get(view) ?? 0;
  const next = (cur + 1) as Level;
  pressLevels.set(view, next);

  const ctx = rowAtSelection(view);
  if (!ctx) return false;

  if (next === 1) {
    selectRowContent(view, ctx);
    return true;
  }

  if (next === 2) {
    // Group expansion.
    if (ctx.kind === 'header_name' || ctx.kind === 'header_contact') {
      const r = headerRange(view.state);
      if (r) selectRange(view, r.from, r.to);
      return true;
    }
    if (ctx.kind === 'section_heading') {
      const r = sectionRange(view, ctx.gid ?? '', ctx.index);
      if (r) selectRange(view, r.from, r.to);
      return true;
    }
    if (ctx.gid) {
      const r = groupAttrRange(view.state, ctx.gid);
      if (r) selectRange(view, r.from, r.to);
      return true;
    }
    // Orphan: behave as level 1 (no expansion).
    selectRowContent(view, ctx);
    // Decrement level so a 3rd press still goes to doc.
    pressLevels.set(view, 1);
    return true;
  }

  // next >= 3
  selectWholeDoc(view);
  return true;
}
