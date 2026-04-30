import type { EditorState } from '@tiptap/pm/state';
import type { GroupId, RowId } from '../schema/types';
import { groupsPluginKey } from '../plugins/GroupsPlugin';

// Spec ref: § 5.2 — resolve a click on a row to a block range.
// Encodes F4 — readers tolerate dangling parentSectionGroupId / GC'd group ids.
// Resolution prefers semanticGroupId for stability, falls back to direct attribute walks.

export interface BlockRange {
  rowIds: RowId[];
  from: number;
  to: number;
}

interface RowInfo {
  index: number;
  pos: number;
  node: import('@tiptap/pm/model').Node;
}

function findRow(state: EditorState, rowId: RowId): RowInfo | null {
  let found: RowInfo | null = null;
  state.doc.forEach((c, off, idx) => {
    if (found) return;
    if (c.attrs.id === rowId) found = { index: idx, pos: off, node: c };
  });
  return found;
}

function rowsToRange(state: EditorState, rows: RowInfo[]): BlockRange {
  const sorted = [...rows].sort((a, b) => a.pos - b.pos);
  const from = sorted[0]?.pos ?? 0;
  const last = sorted[sorted.length - 1];
  const to = last ? last.pos + last.node.nodeSize : 0;
  return {
    rowIds: sorted.map((r) => r.node.attrs.id as RowId),
    from,
    to,
  };
}

export function resolveBlockRange(state: EditorState, rowId: RowId): BlockRange {
  const target = findRow(state, rowId);
  if (!target) return { rowIds: [], from: 0, to: 0 };

  const kind = target.node.type.name;
  const targetGid = (target.node.attrs.semanticGroupId as string | null) ?? null;
  const groups = groupsPluginKey.getState(state);

  // header.name / header.contact -> all consecutive header.* rows from doc start.
  if (kind === 'header_name' || kind === 'header_contact') {
    const rows: RowInfo[] = [];
    state.doc.forEach((c, off, idx) => {
      if (c.type.name === 'header_name' || c.type.name === 'header_contact') {
        rows.push({ index: idx, pos: off, node: c });
      }
    });
    return rowsToRange(state, rows);
  }

  // bullet / plain -> just the row UNLESS… bullets are atomic per § 5.2 (single-row).
  if (kind === 'bullet' || kind === 'plain') {
    // F4 fallback: if the row has a gid that's missing from groups state, optionally
    // expand to siblings tagged with the same gid contiguous around target.
    if (targetGid && groups && !groups.byId.has(targetGid as GroupId)) {
      // Orphan group — walk by attribute.
      const rows: RowInfo[] = [];
      state.doc.forEach((c, off, idx) => {
        if ((c.attrs.semanticGroupId as string | null) === targetGid) {
          rows.push({ index: idx, pos: off, node: c });
        }
      });
      return rowsToRange(state, rows);
    }
    return rowsToRange(state, [target]);
  }

  // entry.title / entry.meta -> all rows in the entry group (by gid attr walk).
  if (kind === 'entry_title' || kind === 'entry_meta') {
    if (!targetGid) return rowsToRange(state, [target]);
    const rows: RowInfo[] = [];
    state.doc.forEach((c, off, idx) => {
      if ((c.attrs.semanticGroupId as string | null) === targetGid) {
        rows.push({ index: idx, pos: off, node: c });
      }
    });
    return rowsToRange(state, rows);
  }

  // section.heading -> heading + all rows whose gid is the section gid OR an entry group
  // with parentSectionGroupId === sectionGid. F4: tolerate missing groups + walk by parentSectionGroupId.
  if (kind === 'section_heading') {
    if (!targetGid) return rowsToRange(state, [target]);
    const sectionGid = targetGid;

    // Collect entry gids from plugin state whose parent is sectionGid.
    const entryGidsForSection = new Set<string>();
    if (groups) {
      for (const [gid, g] of groups.byId.entries()) {
        if (g.kind === 'entry' && g.parentSectionGroupId === (sectionGid as GroupId)) {
          entryGidsForSection.add(gid as string);
        }
      }
    }

    // Walk doc starting at heading. Stop at next section_heading or header_*.
    const rows: RowInfo[] = [];
    let started = false;
    let stopped = false;
    state.doc.forEach((c, off, idx) => {
      if (stopped) return;
      if (idx < target.index) return;
      if (idx === target.index) {
        rows.push({ index: idx, pos: off, node: c });
        started = true;
        return;
      }
      if (!started) return;
      if (c.type.name === 'section_heading' || c.type.name === 'header_name' || c.type.name === 'header_contact') {
        stopped = true;
        return;
      }
      const cgid = (c.attrs.semanticGroupId as string | null) ?? null;
      const inSection =
        cgid === sectionGid ||
        (cgid !== null && entryGidsForSection.has(cgid)) ||
        // F4: orphan entry group — gid is set but missing from plugin state. Include it
        // since it must belong to *some* section and we're between two heading boundaries.
        (cgid !== null && groups != null && !groups.byId.has(cgid as GroupId));
      if (inSection) {
        rows.push({ index: idx, pos: off, node: c });
      } else {
        // Stop on first non-matching row to avoid pulling in trailing unrelated rows.
        stopped = true;
      }
    });
    return rowsToRange(state, rows);
  }

  return rowsToRange(state, [target]);
}
