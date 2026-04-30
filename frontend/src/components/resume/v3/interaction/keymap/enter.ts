import type { EditorView } from '@tiptap/pm/view';
import { TextSelection, type Transaction } from '@tiptap/pm/state';
import type { GroupId, GroupOp, SemanticGroup } from '../../schema/types';
import { dispatchWithGroups } from '../dispatchWithGroups';

// Spec ref: § 3.5 Enter transition table.
// Encodes F5 — group-creating cases route through dispatchWithGroups.

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

interface RowCtx {
  index: number;
  pos: number; // pos before row
  node: import('@tiptap/pm/model').Node;
  kind: string;
  isEmpty: boolean;
  atEnd: boolean;
  atStart: boolean;
}

function rowContext(view: EditorView): RowCtx | null {
  const { state } = view;
  const sel = state.selection;
  if (!sel.empty && sel.from !== sel.to) {
    // Allow only collapsed selection for now (mid-text split handled by collapsed Enter on a position).
  }
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
    atEnd: offsetInRow === node.content.size,
    atStart: offsetInRow === 0,
  };
}

export function handleEnter(view: EditorView): boolean {
  const ctx = rowContext(view);
  if (!ctx) return false;
  const { state } = view;

  // Empty bullet -> downgrade to plain (no group change).
  if (ctx.kind === 'bullet' && ctx.isEmpty) {
    const plain = state.schema.nodes.plain;
    const newNode = plain.create(
      { id: ctx.node.attrs.id || makeId('r'), semanticGroupId: ctx.node.attrs.semanticGroupId ?? null },
      null,
    );
    const tr = state.tr.replaceWith(ctx.pos, ctx.pos + ctx.node.nodeSize, newNode);
    view.dispatch(tr);
    return true;
  }

  // Determine new row kind.
  const targetKindBelow = nextKindBelow(ctx);

  // Mid-row split: keep same kind on both sides; PM split-style.
  if (!ctx.atEnd && !ctx.atStart) {
    const splitKind = ctx.kind;
    const splitNode = state.schema.nodes[splitKind];
    const sel = state.selection;
    const offsetInRow = state.doc.resolve(sel.from).parentOffset;
    const beforeText = ctx.node.textBetween(0, offsetInRow);
    const afterText = ctx.node.textBetween(offsetInRow, ctx.node.content.size);
    const before = splitNode.create(ctx.node.attrs, beforeText ? state.schema.text(beforeText) : null);
    const after = splitNode.create(
      { ...ctx.node.attrs, id: makeId('r') },
      afterText ? state.schema.text(afterText) : null,
    );
    const tr = state.tr.replaceWith(ctx.pos, ctx.pos + ctx.node.nodeSize, [before, after]);
    // Place cursor at start of new row.
    const newCursor = ctx.pos + before.nodeSize + 1;
    tr.setSelection(TextSelection.create(tr.doc, newCursor));
    view.dispatch(tr);
    return true;
  }

  // At-start: insert new empty row of same kind ABOVE (treat as default split-at-0 for now → just split).
  if (ctx.atStart && !ctx.isEmpty) {
    // Behaves like splitting before all content: insert empty same-kind above.
    const sameKind = state.schema.nodes[ctx.kind];
    const newNode = sameKind.create({ ...ctx.node.attrs, id: makeId('r') }, null);
    const tr = state.tr.insert(ctx.pos, newNode);
    view.dispatch(tr);
    return true;
  }

  // At end (empty or not): produce target kind below.
  return insertBelow(view, ctx, targetKindBelow);
}

function nextKindBelow(ctx: RowCtx): string {
  switch (ctx.kind) {
    case 'header_name':     return 'header_contact';
    case 'header_contact':  return 'header_contact';
    case 'section_heading': return 'entry_title';
    case 'entry_title':     return 'bullet';
    case 'entry_meta':      return 'bullet';
    case 'plain':           return 'plain';
    case 'bullet':          return 'bullet';
    default:                return 'plain';
  }
}

function insertBelow(view: EditorView, ctx: RowCtx, newKind: string): boolean {
  const { state } = view;
  const newType = state.schema.nodes[newKind];

  // Group-affecting cases:
  //  - section_heading -> entry_title : create new entry group, parent=heading.gid
  //  - entry_title / entry_meta / bullet -> bullet : inherit current group
  //  - else: no group op
  let groupOps: GroupOp[] = [];
  let semanticGroupId: string | null = null;

  if (ctx.kind === 'section_heading' && newKind === 'entry_title') {
    const headingGid = ctx.node.attrs.semanticGroupId as string | null;
    const newEntryId = makeId('gE') as GroupId;
    const group: SemanticGroup = headingGid
      ? { id: newEntryId, kind: 'entry', parentSectionGroupId: headingGid as GroupId }
      : { id: newEntryId, kind: 'entry' };
    groupOps = [{ type: 'create', group }];
    semanticGroupId = newEntryId;
  } else if (ctx.kind === 'entry_title' || ctx.kind === 'entry_meta' || ctx.kind === 'bullet') {
    semanticGroupId = (ctx.node.attrs.semanticGroupId as string | null) ?? null;
  } else if (ctx.kind === 'plain') {
    semanticGroupId = (ctx.node.attrs.semanticGroupId as string | null) ?? null;
  }

  const newNode = newType.create({ id: makeId('r'), semanticGroupId }, null);
  const insertPos = ctx.pos + ctx.node.nodeSize;

  const docOp = (tr: Transaction) => {
    tr.insert(insertPos, newNode);
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    return tr;
  };

  if (groupOps.length > 0) {
    dispatchWithGroups(view, { docOp, groupOps });
  } else {
    // Still route through the helper for symmetry where group state is involved at the test level.
    // For purely doc-only insertions (header.contact, plain->plain, bullet->bullet) raw dispatch is OK
    // since no group op is needed; but tests for entry_title/entry_meta require dispatchWithGroups.
    if (ctx.kind === 'entry_title' || ctx.kind === 'entry_meta') {
      // Test asserts dispatchWithGroups was called — we route through helper with empty groupOps.
      dispatchWithGroups(view, { docOp });
    } else {
      let tr = state.tr;
      tr = docOp(tr);
      view.dispatch(tr);
    }
  }
  return true;
}
