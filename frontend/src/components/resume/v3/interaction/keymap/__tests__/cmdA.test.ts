import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { history } from '@tiptap/pm/history';

import { v3RowExtensions } from '../../../schema/pmSchema';
import { createGroupsPlugin } from '../../../plugins/GroupsPlugin';
import type { GroupId, GroupOp } from '../../../schema/types';
import { handleCmdA, notePressBreak } from '../cmdA';

const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});
const schema = getSchema([TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions]);

function makeView(rows: { kind: string; id: string; gid?: string | null; text?: string }[], groupOps: GroupOp[] = []) {
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
  const place = document.createElement('div');
  document.body.appendChild(place);
  const view = new EditorView(place, {
    state,
    dispatchTransaction(tr) { view.updateState(view.state.apply(tr)); },
  });
  return view;
}

function placeCursor(view: EditorView, rowIndex: number, offsetInRow: number) {
  let pos = 1;
  view.state.doc.forEach((node, off, idx) => { if (idx === rowIndex) pos = off + 1 + offsetInRow; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

describe('Cmd+A progressive selection (§ 3.4)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('1st Cmd+A selects all text within current row', () => {
    const view = makeView([
      { kind: 'plain', id: 'r1', gid: null, text: 'first' },
      { kind: 'bullet', id: 'r2', gid: 'gE', text: 'task one' },
    ]);
    placeCursor(view, 1, 2);
    expect(handleCmdA(view)).toBe(true);
    const r1Size = view.state.doc.child(0).nodeSize;
    const r2 = view.state.doc.child(1);
    expect(view.state.selection.from).toBe(r1Size + 1);
    expect(view.state.selection.to).toBe(r1Size + 1 + r2.content.size);
  });

  it('2nd consecutive Cmd+A expands to current semantic group', () => {
    const view = makeView(
      [
        { kind: 'entry_title', id: 'r1', gid: 'gE', text: 'Engineer' },
        { kind: 'entry_meta', id: 'r2', gid: 'gE', text: '2020' },
        { kind: 'bullet', id: 'r3', gid: 'gE', text: 'a' },
        { kind: 'plain', id: 'r4', gid: null, text: 'after' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    placeCursor(view, 2, 0);
    handleCmdA(view);
    handleCmdA(view);
    // Group covers r1..r3.
    const r1Off = 0;
    const r3 = view.state.doc.child(2);
    let r3Off = 0;
    view.state.doc.forEach((c, off, i) => { if (i === 2) r3Off = off; });
    expect(view.state.selection.from).toBe(r1Off);
    expect(view.state.selection.to).toBe(r3Off + r3.nodeSize);
  });

  it('3rd consecutive Cmd+A expands to whole doc', () => {
    const view = makeView(
      [
        { kind: 'entry_title', id: 'r1', gid: 'gE', text: 'X' },
        { kind: 'bullet', id: 'r2', gid: 'gE', text: 'y' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    placeCursor(view, 1, 0);
    handleCmdA(view);
    handleCmdA(view);
    handleCmdA(view);
    expect(view.state.selection.from).toBe(0);
    expect(view.state.selection.to).toBe(view.state.doc.content.size);
  });

  it('any non-Cmd+A input resets the press level', () => {
    const view = makeView([
      { kind: 'entry_title', id: 'r1', gid: 'gE', text: 'X' },
      { kind: 'bullet', id: 'r2', gid: 'gE', text: 'y' },
    ], [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }]);
    placeCursor(view, 1, 0);
    handleCmdA(view); // level 1
    notePressBreak(view); // press break
    handleCmdA(view); // should be level 1 again, not 2
    const r2 = view.state.doc.child(1);
    let r2Off = 0;
    view.state.doc.forEach((c, off, i) => { if (i === 1) r2Off = off; });
    expect(view.state.selection.from).toBe(r2Off + 1);
    expect(view.state.selection.to).toBe(r2Off + 1 + r2.content.size);
  });

  it('orphan row (no group) — 2nd Cmd+A behaves as 1st (per § 3.4 mapping)', () => {
    const view = makeView([
      { kind: 'plain', id: 'r1', gid: null, text: 'first' },
      { kind: 'plain', id: 'r2', gid: null, text: 'orphan' },
    ]);
    placeCursor(view, 1, 0);
    handleCmdA(view); // row
    const sel1 = { from: view.state.selection.from, to: view.state.selection.to };
    handleCmdA(view); // for orphan: same as row (effectively no group expansion)
    const sel2 = { from: view.state.selection.from, to: view.state.selection.to };
    expect(sel2).toEqual(sel1);
  });

  it('header.name — 2nd Cmd+A expands to all header.* rows', () => {
    const view = makeView([
      { kind: 'header_name', id: 'r1', text: 'Jane' },
      { kind: 'header_contact', id: 'r2', text: 'a' },
      { kind: 'header_contact', id: 'r3', text: 'b' },
      { kind: 'plain', id: 'r4', gid: null, text: 'after' },
    ]);
    placeCursor(view, 0, 1);
    handleCmdA(view);
    handleCmdA(view);
    let r3End = 0;
    view.state.doc.forEach((c, off, i) => { if (i === 2) r3End = off + c.nodeSize; });
    expect(view.state.selection.from).toBe(0);
    expect(view.state.selection.to).toBe(r3End);
  });

  it('section.heading — 2nd Cmd+A covers entire section group including all entry groups within (F4 — must walk doc, not just plugin state)', () => {
    // Entry group has parentSectionGroupId pointing to a section that was GC'd (orphan).
    // Expected: section range still includes entry's rows via attribute walk.
    const view = makeView(
      [
        { kind: 'section_heading', id: 'r1', gid: 'gS', text: 'Experience' },
        { kind: 'entry_title', id: 'r2', gid: 'gE', text: 'Eng' },
        { kind: 'bullet', id: 'r3', gid: 'gE', text: 't' },
        { kind: 'plain', id: 'r4', gid: null, text: 'after' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry', parentSectionGroupId: 'gS' as GroupId } }],
      // Note: gS is NOT in groups state — F4 orphan-tolerant.
    );
    placeCursor(view, 0, 1);
    handleCmdA(view);
    handleCmdA(view);
    // Selection should cover r1..r3.
    let r3End = 0;
    view.state.doc.forEach((c, off, i) => { if (i === 2) r3End = off + c.nodeSize; });
    expect(view.state.selection.from).toBe(0);
    expect(view.state.selection.to).toBe(r3End);
  });
});
