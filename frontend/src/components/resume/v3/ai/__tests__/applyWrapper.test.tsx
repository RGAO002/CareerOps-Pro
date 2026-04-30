// T38 — applyWrapper tests.
//
// Spec ref: § 6.2 (apply pipeline) + § 6.5 (hard contracts).
//
// Verifies that applySuggestionV3:
//   - calls dispatchWithGroups exactly once per apply
//   - sets meta { allowLockedEdit: true, aiApply: { runId, suggestionIds } }
//   - addToHistory: true (single-step Cmd+Z)
//   - returns {ok:false, reason:'stale'} on stale targets without dispatching
//   - tolerates orphan groups (F4)
//   - bypasses AI lock via allowLockedEdit
//   - covers all 4 target kinds (document/selection/group/row)
//   - emits correct GroupOps for inserts (create entry) and deletes (delete group)

import { describe, it, expect, beforeEach } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { EditorState, type Transaction } from '@tiptap/pm/state';
import { history } from '@tiptap/pm/history';

import { v3RowExtensions } from '../../schema/pmSchema';
import { createGroupsPlugin, getGroupsState } from '../../plugins/GroupsPlugin';
import { aiLockPlugin } from '../../plugins/AILockPlugin';
import { useAILockStore } from '@/stores/aiLock';
import type { GroupId, GroupOp, RowId, ResumeRow, ProseMirrorDocJSON } from '../../schema/types';
import type { AISuggestionV3 } from '../applyWrapper';
import { applySuggestionV3 } from '../applyWrapper';

const TestDoc = Document.extend({
  content:
    '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});
const schema = getSchema([TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions]);

interface RowSpec { kind: string; id: string; gid?: string | null; text?: string }

function buildState(rows: RowSpec[], groupOps: GroupOp[] = []): EditorState {
  const content = rows.map((r) => {
    const attrs: Record<string, unknown> = { id: r.id };
    if (r.gid !== undefined) attrs.semanticGroupId = r.gid;
    const nodeName = r.kind.replace('.', '_');
    return schema.nodes[nodeName].create(attrs, r.text ? schema.text(r.text) : null);
  });
  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, content),
    plugins: [history(), createGroupsPlugin(), aiLockPlugin],
  });
  if (groupOps.length > 0) state = state.apply(state.tr.setMeta('groupOps', groupOps));
  return state;
}

// Lightweight EditorView stub with the surface applySuggestionV3 needs.
interface ViewStub {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
  dispatchedTransactions: Transaction[];
}

function makeView(initial: EditorState): ViewStub {
  const view: ViewStub = {
    state: initial,
    dispatchedTransactions: [],
    dispatch(tr: Transaction) {
      this.dispatchedTransactions.push(tr);
      // Mimic real editor: applyTransaction respects filterTransaction (so AI lock matters).
      const next = this.state.applyTransaction(tr);
      this.state = next.state;
    },
  };
  return view;
}

function richtext(text: string): ProseMirrorDocJSON {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

describe('applySuggestionV3 (T38) — single-transaction apply', () => {
  beforeEach(() => {
    useAILockStore.getState().clear();
  });

  it('replace on row target → single dispatch, doc updated, history step', () => {
    const state = buildState([
      { kind: 'plain', id: 'r1', gid: null, text: 'old' },
      { kind: 'plain', id: 'r2', gid: null, text: 'keep' },
    ]);
    const view = makeView(state);

    const newRows: ResumeRow[] = [
      { id: 'r1' as RowId, kind: 'plain', content: richtext('new') },
    ];
    const sug: AISuggestionV3 = {
      id: 's1',
      runId: 'run1',
      target: { kind: 'row', rowId: 'r1' as RowId },
      operation: { kind: 'replace', rows: newRows },
      status: 'pending',
    };

    const result = applySuggestionV3(sug, view as unknown as Parameters<typeof applySuggestionV3>[1]);
    expect(result.ok).toBe(true);
    expect(view.dispatchedTransactions.length).toBe(1);
    // Doc has new content for r1.
    let r1Text = '';
    view.state.doc.forEach((c) => {
      if (c.attrs.id === 'r1') r1Text = c.textContent;
    });
    expect(r1Text).toBe('new');
    // History step: tr.steps.length > 0 means it changed doc.
    expect(view.dispatchedTransactions[0].steps.length).toBeGreaterThan(0);
  });

  it('replace on group target → all rows in group replaced; single transaction', () => {
    const state = buildState(
      [
        { kind: 'entry.title', id: 'r1', gid: 'gE', text: 'Title' },
        { kind: 'bullet', id: 'r2', gid: 'gE', text: 'old1' },
        { kind: 'bullet', id: 'r3', gid: 'gE', text: 'old2' },
        { kind: 'plain', id: 'r4', gid: null, text: 'after' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    const view = makeView(state);

    const newRows: ResumeRow[] = [
      { id: 'r1' as RowId, kind: 'entry.title', content: { text: 'Title' }, semanticGroupId: 'gE' as GroupId },
      { id: 'rNew1' as RowId, kind: 'bullet', content: richtext('new1'), semanticGroupId: 'gE' as GroupId },
    ];
    const sug: AISuggestionV3 = {
      id: 's2',
      runId: 'run1',
      target: { kind: 'group', groupId: 'gE' as GroupId },
      operation: { kind: 'replace', rows: newRows },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view as never);
    expect(r.ok).toBe(true);
    expect(view.dispatchedTransactions.length).toBe(1);
    // r4 still after; the group has 2 rows now.
    const ids: string[] = [];
    view.state.doc.forEach((c) => ids.push(c.attrs.id as string));
    expect(ids).toEqual(['r1', 'rNew1', 'r4']);
  });

  it('insert with at:after on row target → new rows inserted after target; single history step', () => {
    const state = buildState([
      { kind: 'plain', id: 'r1', gid: null, text: 'one' },
      { kind: 'plain', id: 'r2', gid: null, text: 'two' },
    ]);
    const view = makeView(state);
    const inserted: ResumeRow[] = [
      { id: 'rNew' as RowId, kind: 'plain', content: richtext('inserted') },
    ];
    const sug: AISuggestionV3 = {
      id: 's3',
      runId: 'run1',
      target: { kind: 'row', rowId: 'r1' as RowId },
      operation: { kind: 'insert', rows: inserted, at: 'after' },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view as never);
    expect(r.ok).toBe(true);
    expect(view.dispatchedTransactions.length).toBe(1);
    const ids: string[] = [];
    view.state.doc.forEach((c) => ids.push(c.attrs.id as string));
    expect(ids).toEqual(['r1', 'rNew', 'r2']);
  });

  it('insert with new entry → groupOps include {type:create, group:entry}', () => {
    const state = buildState([
      { kind: 'plain', id: 'r1', gid: null, text: 'before' },
    ]);
    const view = makeView(state);
    const inserted: ResumeRow[] = [
      { id: 'rT' as RowId, kind: 'entry.title', content: { text: 'New Entry' }, semanticGroupId: 'gNewEntry' as GroupId },
      { id: 'rB' as RowId, kind: 'bullet', content: richtext('first bullet'), semanticGroupId: 'gNewEntry' as GroupId },
    ];
    const sug: AISuggestionV3 = {
      id: 's4',
      runId: 'run1',
      target: { kind: 'row', rowId: 'r1' as RowId },
      operation: {
        kind: 'insert',
        rows: inserted,
        at: 'after',
        groupOps: [{ type: 'create', group: { id: 'gNewEntry' as GroupId, kind: 'entry' } }],
      },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view as never);
    expect(r.ok).toBe(true);
    expect(view.dispatchedTransactions.length).toBe(1);
    expect(getGroupsState(view.state).byId.has('gNewEntry' as GroupId)).toBe(true);
  });

  it('delete on row target → row removed from doc; single transaction', () => {
    const state = buildState([
      { kind: 'plain', id: 'r1', gid: null, text: 'one' },
      { kind: 'plain', id: 'r2', gid: null, text: 'two' },
    ]);
    const view = makeView(state);
    const sug: AISuggestionV3 = {
      id: 's5',
      runId: 'run1',
      target: { kind: 'row', rowId: 'r2' as RowId },
      operation: { kind: 'delete' },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view as never);
    expect(r.ok).toBe(true);
    expect(view.dispatchedTransactions.length).toBe(1);
    const ids: string[] = [];
    view.state.doc.forEach((c) => ids.push(c.attrs.id as string));
    expect(ids).toEqual(['r1']);
  });

  it('delete with explicit groupOps {type:delete} → group removed from plugin state', () => {
    const state = buildState(
      [
        { kind: 'entry.title', id: 'r1', gid: 'gE', text: 't' },
        { kind: 'plain', id: 'r2', gid: null, text: 'after' },
      ],
      [{ type: 'create', group: { id: 'gE' as GroupId, kind: 'entry' } }],
    );
    const view = makeView(state);
    const sug: AISuggestionV3 = {
      id: 's6',
      runId: 'run1',
      target: { kind: 'group', groupId: 'gE' as GroupId },
      operation: {
        kind: 'delete',
        groupOps: [{ type: 'delete', groupId: 'gE' as GroupId }],
      },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view as never);
    expect(r.ok).toBe(true);
    expect(view.dispatchedTransactions.length).toBe(1);
    expect(getGroupsState(view.state).byId.has('gE' as GroupId)).toBe(false);
    const ids: string[] = [];
    view.state.doc.forEach((c) => ids.push(c.attrs.id as string));
    expect(ids).toEqual(['r2']);
  });

  it('stale target → returns {ok:false, reason:stale}; no dispatch', () => {
    const state = buildState([{ kind: 'plain', id: 'r1', gid: null, text: 'a' }]);
    const view = makeView(state);
    const sug: AISuggestionV3 = {
      id: 's7',
      runId: 'run1',
      target: { kind: 'row', rowId: 'missing' as RowId },
      operation: { kind: 'delete' },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view as never);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('stale');
    expect(view.dispatchedTransactions.length).toBe(0);
  });

  it('dispatched transaction carries meta {allowLockedEdit:true, aiApply:{runId, suggestionIds:[id]}}', () => {
    const state = buildState([{ kind: 'plain', id: 'r1', gid: null, text: 'a' }]);
    const view = makeView(state);
    const sug: AISuggestionV3 = {
      id: 'sM',
      runId: 'runX',
      target: { kind: 'row', rowId: 'r1' as RowId },
      operation: { kind: 'replace', rows: [{ id: 'r1' as RowId, kind: 'plain', content: richtext('b') }] },
      status: 'pending',
    };
    applySuggestionV3(sug, view as never);
    expect(view.dispatchedTransactions.length).toBe(1);
    const tr = view.dispatchedTransactions[0];
    expect(tr.getMeta('allowLockedEdit')).toBe(true);
    const aiApply = tr.getMeta('aiApply') as { runId: string; suggestionIds: string[] } | undefined;
    expect(aiApply).toBeDefined();
    expect(aiApply?.runId).toBe('runX');
    expect(aiApply?.suggestionIds).toEqual(['sM']);
    // addToHistory default true means meta('addToHistory') is undefined or true.
    expect(tr.getMeta('addToHistory')).not.toBe(false);
  });

  it('selection target replace → replaces rows covered by selection', () => {
    const state = buildState([
      { kind: 'plain', id: 'r1', gid: null, text: 'a' },
      { kind: 'plain', id: 'r2', gid: null, text: 'b' },
    ]);
    const view = makeView(state);
    const max = state.doc.content.size;
    const sug: AISuggestionV3 = {
      id: 'sSel',
      runId: 'run1',
      // Whole-doc selection.
      target: { kind: 'selection', from: 0, to: max },
      operation: { kind: 'replace', rows: [{ id: 'rOnly' as RowId, kind: 'plain', content: richtext('only') }] },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view as never);
    expect(r.ok).toBe(true);
    const ids: string[] = [];
    view.state.doc.forEach((c) => ids.push(c.attrs.id as string));
    expect(ids).toEqual(['rOnly']);
  });

  it('document target replace → replaces entire doc with new rows', () => {
    const state = buildState([
      { kind: 'plain', id: 'r1', gid: null, text: 'a' },
      { kind: 'plain', id: 'r2', gid: null, text: 'b' },
    ]);
    const view = makeView(state);
    const sug: AISuggestionV3 = {
      id: 'sDoc',
      runId: 'run1',
      target: { kind: 'document' },
      operation: {
        kind: 'replace',
        rows: [
          { id: 'rA' as RowId, kind: 'plain', content: richtext('A') },
          { id: 'rB' as RowId, kind: 'plain', content: richtext('B') },
        ],
      },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view as never);
    expect(r.ok).toBe(true);
    const ids: string[] = [];
    view.state.doc.forEach((c) => ids.push(c.attrs.id as string));
    expect(ids).toEqual(['rA', 'rB']);
  });

  it('F4 orphan-tolerant: group target with dangling parentSectionGroupId still applies', () => {
    // Rows tagged with gE attr but gE NOT registered in plugin state (orphan).
    const state = buildState([
      { kind: 'entry.title', id: 'r1', gid: 'gE', text: 't' },
      { kind: 'bullet', id: 'r2', gid: 'gE', text: 'b' },
    ]);
    const view = makeView(state);
    const sug: AISuggestionV3 = {
      id: 'sOrphan',
      runId: 'run1',
      target: { kind: 'group', groupId: 'gE' as GroupId },
      operation: {
        kind: 'replace',
        rows: [
          { id: 'r1' as RowId, kind: 'entry.title', content: { text: 't' }, semanticGroupId: 'gE' as GroupId },
          { id: 'rNew' as RowId, kind: 'bullet', content: richtext('new'), semanticGroupId: 'gE' as GroupId },
        ],
      },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view as never);
    expect(r.ok).toBe(true);
    expect(view.dispatchedTransactions.length).toBe(1);
  });

  it('AI lock bypass: locked row still gets edited because allowLockedEdit:true', () => {
    const state = buildState([{ kind: 'plain', id: 'r1', gid: null, text: 'old' }]);
    useAILockStore.getState().lock(['r1' as RowId]);
    const view = makeView(state);
    const sug: AISuggestionV3 = {
      id: 'sLock',
      runId: 'run1',
      target: { kind: 'row', rowId: 'r1' as RowId },
      operation: { kind: 'replace', rows: [{ id: 'r1' as RowId, kind: 'plain', content: richtext('new') }] },
      status: 'pending',
    };
    const r = applySuggestionV3(sug, view as never);
    expect(r.ok).toBe(true);
    let r1Text = '';
    view.state.doc.forEach((c) => {
      if (c.attrs.id === 'r1') r1Text = c.textContent;
    });
    expect(r1Text).toBe('new');
  });
});
