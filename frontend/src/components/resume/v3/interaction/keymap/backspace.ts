import type { EditorView } from '@tiptap/pm/view';
import { TextSelection, type Transaction } from '@tiptap/pm/state';
import type { GroupId, GroupOp } from '../../schema/types';
import { dispatchWithGroups } from '../dispatchWithGroups';

// Spec ref: § 3.6 Backspace.
// Encodes F4 — code reading group state must tolerate dangling parentSectionGroupId.
// Encodes F5 — group deletes routed via dispatchWithGroups, never raw view.dispatch.

interface RowCtx {
  index: number;
  pos: number;
  node: import('@tiptap/pm/model').Node;
  kind: string;
  isEmpty: boolean;
  atStart: boolean;
  hasSelection: boolean;
}

function rowContext(view: EditorView): RowCtx | null {
  const { state } = view;
  const sel = state.selection;
  const $from = state.doc.resolve(sel.from);
  if ($from.depth < 1) return null;
  const node = $from.node(1);
  const before = $from.before(1);
  const offsetInRow = $from.parentOffset;
  let idx = -1;
  state.doc.forEach((c, _o, i) => { if (c === node) idx = i; });
  return {
    index: idx,
    pos: before,
    node,
    kind: node.type.name,
    isEmpty: node.content.size === 0,
    atStart: offsetInRow === 0,
    hasSelection: sel.from !== sel.to,
  };
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function handleBackspace(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection;
  const ctx = rowContext(view);
  if (!ctx) return false;

  // Cross-row selection — let PM native delete handle it (after F4 tolerance check).
  if (ctx.hasSelection) {
    // Resolve group state safely (F4) — do not throw on missing groups.
    try {
      // Native PM delete handles selection.
      const tr = state.tr.deleteSelection();
      view.dispatch(tr);
      return true;
    } catch {
      return false;
    }
  }

  // Mid-text: native PM.
  if (!ctx.atStart) return false;

  // At start of row.

  // Header.name protection: empty header.name backspace is a no-op.
  if (ctx.kind === 'header_name' && ctx.isEmpty) {
    return true;
  }
  // Even non-empty header.name backspace at start would normally merge with previous;
  // but header.name is the first row by spec, so no-op is appropriate.
  if (ctx.kind === 'header_name') {
    return true;
  }

  // Empty entry.title -> downgrade + delete entry group (F5).
  if (ctx.kind === 'entry_title' && ctx.isEmpty) {
    return downgradeToPlain(view, ctx, deleteGroupOp(ctx));
  }
  // Empty section.heading -> downgrade + delete section group (F5).
  if (ctx.kind === 'section_heading' && ctx.isEmpty) {
    return downgradeToPlain(view, ctx, deleteGroupOp(ctx));
  }
  // Empty bullet / entry.meta -> downgrade to plain (no group change).
  if ((ctx.kind === 'bullet' || ctx.kind === 'entry_meta') && ctx.isEmpty) {
    return downgradeToPlain(view, ctx, []);
  }

  // Empty plain or empty header.contact at row start: delete row and merge to previous.
  if (ctx.isEmpty) {
    if (ctx.index === 0) return true;
    const tr = state.tr.delete(ctx.pos, ctx.pos + ctx.node.nodeSize);
    // Place cursor at end of prev row.
    const prev = tr.doc.child(ctx.index - 1);
    let prevPos = 0;
    tr.doc.forEach((c, off, i) => { if (i === ctx.index - 1) prevPos = off; });
    tr.setSelection(TextSelection.create(tr.doc, prevPos + 1 + prev.content.size));
    view.dispatch(tr);
    return true;
  }

  // Non-empty row at start: merge with previous.
  if (ctx.index === 0) return true;
  const prev = state.doc.child(ctx.index - 1);
  let prevPos = 0;
  state.doc.forEach((c, off, i) => { if (i === ctx.index - 1) prevPos = off; });
  // Move text from current row to end of prev row, delete current row.
  const prevEnd = prevPos + 1 + prev.content.size;
  const fromInCurrent = ctx.pos + 1;
  const toInCurrent = ctx.pos + ctx.node.nodeSize - 1;
  let tr = state.tr;
  // Slice content of current row.
  const slice = state.doc.slice(fromInCurrent, toInCurrent);
  tr = tr.delete(ctx.pos, ctx.pos + ctx.node.nodeSize);
  tr = tr.insert(prevEnd, slice.content);
  tr.setSelection(TextSelection.create(tr.doc, prevEnd));
  view.dispatch(tr);
  return true;
}

function deleteGroupOp(ctx: RowCtx): GroupOp[] {
  const gid = ctx.node.attrs.semanticGroupId as string | null;
  if (!gid) return [];
  return [{ type: 'delete', groupId: gid as GroupId }];
}

function downgradeToPlain(view: EditorView, ctx: RowCtx, groupOps: GroupOp[]): boolean {
  const { state } = view;
  const plain = state.schema.nodes.plain;
  const newNode = plain.create({ id: ctx.node.attrs.id || makeId('r'), semanticGroupId: null }, null);
  const docOp = (tr: Transaction) => {
    tr.replaceWith(ctx.pos, ctx.pos + ctx.node.nodeSize, newNode);
    tr.setSelection(TextSelection.create(tr.doc, ctx.pos + 1));
    return tr;
  };
  if (groupOps.length > 0) {
    dispatchWithGroups(view, { docOp, groupOps });
  } else {
    let tr = state.tr;
    tr = docOp(tr);
    view.dispatch(tr);
  }
  return true;
}
