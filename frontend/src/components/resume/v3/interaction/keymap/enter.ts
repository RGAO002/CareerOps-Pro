import type { EditorView } from '@tiptap/pm/view';
import { TextSelection, type Transaction } from '@tiptap/pm/state';
import type { GroupId, GroupOp, SemanticGroup } from '../../schema/types';
import { dispatchWithGroups } from '../dispatchWithGroups';

// Spec ref: § 3.5 Enter transition table.
// Encodes F5 — group-creating cases route through dispatchWithGroups.

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Centralized rule for any newly-created row's semanticGroupId.
//   - `plain` rows are SECTION-LEVEL INDEPENDENT paragraphs by design — they
//     never inherit any entry's gid. This fixes the "empty plain ends up
//     attached to wrong entry on save" bug class. Plain rows render in their
//     doc-order position regardless of gid (so a plain visually between two
//     bullets still appears between them); the gid was only ever used by
//     v3ToV2 to bucket bullets into entries, and that bucketing is what
//     made plains drift on save.
//   - All other row kinds (bullet, entry.title/meta, section.heading)
//     inherit gid from the calling context as before.
function gidForNewRow(newKind: string, inheritedGid: string | null): string | null {
  if (newKind === 'plain') return null;
  return inheritedGid;
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

const STRUCTURAL_ANCHOR_KINDS = new Set(['header_name', 'section_heading', 'entry_title', 'entry_meta']);

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
    atEnd: offsetInRow === node.content.size,
    atStart: offsetInRow === 0,
  };
}

export function handleEnter(view: EditorView): boolean {
  const { state } = view;
  // Do not run row-splitting logic over a range selection. The old path used
  // selection.from only, which could duplicate row content/anchors when Enter
  // was pressed with text selected across rows.
  if (!state.selection.empty) {
    view.dispatch(state.tr.deleteSelection());
    return true;
  }

  const ctx = rowContext(view);
  if (!ctx) return false;

  // Empty bullet -> downgrade to plain. New plain is independent (gid=null)
  // even though the bullet had an entry's gid — see gidForNewRow doc.
  if (ctx.kind === 'bullet' && ctx.isEmpty) {
    const plain = state.schema.nodes.plain;
    const newNode = plain.create(
      { id: ctx.node.attrs.id || makeId('r'), semanticGroupId: gidForNewRow('plain', ctx.node.attrs.semanticGroupId ?? null) },
      null,
    );
    const tr = state.tr.replaceWith(ctx.pos, ctx.pos + ctx.node.nodeSize, newNode);
    view.dispatch(tr);
    return true;
  }

  // Determine new row kind.
  const targetKindBelow = nextKindBelow(ctx);

  // Mid-row split. Plain/bullet rows split into the same row kind. Structural
  // anchor rows (section heading, entry title/meta, header name) must NOT clone
  // themselves with the same semanticGroupId: v3->v2 serialization treats those
  // rows as section/entry anchors, so duplicates can make PDF export repeat
  // whole sections. Continuation text becomes a safe editable row instead.
  if (!ctx.atEnd && !ctx.atStart) {
    const splitKind = ctx.kind;
    const continuationKind = continuationKindFor(ctx);
    const beforeNodeType = state.schema.nodes[splitKind];
    const afterNodeType = state.schema.nodes[continuationKind];
    const sel = state.selection;
    const offsetInRow = state.doc.resolve(sel.from).parentOffset;
    const beforeText = ctx.node.textBetween(0, offsetInRow);
    const afterText = ctx.node.textBetween(offsetInRow, ctx.node.content.size);
    const before = beforeNodeType.create(ctx.node.attrs, beforeText ? state.schema.text(beforeText) : null);
    const inheritedAfterGid = ctx.kind === 'section_heading' ? null : ctx.node.attrs.semanticGroupId ?? null;
    const afterGroupId = gidForNewRow(continuationKind, inheritedAfterGid);
    const after = afterNodeType.create(
      insertedAttrs(continuationKind, makeId('r'), afterGroupId),
      afterText ? state.schema.text(afterText) : null,
    );
    const tr = state.tr.replaceWith(ctx.pos, ctx.pos + ctx.node.nodeSize, [before, after]);
    // Place cursor at start of new row.
    const newCursor = ctx.pos + before.nodeSize + 1;
    tr.setSelection(TextSelection.create(tr.doc, newCursor));
    view.dispatch(tr);
    return true;
  }

  // At-start: insert a new row above. Structural anchor rows use a non-anchor
  // continuation kind to avoid duplicate section/entry anchors with the same
  // semanticGroupId.
  if (ctx.atStart && !ctx.isEmpty) {
    const newKind = STRUCTURAL_ANCHOR_KINDS.has(ctx.kind) ? continuationKindFor(ctx) : ctx.kind;
    const newType = state.schema.nodes[newKind];
    const inheritedGid = ctx.kind === 'section_heading' ? null : ctx.node.attrs.semanticGroupId ?? null;
    const newGroupId = gidForNewRow(newKind, inheritedGid);
    const newNode = newType.create(insertedAttrs(newKind, makeId('r'), newGroupId), null);
    const tr = state.tr.insert(ctx.pos, newNode);
    tr.setSelection(TextSelection.create(tr.doc, ctx.pos + 1));
    view.dispatch(tr);
    return true;
  }

  // At end (empty or not): produce target kind below.
  return insertBelow(view, ctx, targetKindBelow);
}

function continuationKindFor(ctx: RowCtx): string {
  switch (ctx.kind) {
    case 'header_name': return 'header_contact';
    case 'section_heading': return 'plain';
    case 'entry_title':
    case 'entry_meta':
      return 'plain';
    default:
      return ctx.kind;
  }
}

function insertedAttrs(kind: string, id: string, semanticGroupId: string | null): Record<string, unknown> {
  if (kind === 'plain' || kind === 'bullet' || kind === 'entry_title' || kind === 'entry_meta' || kind === 'section_heading') {
    return { id, semanticGroupId };
  }
  return { id };
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
  // Final filter: regardless of how we computed semanticGroupId above, if the
  // NEW row is a plain row, we strip its gid. plain rows are always
  // independent — see gidForNewRow doc.
  semanticGroupId = gidForNewRow(newKind, semanticGroupId);

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
