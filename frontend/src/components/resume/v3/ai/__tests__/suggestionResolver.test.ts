import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { EditorState } from '@tiptap/pm/state';
import { history } from '@tiptap/pm/history';

import { v3RowExtensions } from '../../schema/pmSchema';
import { createGroupsPlugin } from '../../plugins/GroupsPlugin';
import type { GroupId, GroupOp, RowId } from '../../schema/types';
import type { AITarget } from '../aiTargetTypes';
import { resolveTarget } from '../suggestionResolver';

const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});
const schema = getSchema([TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions]);

function makeState(
  rows: { kind: string; id: string; gid?: string | null; text?: string }[],
  groupOps: GroupOp[] = [],
): EditorState {
  const content = rows.map((r) => {
    const attrs: Record<string, unknown> = { id: r.id };
    if (r.gid !== undefined) attrs.semanticGroupId = r.gid;
    return schema.nodes[r.kind].create(attrs, r.text ? schema.text(r.text) : null);
  });
  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, content),
    plugins: [history(), createGroupsPlugin()],
  });
  if (groupOps.length > 0) state = state.apply(state.tr.setMeta('groupOps', groupOps));
  return state;
}

describe('suggestionResolver.resolveTarget (§ 6.2)', () => {
  it('resolves document target to {from: 0, to: doc.content.size}', () => {
    const state = makeState([{ kind: 'plain', id: 'r1', gid: null, text: 'a' }]);
    const r = resolveTarget({ kind: 'document' } as AITarget, state);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.from).toBe(0);
    expect(r.to).toBe(state.doc.content.size);
  });

  it('resolves selection target to provided from/to clamped to doc bounds', () => {
    const state = makeState([{ kind: 'plain', id: 'r1', gid: null, text: 'abc' }]);
    const max = state.doc.content.size;
    const r = resolveTarget({ kind: 'selection', from: 1, to: 3 }, state);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.from).toBe(1);
    expect(r.to).toBe(3);

    const r2 = resolveTarget({ kind: 'selection', from: -10, to: 9999 }, state);
    expect(r2.status).toBe('ok');
    if (r2.status !== 'ok') return;
    expect(r2.from).toBe(0);
    expect(r2.to).toBe(max);

    // Reversed selection — clamped & ordered.
    const r3 = resolveTarget({ kind: 'selection', from: 5, to: 2 }, state);
    expect(r3.status).toBe('ok');
    if (r3.status !== 'ok') return;
    expect(r3.from).toBeLessThanOrEqual(r3.to);
  });

  it('resolves row target by rowId match → {from, to, rowIds: [rowId]}', () => {
    const state = makeState([
      { kind: 'plain', id: 'r1', gid: null, text: 'a' },
      { kind: 'plain', id: 'r2', gid: null, text: 'b' },
    ]);
    const r = resolveTarget({ kind: 'row', rowId: 'r2' as RowId }, state);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.rowIds).toEqual(['r2']);
    // r2 is the second top-level node; its `from` should be the size of r1.
    let expectedFrom = 0;
    state.doc.forEach((c, off, idx) => {
      if (idx === 1) expectedFrom = off;
    });
    expect(r.from).toBe(expectedFrom);
    let r2Node: any = null;
    state.doc.forEach((c, _off, idx) => {
      if (idx === 1) r2Node = c;
    });
    expect(r.to).toBe(expectedFrom + r2Node.nodeSize);
  });

  it('row target with stale rowId AND no groupId fallback → stale', () => {
    const state = makeState([{ kind: 'plain', id: 'r1', gid: null, text: 'a' }]);
    const r = resolveTarget({ kind: 'row', rowId: 'missing' as RowId }, state);
    expect(r.status).toBe('stale');
  });

  it('row target with stale rowId BUT groupId fallback hits → resolves to head row of that group', () => {
    const state = makeState(
      [
        { kind: 'entry_title', id: 'r1', gid: 'gE', text: 'A' },
        { kind: 'bullet', id: 'r2', gid: 'gE', text: 'b' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    const r = resolveTarget(
      { kind: 'row', rowId: 'gone' as RowId, groupId: 'gE' as GroupId },
      state,
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    // Falls back to the head (first by position) row of the group.
    expect(r.rowIds).toEqual(['r1']);
  });

  it('resolves group target by groupId match → covers all rows in that group, ordered by position', () => {
    const state = makeState(
      [
        { kind: 'entry_title', id: 'r1', gid: 'gE', text: 'A' },
        { kind: 'entry_meta', id: 'r2', gid: 'gE', text: 'm' },
        { kind: 'bullet', id: 'r3', gid: 'gE', text: 'b' },
        { kind: 'plain', id: 'r4', gid: null, text: 'after' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    const r = resolveTarget({ kind: 'group', groupId: 'gE' as GroupId }, state);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.rowIds).toEqual(['r1', 'r2', 'r3']);
    expect(r.from).toBe(0);
    let lastEnd = 0;
    state.doc.forEach((c, off, idx) => {
      if (idx <= 2) lastEnd = off + c.nodeSize;
    });
    expect(r.to).toBe(lastEnd);
  });

  it('group target with stale groupId AND rowIds fallback hits → resolves to those rows', () => {
    const state = makeState([
      { kind: 'plain', id: 'r1', gid: null, text: 'a' },
      { kind: 'plain', id: 'r2', gid: null, text: 'b' },
      { kind: 'plain', id: 'r3', gid: null, text: 'c' },
    ]);
    const r = resolveTarget(
      {
        kind: 'group',
        groupId: 'gMissing' as GroupId,
        rowIds: ['r1' as RowId, 'r3' as RowId],
      },
      state,
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.rowIds).toEqual(['r1', 'r3']);
  });

  it('group target with stale groupId AND no rowIds → stale', () => {
    const state = makeState([{ kind: 'plain', id: 'r1', gid: null, text: 'a' }]);
    const r = resolveTarget({ kind: 'group', groupId: 'gMissing' as GroupId }, state);
    expect(r.status).toBe('stale');
  });

  it('group target where rowIds fallback returns rows out of contiguous order → still resolves to {from: firstRow.before, to: lastRow.after}', () => {
    const state = makeState([
      { kind: 'plain', id: 'r1', gid: null, text: 'a' },
      { kind: 'plain', id: 'r2', gid: null, text: 'b' },
      { kind: 'plain', id: 'r3', gid: null, text: 'c' },
      { kind: 'plain', id: 'r4', gid: null, text: 'd' },
    ]);
    // Pass rowIds in non-contiguous + reversed input order.
    const r = resolveTarget(
      {
        kind: 'group',
        groupId: 'gMissing' as GroupId,
        rowIds: ['r4' as RowId, 'r1' as RowId],
      },
      state,
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    // rowIds output is sorted by doc position.
    expect(r.rowIds).toEqual(['r1', 'r4']);
    // from = pos(r1), to = pos(r4) + r4.nodeSize
    let r1Pos = 0;
    let r4End = 0;
    state.doc.forEach((c, off, idx) => {
      if (idx === 0) r1Pos = off;
      if (idx === 3) r4End = off + c.nodeSize;
    });
    expect(r.from).toBe(r1Pos);
    expect(r.to).toBe(r4End);
  });

  it("F4 orphan-tolerant: group target with dangling parentSectionGroupId — still resolves via direct attr match", () => {
    // Section gS exists in plugin state, but entry group gE was GC'd.
    // A `group` target with groupId=gE should still resolve via attribute walk.
    const state = makeState(
      [
        { kind: 'section_heading', id: 'r1', gid: 'gS', text: 'Exp' },
        { kind: 'entry_title', id: 'r2', gid: 'gE', text: 'A' },
        { kind: 'bullet', id: 'r3', gid: 'gE', text: 'a' },
      ],
      [
        { type: 'create', group: { id: 'gS' as GroupId, kind: 'section', role: 'experience' } },
        // gE deliberately not registered — orphan in plugin state but rows still tagged.
      ],
    );
    const r = resolveTarget({ kind: 'group', groupId: 'gE' as GroupId }, state);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.rowIds).toEqual(['r2', 'r3']);
  });
});
