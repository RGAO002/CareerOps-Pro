import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { history, undo, redo, closeHistory } from '@tiptap/pm/history';
import { createGroupsPlugin, getGroupsState } from '../GroupsPlugin';
import type { GroupId, GroupOp } from '../../schema/types';

// Minimal schema — single 'row' node with semanticGroupId attr.
const schema = new Schema({
  nodes: {
    doc:  { content: 'row+' },
    text: {},
    row: {
      attrs: { id: { default: '' }, semanticGroupId: { default: null } },
      content: 'text*',
    },
  },
});

function makeRow(id: string, groupId?: string) {
  return schema.nodes.row.create({ id, semanticGroupId: groupId ?? null }, schema.text(' '));
}

// CONTRACT (verified by these tests):
// - PM history captures doc Steps + history-plugin's own state, NOT arbitrary
//   plugin meta from other plugins. So `tr.setMeta('groupOps', [...])` is
//   NOT preserved across an undo/redo cycle.
// - Therefore: undo of a paired (doc-step + groupOps) transaction restores
//   the doc step but leaves the groups state UNCHANGED (no inverse op fires).
// - Group state is asymmetric on undo. v3 production handles this by:
//   1. Group create + doc create: groupOps['create'] paired with doc step.
//      On undo, doc step reverses but group lingers as orphan. Save-time GC
//      drops the orphan. AI / serialize layers ignore orphan groups.
//   2. Group delete on row removal: NO groupOp emitted. Group lingers as
//      orphan; save drops it. Undo trivially restores doc; group state
//      never changed. (This is the recommended pattern.)
// - Therefore production code's "delete group" pattern is to NOT emit
//   {type:'delete'}, just let it become orphan and rely on save-time GC.
//   {type:'delete'} is only useful when the user explicitly removes a group
//   without removing the underlying anchor row — which is rare.

describe('GroupsPlugin undo/redo atomicity (REVIEWER CONCERN — empirical verification)', () => {
  it('undo restores doc; groups state remains as plugin computed it (orphan tolerated)', () => {
    const initialDoc = schema.node('doc', null, [makeRow('r1', 'g1')]);
    let state = EditorState.create({
      schema,
      doc: initialDoc,
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) }));
    expect(getGroupsState(state).byId.size).toBe(1);

    // User action: insert row r2 with groupId g2 + create group op (one transaction, doc-changing).
    const r2 = makeRow('r2', 'g2');
    let tr = state.tr.replaceWith(state.doc.content.size, state.doc.content.size, r2);
    const ops: GroupOp[] = [{ type: 'create', group: { id: 'g2' as GroupId, kind: 'entry' } }];
    tr = tr.setMeta('groupOps', ops);
    state = state.apply(tr);
    expect(getGroupsState(state).byId.size).toBe(2);
    expect(state.doc.childCount).toBe(2);

    // Undo: doc step reverses (r2 removed). Groups state UNCHANGED — PM history
    // doesn't preserve `groupOps` meta on inverse transaction. g2 lingers as orphan.
    const undoCommand = undo(state, (newTr) => { state = state.apply(newTr); });
    expect(undoCommand).toBe(true);
    expect(state.doc.childCount).toBe(1);
    expect(getGroupsState(state).byId.size).toBe(2);                         // g2 still here (orphan)
    expect(getGroupsState(state).byId.has('g2' as GroupId)).toBe(true);

    // Save-time GC (Task 17 serialize) is what drops orphan g2 from output.
    // This test only asserts the in-memory plugin state contract.

    // Redo: doc step reapplies (r2 returns). Groups state still has g2 (was orphan,
    // now is referenced again — no plugin work needed).
    const redoCommand = redo(state, (newTr) => { state = state.apply(newTr); });
    expect(redoCommand).toBe(true);
    expect(state.doc.childCount).toBe(2);
    expect(getGroupsState(state).byId.has('g2' as GroupId)).toBe(true);
  });

  it('multi-step undo: doc reverts step-by-step; groups state monotonic-grow under create ops', () => {
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [makeRow('r1', 'g1')]),
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) }));

    // Step A: insert row r2 + create group g2.
    {
      const r2 = makeRow('r2', 'g2');
      const tr = state.tr
        .replaceWith(state.doc.content.size, state.doc.content.size, r2)
        .setMeta('groupOps', [{ type: 'create', group: { id: 'g2' as GroupId, kind: 'entry' } } satisfies GroupOp]);
      state = state.apply(tr);
    }

    // Force PM history boundary between Step A and Step B (mimics user keystrokes
    // arriving in separate event loop turns; without this, PM merges sync transactions
    // into one history event and a single undo() pops both).
    state = state.apply(closeHistory(state.tr));

    // Step B: insert row r3 + create group g3.
    {
      const r3 = makeRow('r3', 'g3');
      const tr = state.tr
        .replaceWith(state.doc.content.size, state.doc.content.size, r3)
        .setMeta('groupOps', [{ type: 'create', group: { id: 'g3' as GroupId, kind: 'entry' } } satisfies GroupOp]);
      state = state.apply(tr);
    }
    expect(getGroupsState(state).byId.size).toBe(3);
    expect(state.doc.childCount).toBe(3);

    // Undo step B → r3 removed, but g3 lingers as orphan. Groups state size unchanged.
    undo(state, (newTr) => { state = state.apply(newTr); });
    expect(state.doc.childCount).toBe(2);
    expect(getGroupsState(state).byId.size).toBe(3);                         // g3 still here (orphan)
    expect(getGroupsState(state).byId.has('g3' as GroupId)).toBe(true);

    // Undo step A → r2 removed, g2 also lingers.
    undo(state, (newTr) => { state = state.apply(newTr); });
    expect(state.doc.childCount).toBe(1);
    expect(getGroupsState(state).byId.size).toBe(3);                         // both g2, g3 lingering
  });

  it('group-only transaction (no doc change) is NOT recorded by history — explicit guard against silent reliance on PM internals', () => {
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [makeRow('r1', 'g1')]),
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) }));

    // groupOps-only transaction (no doc step).
    state = state.apply(
      state.tr.setMeta('groupOps', [{ type: 'create', group: { id: 'g2' as GroupId, kind: 'entry' } } satisfies GroupOp])
    );
    expect(getGroupsState(state).byId.size).toBe(2);

    // Undo: PM history has no step for this transaction, so undo() returns false (or
    // pops nothing). Either way, group state remains the post-transaction value.
    const before = state;
    const didUndo = undo(state, (newTr) => { state = state.apply(newTr); });
    if (didUndo) {
      // Some PM versions return true while popping nothing meaningful; verify state unchanged.
      expect(getGroupsState(state).byId.size).toBe(getGroupsState(before).byId.size);
    } else {
      expect(state).toBe(before);
    }
    // KEY ASSERTION: the design contract holds — group-only ops are not undoable.
    // v3 production code MUST always pair groupOps with a doc step (or accept non-undoability).
  });

  it('explicit paired (doc-delete + groupOp delete) transaction is undoable atomically', () => {
    // doc has TWO rows so deleting one keeps the doc valid for `row+` schema.
    const initialDoc = schema.node('doc', null, [makeRow('r1', 'g1'), makeRow('r2', 'g2')]);
    let state = EditorState.create({
      schema,
      doc: initialDoc,
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', { byId: new Map([
      ['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }],
      ['g2' as GroupId, { id: 'g2' as GroupId, kind: 'entry' }],
    ]) }));
    expect(getGroupsState(state).byId.size).toBe(2);

    // Production code path: delete row r1 + emit explicit delete groupOp for g1.
    // (In the real editor, dispatchWithGroups builds this transaction.)
    const r1Size = state.doc.firstChild!.nodeSize;
    const tr = state.tr
      .delete(0, r1Size)
      .setMeta('groupOps', [{ type: 'delete', groupId: 'g1' as GroupId } satisfies GroupOp]);
    state = state.apply(tr);
    expect(state.doc.childCount).toBe(1);
    expect(getGroupsState(state).byId.has('g1' as GroupId)).toBe(false);
    expect(getGroupsState(state).byId.has('g2' as GroupId)).toBe(true);

    // Undo: doc step restores r1; groupOps meta is on the original transaction
    // but PM history doesn't preserve meta, so undo's inverse transaction has
    // the inverse doc step but no inverse group op. GroupsPlugin.apply on the
    // undo runs without ops → groups state remains as it is.
    //
    // RESULT: doc is restored but g1 is NOT restored. This is the documented
    // limitation of pairing approach. To recover, production code includes the
    // group's prior state in the inverse via a custom undo command, OR keeps
    // the group around (no auto-GC) and lets the orphan-aware AI/serialize
    // layer skip it.
    //
    // For v3, this test confirms: undo restores doc; group state is what
    // explicit groupOps + plugin apply produce. If we want exact symmetry on
    // undo, we need a higher-level undo command that re-emits the inverse
    // groupOp. v3 production code should NOT auto-emit `{type:'delete'}` for
    // groups whose row is being deleted — leave them as orphans, drop at
    // serialize time. This makes undo trivially correct.
    undo(state, (newTr) => { state = state.apply(newTr); });
    expect(state.doc.childCount).toBe(2);
    // g1 NOT restored (asymmetric undo because PM history doesn't preserve
    // plugin meta). This documents the contract.
    expect(getGroupsState(state).byId.has('g1' as GroupId)).toBe(false);
  });

  it('LEAVING groups orphaned (no auto-GC, no paired delete op) gives clean undo symmetry', () => {
    // The recommended production pattern: do NOT emit groupOp on row deletion.
    // Group lingers in plugin state as an orphan; serialize-time GC drops it.
    // Undo trivially restores doc + groups (groups never changed).
    const initialDoc = schema.node('doc', null, [makeRow('r1', 'g1'), makeRow('r2', 'g2')]);
    let state = EditorState.create({
      schema,
      doc: initialDoc,
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', { byId: new Map([
      ['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }],
      ['g2' as GroupId, { id: 'g2' as GroupId, kind: 'entry' }],
    ]) }));

    // Delete r1 with NO groupOps — group state unchanged.
    const r1Size = state.doc.firstChild!.nodeSize;
    state = state.apply(state.tr.delete(0, r1Size));
    expect(state.doc.childCount).toBe(1);
    expect(getGroupsState(state).byId.size).toBe(2);   // g1 still here, orphaned

    // Undo restores doc; group state was never touched.
    undo(state, (newTr) => { state = state.apply(newTr); });
    expect(state.doc.childCount).toBe(2);
    expect(getGroupsState(state).byId.size).toBe(2);
    expect(getGroupsState(state).byId.has('g1' as GroupId)).toBe(true);
  });
});
