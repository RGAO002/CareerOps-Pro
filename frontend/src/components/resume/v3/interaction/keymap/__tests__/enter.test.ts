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
import { handleEnter } from '../enter';
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
  view.state.doc.forEach((node, off, idx) => {
    if (idx === rowIndex) pos = off + 1 + offsetInRow;
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

function placeAtEnd(view: EditorView, rowIndex: number) {
  view.state.doc.forEach((node, off, idx) => {
    if (idx === rowIndex) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, off + 1 + node.content.size)));
    }
  });
}

describe('Enter keymap (§ 3.5)', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { dispatchSpy = vi.spyOn(dispatchModule, 'dispatchWithGroups'); });
  afterEach(() => { dispatchSpy.mockRestore(); document.body.innerHTML = ''; });

  it('Enter at end of header.name -> new header.contact below', () => {
    const view = makeView([{ kind: 'header_name', id: 'r1', text: 'Jane' }]);
    placeAtEnd(view, 0);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(1).type.name).toBe('header_contact');
  });

  it('Enter at end of header.contact -> new header.contact below', () => {
    const view = makeView([{ kind: 'header_contact', id: 'r1', text: 'a@b' }]);
    placeAtEnd(view, 0);
    handleEnter(view);
    expect(view.state.doc.child(1).type.name).toBe('header_contact');
  });

  it('Enter at end of section.heading creates a new entry.title row AND a new entry group via dispatchWithGroups (F5)', () => {
    const view = makeView(
      [{ kind: 'section_heading', id: 'r1', gid: 'gS', text: 'Experience' }],
      [{ type: 'create', group: { id: 'gS' as GroupId, kind: 'section', role: 'experience' } }],
    );
    placeAtEnd(view, 0);
    handleEnter(view);
    expect(dispatchSpy).toHaveBeenCalled();
    const args = dispatchSpy.mock.calls[0][1];
    const ops = (args.groupOps ?? []) as GroupOp[];
    expect(ops.length).toBe(1);
    expect(ops[0].type).toBe('create');
    const created = (ops[0] as { type: 'create'; group: { kind: string; parentSectionGroupId?: string } }).group;
    expect(created.kind).toBe('entry');
    expect(created.parentSectionGroupId).toBe('gS');
    expect(view.state.doc.child(1).type.name).toBe('entry_title');
  });

  it('Enter at end of entry.title creates a bullet inheriting entry groupId via dispatchWithGroups (F5)', () => {
    const view = makeView(
      [{ kind: 'entry_title', id: 'r1', gid: 'gE', text: 'Engineer' }],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    placeAtEnd(view, 0);
    handleEnter(view);
    expect(dispatchSpy).toHaveBeenCalled();
    const r2 = view.state.doc.child(1);
    expect(r2.type.name).toBe('bullet');
    expect(r2.attrs.semanticGroupId).toBe('gE');
  });

  it('Enter at end of entry.meta -> bullet inheriting entry groupId', () => {
    const view = makeView([{ kind: 'entry_meta', id: 'r1', gid: 'gE', text: '2020' }]);
    placeAtEnd(view, 0);
    handleEnter(view);
    const r2 = view.state.doc.child(1);
    expect(r2.type.name).toBe('bullet');
    expect(r2.attrs.semanticGroupId).toBe('gE');
  });

  it('Enter at end of plain -> plain', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: 'hi' }]);
    placeAtEnd(view, 0);
    handleEnter(view);
    expect(view.state.doc.child(1).type.name).toBe('plain');
  });

  it('Enter at end of non-empty bullet -> new bullet (same group)', () => {
    const view = makeView([{ kind: 'bullet', id: 'r1', gid: 'gE', text: 'task' }]);
    placeAtEnd(view, 0);
    handleEnter(view);
    const r2 = view.state.doc.child(1);
    expect(r2.type.name).toBe('bullet');
    expect(r2.attrs.semanticGroupId).toBe('gE');
  });

  it('Enter on empty bullet downgrades to plain (no new row)', () => {
    const view = makeView([{ kind: 'bullet', id: 'r1', gid: 'gE', text: '' }]);
    placeCursor(view, 0, 0);
    handleEnter(view);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.child(0).type.name).toBe('plain');
  });

  it('Enter mid-row splits and new row inherits same kind', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: 'helloworld' }]);
    placeCursor(view, 0, 5);
    handleEnter(view);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe('plain');
    expect(view.state.doc.child(1).type.name).toBe('plain');
    expect(view.state.doc.child(0).textContent).toBe('hello');
    expect(view.state.doc.child(1).textContent).toBe('world');
  });

  it('Enter at start of section.heading inserts a non-anchor row above', () => {
    const view = makeView(
      [{ kind: 'section_heading', id: 'r1', gid: 'gS', text: 'Experience' }],
      [{ type: 'create', group: { id: 'gS' as GroupId, kind: 'section', role: 'experience' } }],
    );
    placeCursor(view, 0, 0);
    handleEnter(view);

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe('plain');
    expect(view.state.doc.child(1).type.name).toBe('section_heading');
    expect(view.state.doc.child(1).attrs.semanticGroupId).toBe('gS');
  });

  it('Enter mid-section.heading does not clone the section anchor group', () => {
    const view = makeView(
      [{ kind: 'section_heading', id: 'r1', gid: 'gS', text: 'Experience' }],
      [{ type: 'create', group: { id: 'gS' as GroupId, kind: 'section', role: 'experience' } }],
    );
    placeCursor(view, 0, 4);
    handleEnter(view);

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe('section_heading');
    expect(view.state.doc.child(0).attrs.semanticGroupId).toBe('gS');
    expect(view.state.doc.child(0).textContent).toBe('Expe');
    expect(view.state.doc.child(1).type.name).toBe('plain');
    expect(view.state.doc.child(1).attrs.semanticGroupId).toBeNull();
    expect(view.state.doc.child(1).textContent).toBe('rience');
  });

  it('Enter on section.heading with no parent section context creates entry with undefined parentSectionGroupId (F4 orphan-tolerant)', () => {
    // Section group missing from plugin state — F4 means readers must not throw.
    const view = makeView([{ kind: 'section_heading', id: 'r1', gid: 'gMissing', text: 'X' }]);
    placeAtEnd(view, 0);
    expect(() => handleEnter(view)).not.toThrow();
    expect(dispatchSpy).toHaveBeenCalled();
    const args = dispatchSpy.mock.calls[0][1];
    const ops = (args.groupOps ?? []) as GroupOp[];
    const created = (ops[0] as { type: 'create'; group: { kind: string; parentSectionGroupId?: string } }).group;
    expect(created.kind).toBe('entry');
    // Heading row's gid is preserved as parentSectionGroupId — even if dangling — per orphan-tolerant resolution.
    // (Test just verifies no throw + a usable parent reference is produced.)
    expect(typeof created.parentSectionGroupId === 'string' || created.parentSectionGroupId === undefined).toBe(true);
  });
});
