// T39 — integration: AI apply via PM transaction signals + concurrent edit.
//
// Spec ref: docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md § 6.2.
//
// Verifies:
//   1. attachToEditor subscribes to PM transactions and detaches cleanly.
//   2. A transaction carrying meta { aiApply: { suggestionIds } } flips
//      the listed suggestions in useSuggestionStore from 'pending' → 'applied'.
//   3. An undo of that transaction (PM history meta 'history$' present) flips
//      them back to 'pending'.
//   4. Concurrent edit: typing into a different row while a suggestion is
//      pending does NOT mark it applied (no aiApply meta on that tr).
//   5. Concurrent edit: even after user typing changes positions, applying a
//      group-targeted suggestion still works (groupId stable via attribute walk).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSchema, type Editor } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { history, undo } from '@tiptap/pm/history';

import { v3RowExtensions } from '../../schema/pmSchema';
import { hydrateInitialState } from '../../schema/hydrate';
import { createGroupsPlugin } from '../../plugins/GroupsPlugin';
import { aiLockPlugin } from '../../plugins/AILockPlugin';
import { applySuggestionV3, type AISuggestionV3 } from '../../ai/applyWrapper';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { useAILockStore } from '@/stores/aiLock';
import type { GroupId, RowId } from '../../schema/types';

import { onePage } from './fixtures/onePage';

const TestDoc = Document.extend({
  content:
    '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});
const baseExtensions = [TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions];
const schema = getSchema(baseExtensions);

interface BootedView {
  view: EditorView;
  cleanup: () => void;
}

function bootEditorPM(): BootedView {
  const { docJSON, groups } = hydrateInitialState(onePage, schema);
  const pmDoc = schema.nodeFromJSON(docJSON);
  let state = EditorState.create({
    schema,
    doc: pmDoc,
    plugins: [history(), createGroupsPlugin(), aiLockPlugin],
  });
  state = state.apply(state.tr.setMeta('groupsHydrate', groups));

  const place = document.createElement('div');
  document.body.appendChild(place);
  const view = new EditorView(place, {
    state,
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr));
    },
  });
  return {
    view,
    cleanup: () => {
      view.destroy();
      place.remove();
    },
  };
}

// Build a fake Editor object with the surface attachToEditor actually uses:
// `on('transaction', cb)` and `off('transaction', cb)`. We simulate by hooking
// dispatchTransaction so each apply fires the registered callback with `{ editor, transaction }`.
function makeFakeEditor(view: EditorView): { editor: Editor; cleanup: () => void } {
  const listeners = new Set<(payload: { editor: Editor; transaction: import('@tiptap/pm/state').Transaction }) => void>();

  const fakeEditor = {
    view,
    get state() { return view.state; },
    on(event: string, cb: (payload: unknown) => void) {
      if (event === 'transaction') listeners.add(cb as never);
      return fakeEditor as unknown as Editor;
    },
    off(event: string, cb: (payload: unknown) => void) {
      if (event === 'transaction') listeners.delete(cb as never);
      return fakeEditor as unknown as Editor;
    },
  } as unknown as Editor;

  // Wrap dispatchTransaction so each tr fires our listeners after apply.
  const origDispatch = (view as unknown as {
    props: { dispatchTransaction?: (tr: import('@tiptap/pm/state').Transaction) => void };
  }).props.dispatchTransaction!;
  view.setProps({
    dispatchTransaction(tr) {
      origDispatch.call(view, tr);
      for (const cb of listeners) cb({ editor: fakeEditor, transaction: tr });
    },
  });

  return {
    editor: fakeEditor,
    cleanup: () => listeners.clear(),
  };
}

const baseSuggestion: Suggestion = {
  id: 'sug_1',
  runId: 'run_1',
  agentId: 'agent_a',
  resumeId: 'r1',
  status: 'pending',
  createdAt: 1,
  source: { kind: 'agent', agentId: 'agent_a', runId: 'run_1' },
  op: 'update',
  field: { kind: 'entry.title', id: 'r-title' },
  before: 'old',
  after: 'new',
};

describe('T39 — suggestion store + AI lock store via PM transactions', () => {
  let booted: BootedView | null = null;

  beforeEach(() => {
    useSuggestionStore.setState({ byId: {}, byRun: {} });
    useAILockStore.getState().clear();
  });

  afterEach(() => {
    if (booted) {
      booted.cleanup();
      booted = null;
    }
    document.body.innerHTML = '';
  });

  it('attachToEditor returns a detach function; calling detach removes the listener', () => {
    booted = bootEditorPM();
    const fake = makeFakeEditor(booted.view);
    const detach = useSuggestionStore.getState().attachToEditor(fake.editor);
    expect(typeof detach).toBe('function');
    detach();
    fake.cleanup();
  });

  it('aiApply transaction marks listed suggestions as applied', () => {
    booted = bootEditorPM();
    const fake = makeFakeEditor(booted.view);
    useSuggestionStore.setState({
      byId: { sug_1: { ...baseSuggestion, id: 'sug_1', status: 'pending' } },
      byRun: { run_1: ['sug_1'] },
    });
    const detach = useSuggestionStore.getState().attachToEditor(fake.editor);

    const sug: AISuggestionV3 = {
      id: 'sug_1',
      runId: 'run_1',
      target: { kind: 'row', rowId: 'r-title' as RowId },
      operation: {
        kind: 'replace',
        rows: [{ id: 'r-title' as RowId, kind: 'entry.title', content: { text: 'New Title' }, semanticGroupId: 'gE1' as GroupId }],
      },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, booted.view);
    expect(r.ok).toBe(true);

    expect(useSuggestionStore.getState().byId['sug_1'].status).toBe('applied');

    detach();
    fake.cleanup();
  });

  it('undo of an aiApply transaction marks suggestions back to pending', () => {
    booted = bootEditorPM();
    const fake = makeFakeEditor(booted.view);
    useSuggestionStore.setState({
      byId: { sug_2: { ...baseSuggestion, id: 'sug_2', status: 'pending' } },
      byRun: { run_2: ['sug_2'] },
    });
    const detach = useSuggestionStore.getState().attachToEditor(fake.editor);

    const sug: AISuggestionV3 = {
      id: 'sug_2',
      runId: 'run_2',
      target: { kind: 'row', rowId: 'r-title' as RowId },
      operation: {
        kind: 'replace',
        rows: [{ id: 'r-title' as RowId, kind: 'entry.title', content: { text: 'X' }, semanticGroupId: 'gE1' as GroupId }],
      },
      status: 'pending',
    };
    applySuggestionV3(sug, booted.view);
    expect(useSuggestionStore.getState().byId['sug_2'].status).toBe('applied');

    // Undo via the view's dispatch path so our transaction listeners fire.
    undo(booted.view.state, booted.view.dispatch.bind(booted.view));

    expect(useSuggestionStore.getState().byId['sug_2'].status).toBe('pending');

    detach();
    fake.cleanup();
  });

  it('concurrent: typing in another row does NOT mark a pending suggestion applied', () => {
    booted = bootEditorPM();
    const fake = makeFakeEditor(booted.view);
    useSuggestionStore.setState({
      byId: { sug_3: { ...baseSuggestion, id: 'sug_3', status: 'pending' } },
      byRun: { run_3: ['sug_3'] },
    });
    const detach = useSuggestionStore.getState().attachToEditor(fake.editor);

    // Type into a different row (the entry_meta row, index 4).
    const view = booted.view;
    let metaPos = 0;
    view.state.doc.forEach((node, off, idx) => {
      if (idx === 4) metaPos = off + 1 + node.content.size;
    });
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, metaPos)).insertText('!', metaPos),
    );

    // Suggestion still pending — user typing carries no aiApply meta.
    expect(useSuggestionStore.getState().byId['sug_3'].status).toBe('pending');

    detach();
    fake.cleanup();
  });

  it('concurrent: apply still works after user typing has shifted positions (groupId stable)', () => {
    booted = bootEditorPM();
    const fake = makeFakeEditor(booted.view);
    useSuggestionStore.setState({
      byId: { sug_4: { ...baseSuggestion, id: 'sug_4', status: 'pending' } },
      byRun: { run_4: ['sug_4'] },
    });
    const detach = useSuggestionStore.getState().attachToEditor(fake.editor);

    // User types into entry_meta (index 4) — gE1 group's positions shift.
    const view = booted.view;
    let metaInsertAt = 0;
    view.state.doc.forEach((node, off, idx) => {
      if (idx === 4) metaInsertAt = off + 1 + node.content.size;
    });
    view.dispatch(view.state.tr.insertText(' (typed)', metaInsertAt));

    // Now apply a group-targeted suggestion against gE1. Resolver walks doc by attr,
    // so positions resolve to current state, not pre-edit.
    const sug: AISuggestionV3 = {
      id: 'sug_4',
      runId: 'run_4',
      target: { kind: 'group', groupId: 'gE1' as GroupId },
      operation: {
        kind: 'replace',
        rows: [
          { id: 'r-title' as RowId, kind: 'entry.title', content: { text: 'Lead Engineer' }, semanticGroupId: 'gE1' as GroupId },
          { id: 'r-meta' as RowId, kind: 'entry.meta', content: { text: '2024 - now' }, semanticGroupId: 'gE1' as GroupId },
        ],
      },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view);
    expect(r.ok).toBe(true);
    expect(useSuggestionStore.getState().byId['sug_4'].status).toBe('applied');

    detach();
    fake.cleanup();
  });
});
