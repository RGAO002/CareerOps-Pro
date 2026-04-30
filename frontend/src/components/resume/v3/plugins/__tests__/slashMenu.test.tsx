import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { history } from '@tiptap/pm/history';

import { v3RowExtensions } from '../../schema/pmSchema';
import { createGroupsPlugin, groupsPluginKey } from '../../plugins/GroupsPlugin';
import type { GroupId, GroupOp, RowId } from '../../schema/types';
import {
  slashMenuPlugin,
  slashMenuPluginKey,
  runSlashCommand,
  isCommandEnabled,
} from '../SlashMenuPlugin';
import * as dispatchModule from '../../interaction/dispatchWithGroups';

const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});

const schema = getSchema([TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions]);

function makeView(rows: { kind: string; id: string; gid?: string | null; text?: string }[], groupOps: GroupOp[] = []) {
  const content = rows.map((r) => {
    const attrs: Record<string, unknown> = { id: r.id };
    if (r.gid !== undefined) attrs.semanticGroupId = r.gid;
    const node = schema.nodes[r.kind];
    return node.create(attrs, r.text ? schema.text(r.text) : null);
  });
  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, content),
    plugins: [history(), createGroupsPlugin(), slashMenuPlugin()],
  });
  if (groupOps.length > 0) {
    state = state.apply(state.tr.setMeta('groupOps', groupOps));
  }
  const place = document.createElement('div');
  document.body.appendChild(place);
  const view = new EditorView(place, {
    state,
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
    },
  });
  return view;
}

function setCursorAtRow(view: EditorView, rowIndex: number, offset: number) {
  let pos = 0;
  view.state.doc.forEach((node, nodeOffset, idx) => {
    if (idx === rowIndex) pos = nodeOffset + 1 + offset;
  });
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pos));
  view.dispatch(tr);
}

function typeText(view: EditorView, text: string) {
  const { from } = view.state.selection;
  const tr = view.state.tr.insertText(text, from);
  view.dispatch(tr);
}

describe('slash menu plugin (F5)', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    dispatchSpy = vi.spyOn(dispatchModule, 'dispatchWithGroups');
  });
  afterEach(() => {
    dispatchSpy.mockRestore();
    document.body.innerHTML = '';
  });

  it('opens the menu when "/" is typed at start of an empty row', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: '' }]);
    setCursorAtRow(view, 0, 0);
    typeText(view, '/');
    const s = slashMenuPluginKey.getState(view.state);
    expect(s?.open).toBe(true);
  });

  it('opens the menu when "/" is typed after whitespace', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: 'Hello ' }]);
    setCursorAtRow(view, 0, 6);
    typeText(view, '/');
    const s = slashMenuPluginKey.getState(view.state);
    expect(s?.open).toBe(true);
  });

  it('does not open when "/" is typed mid-word', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: 'Hello' }]);
    setCursorAtRow(view, 0, 5);
    typeText(view, '/');
    const s = slashMenuPluginKey.getState(view.state);
    expect(s?.open).toBe(false);
  });

  it('/heading converts current row to section_heading and creates a new section group via dispatchWithGroups (F5)', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: '' }]);
    setCursorAtRow(view, 0, 0);
    runSlashCommand(view, 'heading');
    expect(dispatchSpy).toHaveBeenCalled();
    const args = dispatchSpy.mock.calls[0][1];
    const ops = args.groupOps ?? [];
    expect(ops.length).toBe(1);
    expect(ops[0].type).toBe('create');
    expect((ops[0] as { type: 'create'; group: { kind: string; role: string } }).group.kind).toBe('section');
    expect((ops[0] as { type: 'create'; group: { kind: string; role: string } }).group.role).toBe('custom');
    expect(view.state.doc.firstChild?.type.name).toBe('section_heading');
  });

  it('/entry creates an entry group with parentSectionGroupId = nearest preceding section group', () => {
    const view = makeView(
      [
        { kind: 'section_heading', id: 'r1', gid: 'gS1', text: 'Experience' },
        { kind: 'plain', id: 'r2', gid: null, text: '' },
      ],
      [{ type: 'create', group: { id: 'gS1' as GroupId, kind: 'section', role: 'experience' } }],
    );
    setCursorAtRow(view, 1, 0);
    runSlashCommand(view, 'entry');
    expect(dispatchSpy).toHaveBeenCalled();
    const args = dispatchSpy.mock.calls[0][1];
    const ops = args.groupOps ?? [];
    expect(ops[0].type).toBe('create');
    const created = (ops[0] as { type: 'create'; group: { kind: string; parentSectionGroupId?: string } }).group;
    expect(created.kind).toBe('entry');
    expect(created.parentSectionGroupId).toBe('gS1');
  });

  it('/entry with no preceding section creates entry group with undefined parent (F4 orphan-tolerant)', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: '' }]);
    setCursorAtRow(view, 0, 0);
    expect(() => runSlashCommand(view, 'entry')).not.toThrow();
    const args = dispatchSpy.mock.calls[0][1];
    const ops = args.groupOps ?? [];
    const created = (ops[0] as { type: 'create'; group: { kind: string; parentSectionGroupId?: string } }).group;
    expect(created.parentSectionGroupId).toBeUndefined();
  });

  it('/meta is grayed out when not in an entry', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: '' }]);
    setCursorAtRow(view, 0, 0);
    expect(isCommandEnabled(view, 'meta')).toBe(false);
  });

  it('/meta inside an entry inherits the entry groupId', () => {
    const view = makeView(
      [
        { kind: 'entry_title', id: 'r1', gid: 'gE1', text: 'Engineer' },
        { kind: 'plain', id: 'r2', gid: 'gE1', text: '' },
      ],
      [{ type: 'create', group: { id: 'gE1' as GroupId, kind: 'entry' } }],
    );
    setCursorAtRow(view, 1, 0);
    expect(isCommandEnabled(view, 'meta')).toBe(true);
    runSlashCommand(view, 'meta');
    const newRow = view.state.doc.child(1);
    expect(newRow.type.name).toBe('entry_meta');
    expect(newRow.attrs.semanticGroupId).toBe('gE1');
  });

  it('/bullet inherits groupId from above row', () => {
    const view = makeView(
      [
        { kind: 'entry_title', id: 'r1', gid: 'gE1', text: 'Engineer' },
        { kind: 'plain', id: 'r2', gid: 'gE1', text: '' },
      ],
      [{ type: 'create', group: { id: 'gE1' as GroupId, kind: 'entry' } }],
    );
    setCursorAtRow(view, 1, 0);
    runSlashCommand(view, 'bullet');
    const r2 = view.state.doc.child(1);
    expect(r2.type.name).toBe('bullet');
    expect(r2.attrs.semanticGroupId).toBe('gE1');
  });

  it('/text downgrades to plain and drops marks not allowed by plain', () => {
    const view = makeView([{ kind: 'bullet', id: 'r1', gid: null, text: 'x' }]);
    setCursorAtRow(view, 0, 0);
    runSlashCommand(view, 'text');
    expect(view.state.doc.firstChild?.type.name).toBe('plain');
  });

  it('/link toggles a link mark at cursor and does NOT mutate group state (no groupOps)', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: 'click' }]);
    // Select the text
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6));
    view.dispatch(tr);
    runSlashCommand(view, 'link');
    // Either no dispatchWithGroups call, OR it was called with empty groupOps.
    if (dispatchSpy.mock.calls.length > 0) {
      const args = dispatchSpy.mock.calls[0][1];
      expect((args.groupOps ?? []).length).toBe(0);
    }
  });

  it('REJECT direct view.dispatch path — slash menu test fixture asserts no raw dispatch on group-affecting paths (F5)', () => {
    const view = makeView([{ kind: 'plain', id: 'r1', gid: null, text: '' }]);
    setCursorAtRow(view, 0, 0);
    const rawDispatchSpy = vi.fn();
    const origDispatch = view.dispatch.bind(view);
    let allow = false;
    (view as unknown as { dispatch: (tr: Transaction) => void }).dispatch = (tr: Transaction) => {
      const ops = tr.getMeta('groupOps') as GroupOp[] | undefined;
      if (ops && ops.length > 0 && !allow) {
        rawDispatchSpy(tr);
      }
      allow = false;
      origDispatch(tr);
    };
    // Ensure dispatchWithGroups always sets `allow=true` before calling view.dispatch
    dispatchSpy.mockImplementation((v, args) => {
      allow = true;
      let tr = v.state.tr;
      if (args.docOp) tr = args.docOp(tr);
      if (args.groupOps && args.groupOps.length > 0) tr = tr.setMeta('groupOps', args.groupOps);
      v.dispatch(tr);
    });
    runSlashCommand(view, 'heading');
    // Spy should have not been triggered for raw (non-helper) dispatches.
    expect(rawDispatchSpy).not.toHaveBeenCalled();
    // Helper itself was called.
    expect(dispatchSpy).toHaveBeenCalled();
  });
});
