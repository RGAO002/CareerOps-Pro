import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { handleBackspace } from '../backspace';
import * as dispatchModule from '../../dispatchWithGroups';

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
function placeAtStart(view: EditorView, rowIndex: number) { placeCursor(view, rowIndex, 0); }

describe('Backspace keymap (§ 3.6)', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { dispatchSpy = vi.spyOn(dispatchModule, 'dispatchWithGroups'); });
  afterEach(() => { dispatchSpy.mockRestore(); document.body.innerHTML = ''; });

  it('Backspace mid-text uses PM native delete', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: 'hello' }]);
    placeCursor(view, 0, 3);
    const handled = handleBackspace(view);
    // Mid-text: handler returns false to let PM native delete.
    expect(handled).toBe(false);
  });

  it('Backspace at start of non-empty row merges into previous row', () => {
    const view = makeView([
      { kind: 'plain', id: 'r1', gid: null, text: 'foo' },
      { kind: 'plain', id: 'r2', gid: null, text: 'bar' },
    ]);
    placeAtStart(view, 1);
    expect(handleBackspace(view)).toBe(true);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.child(0).textContent).toBe('foobar');
  });

  it('Backspace on empty bullet downgrades to plain (no group change)', () => {
    const view = makeView([
      { kind: 'plain', id: 'r0', gid: null, text: 'x' },
      { kind: 'bullet', id: 'r1', gid: 'gE', text: '' },
    ]);
    placeAtStart(view, 1);
    handleBackspace(view);
    expect(view.state.doc.child(1).type.name).toBe('plain');
    // No group ops dispatched.
    if (dispatchSpy.mock.calls.length > 0) {
      expect((dispatchSpy.mock.calls[0][1].groupOps ?? []).length).toBe(0);
    }
  });

  it('Backspace on empty entry.meta downgrades to plain (no group change)', () => {
    const view = makeView([
      { kind: 'entry_title', id: 'r0', gid: 'gE', text: 'X' },
      { kind: 'entry_meta', id: 'r1', gid: 'gE', text: '' },
    ]);
    placeAtStart(view, 1);
    handleBackspace(view);
    expect(view.state.doc.child(1).type.name).toBe('plain');
  });

  it('Backspace on empty entry.title downgrades to plain AND deletes entry group via dispatchWithGroups (F5)', () => {
    const view = makeView(
      [
        { kind: 'plain', id: 'r0', gid: null, text: 'x' },
        { kind: 'entry_title', id: 'r1', gid: 'gE', text: '' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    placeAtStart(view, 1);
    handleBackspace(view);
    expect(dispatchSpy).toHaveBeenCalled();
    const ops = (dispatchSpy.mock.calls[0][1].groupOps ?? []) as GroupOp[];
    expect(ops.some((o) => o.type === 'delete' && (o as { type: 'delete'; groupId: string }).groupId === 'gE')).toBe(true);
    expect(view.state.doc.child(1).type.name).toBe('plain');
  });

  it('Backspace on empty section.heading downgrades to plain AND deletes section group via dispatchWithGroups (F5)', () => {
    const view = makeView(
      [
        { kind: 'plain', id: 'r0', gid: null, text: 'x' },
        { kind: 'section_heading', id: 'r1', gid: 'gS', text: '' },
      ],
      [{ type: 'create', group: { id: 'gS' as GroupId, kind: 'section', role: 'experience' } }],
    );
    placeAtStart(view, 1);
    handleBackspace(view);
    expect(dispatchSpy).toHaveBeenCalled();
    const ops = (dispatchSpy.mock.calls[0][1].groupOps ?? []) as GroupOp[];
    expect(ops.some((o) => o.type === 'delete' && (o as { type: 'delete'; groupId: string }).groupId === 'gS')).toBe(true);
    expect(view.state.doc.child(1).type.name).toBe('plain');
  });

  it('Backspace on empty header.contact deletes row and merges cursor to previous', () => {
    const view = makeView([
      { kind: 'header_name', id: 'r0', text: 'Jane' },
      { kind: 'header_contact', id: 'r1', text: '' },
    ]);
    placeAtStart(view, 1);
    handleBackspace(view);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.child(0).type.name).toBe('header_name');
  });

  it('Backspace on empty header.name is a no-op (protected — § 3.6 exception)', () => {
    const view = makeView([{ kind: 'header_name', id: 'r0', text: '' }]);
    placeAtStart(view, 0);
    const before = view.state;
    const handled = handleBackspace(view);
    expect(handled).toBe(true); // intercepted
    expect(view.state.doc).toBe(before.doc); // unchanged
  });

  it('Backspace on empty plain deletes row and merges cursor to previous', () => {
    const view = makeView([
      { kind: 'plain', id: 'r0', gid: null, text: 'first' },
      { kind: 'plain', id: 'r1', gid: null, text: '' },
    ]);
    placeAtStart(view, 1);
    handleBackspace(view);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.child(0).textContent).toBe('first');
  });

  it('Cross-row backspace selection deletes and tolerates dangling parentSectionGroupId (F4)', () => {
    // Synthetic orphan: entry group has parentSectionGroupId pointing at a section that was never created.
    const view = makeView(
      [
        { kind: 'plain', id: 'r0', gid: null, text: 'foo' },
        { kind: 'entry_title', id: 'r1', gid: 'gE', text: 'X' },
        { kind: 'plain', id: 'r2', gid: null, text: 'bar' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry', parentSectionGroupId: 'gMissing' as GroupId } }],
    );
    // Selection across rows.
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, view.state.doc.content.size - 2));
    view.dispatch(tr);
    expect(() => handleBackspace(view)).not.toThrow();
  });
});
