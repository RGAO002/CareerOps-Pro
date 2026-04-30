// Spec ref: § 6.2 — resolve an AITarget against the current doc to PM positions.
//
// Priority:
//   - document         → {from: 0, to: doc.content.size}, rowIds: []
//   - selection        → {from, to} clamped + ordered into [0, doc.content.size], rowIds: []
//   - group            → groupId attr walk; if no rows match, fall back to rowIds hint;
//                        if both miss → stale.
//   - row              → rowId match; if missing, fall back to head row (first by pos)
//                        of groupId hint; if both miss → stale.
//
// F4 orphan-tolerance: we deliberately walk the doc by attribute rather than
// consulting GroupsPlugin state, so a dangling parentSectionGroupId / GC'd group
// still resolves cleanly so long as rows still carry the attribute.

import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { RowId } from '../schema/types';
import type { AITarget, ResolvedTarget } from './aiTargetTypes';

interface RowHit {
  pos: number;
  node: PMNode;
}

function findRowsByGroupId(state: EditorState, groupId: string): RowHit[] {
  const rows: RowHit[] = [];
  state.doc.forEach((c, off) => {
    if ((c.attrs.semanticGroupId as string | null) === groupId) {
      rows.push({ pos: off, node: c });
    }
  });
  return rows;
}

function findRowById(state: EditorState, rowId: string): RowHit | null {
  let found: RowHit | null = null;
  state.doc.forEach((c, off) => {
    if (found) return;
    if (c.attrs.id === rowId) found = { pos: off, node: c };
  });
  return found;
}

function findRowsByIds(state: EditorState, rowIds: readonly string[]): RowHit[] {
  if (rowIds.length === 0) return [];
  const want = new Set(rowIds);
  const rows: RowHit[] = [];
  state.doc.forEach((c, off) => {
    if (want.has(c.attrs.id as string)) rows.push({ pos: off, node: c });
  });
  return rows;
}

function rowsToOk(rows: RowHit[]): ResolvedTarget {
  // Sorted by doc position.
  const sorted = [...rows].sort((a, b) => a.pos - b.pos);
  const from = sorted[0]!.pos;
  const last = sorted[sorted.length - 1]!;
  const to = last.pos + last.node.nodeSize;
  return {
    status: 'ok',
    from,
    to,
    rowIds: sorted.map((r) => r.node.attrs.id as RowId),
  };
}

export function resolveTarget(target: AITarget, state: EditorState): ResolvedTarget {
  switch (target.kind) {
    case 'document':
      return { status: 'ok', from: 0, to: state.doc.content.size, rowIds: [] };

    case 'selection': {
      const max = state.doc.content.size;
      let from = Math.max(0, Math.min(max, target.from));
      let to = Math.max(0, Math.min(max, target.to));
      if (from > to) [from, to] = [to, from];
      return { status: 'ok', from, to, rowIds: [] };
    }

    case 'group': {
      const direct = findRowsByGroupId(state, target.groupId as string);
      if (direct.length > 0) return rowsToOk(direct);
      // Fallback: rowIds hint.
      if (target.rowIds && target.rowIds.length > 0) {
        const hits = findRowsByIds(state, target.rowIds as unknown as string[]);
        if (hits.length > 0) return rowsToOk(hits);
      }
      return { status: 'stale' };
    }

    case 'row': {
      const direct = findRowById(state, target.rowId as string);
      if (direct) return rowsToOk([direct]);
      // Fallback: groupId hint → head row (first by pos) of that group.
      if (target.groupId !== undefined) {
        const groupRows = findRowsByGroupId(state, target.groupId as string);
        if (groupRows.length > 0) {
          const sorted = [...groupRows].sort((a, b) => a.pos - b.pos);
          return rowsToOk([sorted[0]!]);
        }
      }
      return { status: 'stale' };
    }
  }
}
