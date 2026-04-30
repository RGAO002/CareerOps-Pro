// AI lock plugin (T24) — filterTransaction-based gate.
// Spec ref: docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md § 6.3.
//
// CRITICAL — F4 (orphan-tolerant resolution):
//   When a GroupId is locked, "rows in this group" is resolved by direct attr
//   match (`node.attrs.semanticGroupId === groupId`), NOT by walking parent
//   chains in GroupsPlugin state. GroupsPlugin is orphan-tolerant: a row's
//   parentSectionGroupId may point at a deleted parent. Direct attr match is
//   the safe path.

import { describe, it, expect, beforeEach } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection, Plugin } from '@tiptap/pm/state';
import { useAILockStore } from '@/stores/aiLock';
import { aiLockPlugin } from '../AILockPlugin';
import type { GroupId, RowId } from '../../schema/types';

// Minimal schema: doc with mixed row types carrying id + semanticGroupId attrs.
const schema = new Schema({
  nodes: {
    doc: { content: 'row+' },
    text: {},
    row: {
      attrs: { id: { default: '' }, semanticGroupId: { default: null } },
      content: 'text*',
      group: 'row',
    },
  },
});

function makeRow(id: string, gid: string | null, text: string) {
  return schema.nodes.row.create(
    { id, semanticGroupId: gid },
    text ? schema.text(text) : null
  );
}

function buildState(rows: ReturnType<typeof makeRow>[]) {
  return EditorState.create({
    schema,
    doc: schema.node('doc', null, rows),
    plugins: [aiLockPlugin],
  });
}

// Helper: get the position INSIDE row identified by `rowId` (after its opening token).
function posInsideRow(state: EditorState, rowId: string): number {
  let found = -1;
  state.doc.forEach((node, offset) => {
    if (node.attrs.id === rowId) found = offset + 1; // inside the row
  });
  if (found < 0) throw new Error(`row ${rowId} not found`);
  return found;
}

describe('AILockPlugin (T24)', () => {
  beforeEach(() => {
    useAILockStore.getState().clear();
  });

  it('passes transactions when no doc change (e.g. selection-only)', () => {
    const state = buildState([makeRow('r1', null, 'hello')]);
    useAILockStore.getState().lock(['r1']);
    // Selection-only transaction.
    const tr = state.tr.setSelection(TextSelection.create(state.doc, posInsideRow(state, 'r1')));
    const next = state.applyTransaction(tr);
    // applyTransaction returns { state, transactions }; the tr should be applied (no-op doc).
    expect(next.state.doc.eq(state.doc)).toBe(true);
    expect(next.transactions.length).toBeGreaterThan(0);
  });

  it('passes transactions tagged with allowLockedEdit meta', () => {
    const state = buildState([makeRow('r1', null, 'hi')]);
    useAILockStore.getState().lock(['r1']);
    const tr = state.tr
      .insertText('X', posInsideRow(state, 'r1'))
      .setMeta('allowLockedEdit', true);
    const next = state.applyTransaction(tr);
    // Doc should change (lock was bypassed).
    expect(next.state.doc.eq(state.doc)).toBe(false);
  });

  it('rejects user transaction touching a row whose RowId is locked', () => {
    const state = buildState([
      makeRow('r1', null, 'one'),
      makeRow('r2', null, 'two'),
    ]);
    useAILockStore.getState().lock(['r2' as RowId]);
    const tr = state.tr.insertText('X', posInsideRow(state, 'r2'));
    const next = state.applyTransaction(tr);
    expect(next.state.doc.eq(state.doc)).toBe(true);
  });

  it('rejects user transaction touching any row whose semanticGroupId is locked', () => {
    const state = buildState([
      makeRow('r1', 'g1', 'first'),
      makeRow('r2', 'g2', 'bullet'),
      makeRow('r3', 'g2', 'bullet2'),
    ]);
    useAILockStore.getState().lock(['g2' as GroupId]);
    const tr = state.tr.insertText('X', posInsideRow(state, 'r2'));
    const next = state.applyTransaction(tr);
    expect(next.state.doc.eq(state.doc)).toBe(true);
  });

  it('accepts user transaction touching unlocked rows when other rows are locked', () => {
    const state = buildState([
      makeRow('r1', null, 'one'),
      makeRow('r2', null, 'two'),
    ]);
    useAILockStore.getState().lock(['r2' as RowId]);
    const tr = state.tr.insertText('X', posInsideRow(state, 'r1'));
    const next = state.applyTransaction(tr);
    expect(next.state.doc.eq(state.doc)).toBe(false);
  });

  it('rejects keymap input, paste, mark, drag-insertion uniformly', () => {
    // 4 sub-cases — each simulates a different pathway. All must be rejected
    // because filterTransaction sees the underlying transaction regardless of source.
    const buildLocked = () => {
      const s = buildState([makeRow('r1', null, 'abc')]);
      useAILockStore.getState().lock(['r1' as RowId]);
      return s;
    };

    // (a) keymap-style: insertText
    {
      const s = buildLocked();
      const tr = s.tr.insertText('K', posInsideRow(s, 'r1'));
      expect(s.applyTransaction(tr).state.doc.eq(s.doc)).toBe(true);
    }
    // (b) paste-style: replaceWith a slice of text
    {
      const s = buildLocked();
      const pos = posInsideRow(s, 'r1');
      const tr = s.tr.replaceWith(pos, pos, schema.text('PASTED'));
      expect(s.applyTransaction(tr).state.doc.eq(s.doc)).toBe(true);
    }
    // (c) mark-add style: addMark across the row
    {
      const markSchema = new Schema({
        nodes: {
          doc: { content: 'row+' },
          text: {},
          row: {
            attrs: { id: { default: '' }, semanticGroupId: { default: null } },
            content: 'text*',
          },
        },
        marks: { em: {} },
      });
      const doc = markSchema.node('doc', null, [
        markSchema.nodes.row.create({ id: 'r1' }, markSchema.text('abc')),
      ]);
      const s = EditorState.create({ schema: markSchema, doc, plugins: [aiLockPlugin] });
      useAILockStore.getState().lock(['r1' as RowId]);
      const tr = s.tr.addMark(1, 4, markSchema.marks.em.create());
      expect(s.applyTransaction(tr).state.doc.eq(s.doc)).toBe(true);
    }
    // (d) drag-insertion style: replaceRangeWith inserting a new node
    {
      const s = buildLocked();
      const pos = posInsideRow(s, 'r1');
      const tr = s.tr.insert(pos, schema.text('DRAG'));
      expect(s.applyTransaction(tr).state.doc.eq(s.doc)).toBe(true);
    }
  });

  it('AI apply transaction with allowLockedEdit:true bypasses lock', () => {
    const state = buildState([makeRow('r1', 'g1', 'orig')]);
    useAILockStore.getState().lock(['r1' as RowId, 'g1' as GroupId]);
    const tr = state.tr
      .insertText('Z', posInsideRow(state, 'r1'))
      .setMeta('allowLockedEdit', true);
    const next = state.applyTransaction(tr);
    expect(next.state.doc.eq(state.doc)).toBe(false);
  });

  it('locked GroupId resolution tolerates dangling parentSectionGroupId (F4)', () => {
    // Synthetic orphan: row r2 belongs to entry group g2, whose parent section
    // group g99 was deleted. Lock g2; the plugin must still find r2 by direct
    // semanticGroupId match WITHOUT throwing on the missing parent.
    const state = buildState([
      makeRow('r1', 'g1', 'section row'),
      makeRow('r2', 'g2', 'orphan entry row'),
    ]);
    useAILockStore.getState().lock(['g2' as GroupId]);
    // No throw, and the edit is rejected (g2 resolved → r2 in range).
    const tr = state.tr.insertText('X', posInsideRow(state, 'r2'));
    expect(() => state.applyTransaction(tr)).not.toThrow();
    const next = state.applyTransaction(tr);
    expect(next.state.doc.eq(state.doc)).toBe(true);

    // Sanity: an unlocked row in this same doc still accepts edits.
    const tr2 = state.tr.insertText('Y', posInsideRow(state, 'r1'));
    expect(state.applyTransaction(tr2).state.doc.eq(state.doc)).toBe(false);
  });

  it('aiLock store accepts RowId | GroupId keys (no compile error; BlockId still accepted for v2 coexistence)', () => {
    const rid: RowId = 'r-x' as RowId;
    const gid: GroupId = 'g-x' as GroupId;
    const bid: string = 'b-x'; // v2 BlockId is plain string
    useAILockStore.getState().lock([rid, gid, bid]);
    expect(useAILockStore.getState().isLocked(rid)).toBe(true);
    expect(useAILockStore.getState().isLocked(gid)).toBe(true);
    expect(useAILockStore.getState().isLocked(bid)).toBe(true);
    // lockedKeys() returns the underlying set, also typed as the union.
    const keys = useAILockStore.getState().lockedKeys();
    expect(keys.has(rid)).toBe(true);
    expect(keys.has(gid)).toBe(true);
    expect(keys.has(bid)).toBe(true);
  });
});

// Suppress "unused" warning for Plugin import in environments where it's only used by aiLockPlugin.
void Plugin;
