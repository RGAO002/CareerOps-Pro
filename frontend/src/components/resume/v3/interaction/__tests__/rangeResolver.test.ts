import { describe, it, expect, afterEach } from 'vitest';
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
import { resolveBlockRange } from '../rangeResolver';

const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});
const schema = getSchema([TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions]);

function makeState(rows: { kind: string; id: string; gid?: string | null; text?: string }[], groupOps: GroupOp[] = []): EditorState {
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

describe('rangeResolver (§ 5.2)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('bullet -> returns [rowId] only', () => {
    const state = makeState([
      { kind: 'plain', id: 'r0', gid: null, text: 'a' },
      { kind: 'bullet', id: 'r1', gid: null, text: 'b' },
    ]);
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(r.rowIds).toEqual(['r1']);
  });

  it('plain -> returns [rowId] only', () => {
    const state = makeState([{ kind: 'plain', id: 'r1', gid: null, text: 'a' }]);
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(r.rowIds).toEqual(['r1']);
  });

  it('entry.title -> returns all rows in entry group ordered by position', () => {
    const state = makeState(
      [
        { kind: 'entry_title', id: 'r1', gid: 'gE', text: 'X' },
        { kind: 'entry_meta', id: 'r2', gid: 'gE', text: 'm' },
        { kind: 'bullet', id: 'r3', gid: 'gE', text: 'b' },
        { kind: 'plain', id: 'r4', gid: null, text: 'after' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(r.rowIds).toEqual(['r1', 'r2', 'r3']);
  });

  it('entry.title includes empty plain rows when they carry the entry group id', () => {
    const state = makeState(
      [
        { kind: 'entry_title', id: 'r1', gid: 'gE', text: 'X' },
        { kind: 'plain', id: 'r2', gid: 'gE' },
        { kind: 'bullet', id: 'r3', gid: 'gE', text: 'b' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(r.rowIds).toEqual(['r1', 'r2', 'r3']);
  });

  it('entry.meta -> returns all rows in entry group', () => {
    const state = makeState(
      [
        { kind: 'entry_title', id: 'r1', gid: 'gE', text: 'X' },
        { kind: 'entry_meta', id: 'r2', gid: 'gE', text: 'm' },
        { kind: 'bullet', id: 'r3', gid: 'gE', text: 'b' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    const r = resolveBlockRange(state, 'r2' as RowId);
    expect(r.rowIds).toEqual(['r1', 'r2', 'r3']);
  });

  it('section.heading -> returns all rows in section group, including all rows in entry groups whose parentSectionGroupId points at this section', () => {
    const state = makeState(
      [
        { kind: 'section_heading', id: 'r1', gid: 'gS', text: 'Exp' },
        { kind: 'entry_title', id: 'r2', gid: 'gE1', text: 'A' },
        { kind: 'bullet', id: 'r3', gid: 'gE1', text: 'a1' },
        { kind: 'entry_title', id: 'r4', gid: 'gE2', text: 'B' },
        { kind: 'plain', id: 'r5', gid: null, text: 'unrelated' },
      ],
      [
        { type: 'create', group: { id: 'gS' as GroupId, kind: 'section', role: 'experience' } },
        { type: 'create', group: { id: 'gE1' as GroupId, kind: 'entry', parentSectionGroupId: 'gS' as GroupId } },
        { type: 'create', group: { id: 'gE2' as GroupId, kind: 'entry', parentSectionGroupId: 'gS' as GroupId } },
      ],
    );
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(r.rowIds).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('section.heading includes empty plain rows when they carry an entry group id', () => {
    const state = makeState(
      [
        { kind: 'section_heading', id: 'r1', gid: 'gS', text: 'Exp' },
        { kind: 'entry_title', id: 'r2', gid: 'gE', text: 'A' },
        { kind: 'plain', id: 'r3', gid: 'gE' },
        { kind: 'bullet', id: 'r4', gid: 'gE', text: 'a' },
      ],
      [
        { type: 'create', group: { id: 'gS' as GroupId, kind: 'section', role: 'experience' } },
        { type: 'create', group: { id: 'gE' as GroupId, kind: 'entry', parentSectionGroupId: 'gS' as GroupId } },
      ],
    );
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(r.rowIds).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('header.name / header.contact -> returns all consecutive header.* rows from doc start', () => {
    const state = makeState([
      { kind: 'header_name', id: 'r1', text: 'J' },
      { kind: 'header_contact', id: 'r2', text: 'a' },
      { kind: 'header_contact', id: 'r3', text: 'b' },
      { kind: 'plain', id: 'r4', gid: null, text: 'x' },
    ]);
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(r.rowIds).toEqual(['r1', 'r2', 'r3']);
    const r2 = resolveBlockRange(state, 'r3' as RowId);
    expect(r2.rowIds).toEqual(['r1', 'r2', 'r3']);
  });

  it('orphan row (no group) -> returns [rowId] only', () => {
    const state = makeState([{ kind: 'plain', id: 'r1', gid: null, text: 'x' }]);
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(r.rowIds).toEqual(['r1']);
  });

  it("GC'd group (groupId set on row but missing from plugin state) — falls back to position walk for entry membership (F4)", () => {
    // bullet has gMissing, no entry group in plugin state; another row also tagged gMissing.
    const state = makeState([
      { kind: 'bullet', id: 'r1', gid: 'gMissing', text: 'a' },
      { kind: 'bullet', id: 'r2', gid: 'gMissing', text: 'b' },
      { kind: 'plain', id: 'r3', gid: null, text: 'c' },
    ]);
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(() => resolveBlockRange(state, 'r1' as RowId)).not.toThrow();
    expect(r.rowIds).toContain('r1');
    expect(r.rowIds).toContain('r2');
    expect(r.rowIds).not.toContain('r3');
  });

  it("section group with dangling parentSectionGroupId entry — section range still includes that entry's rows (F4)", () => {
    const state = makeState(
      [
        { kind: 'section_heading', id: 'r1', gid: 'gS', text: 'Exp' },
        { kind: 'entry_title', id: 'r2', gid: 'gE', text: 'A' },
        { kind: 'bullet', id: 'r3', gid: 'gE', text: 'a' },
      ],
      [
        { type: 'create', group: { id: 'gS' as GroupId, kind: 'section', role: 'experience' } },
        // entry group gE was GC'd from plugin state — synthetic orphan; rows still tagged with it.
      ],
    );
    expect(() => resolveBlockRange(state, 'r1' as RowId)).not.toThrow();
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(r.rowIds).toContain('r2');
    expect(r.rowIds).toContain('r3');
  });

  it('returns PM positions {from, to} matching the row range', () => {
    const state = makeState(
      [
        { kind: 'entry_title', id: 'r1', gid: 'gE', text: 'X' },
        { kind: 'bullet', id: 'r2', gid: 'gE', text: 'b' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    const r = resolveBlockRange(state, 'r1' as RowId);
    expect(r.from).toBe(0);
    let lastEnd = 0;
    state.doc.forEach((c, off) => { lastEnd = off + c.nodeSize; });
    expect(r.to).toBe(lastEnd);
  });
});
