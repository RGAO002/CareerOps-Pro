// frontend/src/components/resume/v2/store/actions/__tests__/aiLockGuard.test.ts
//
// Defensive store-action lock guards (spec § 6.2 / Task 19 Step 5g):
// every void-or-nullable structural mutation must no-op when the target
// block id is in the AI lock set. Insert actions are NOT guarded at the
// store level — their non-null return types make a bare `return;` unsafe.
// Insert lock protection lives at the UI layer (keyboard / slash command
// handlers — Task 19 Step 5a / 5b / 5e). The last test pins that decision.

import { describe, it, expect, beforeEach } from 'vitest';
import { useResumeStore } from '../../useResumeStore';
import { useAILockStore } from '@/stores/aiLock';
import { insertBullet, insertEntry } from '../insertBlock';
import { deleteBullet, deleteEntry } from '../deleteBlock';
import { moveBullet } from '../moveBullet';
import { moveEntry } from '../moveEntry';
import { makeOrigin } from '../../source-of-truth';
import type { ResumeDoc } from '../../../types';

const FIXTURE: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: '', meta: '', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
        { id: 'b2', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
      { id: 'e2', title: '', meta: '', bullets: [
        { id: 'b3', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
    ]},
    { id: 's2', role: 'skills', heading: 'Skills', entries: [] },
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(FIXTURE), bulletMeta: {} });
  useResumeStore.getState()._undo.clear();
  useAILockStore.setState({ lockedBlockIds: new Set() });
});

const ORIGIN = () => makeOrigin('ai-apply');

describe('AI lock blocks structural mutations (defensive store-action guard, void/nullable returns only)', () => {
  // ★ Insert actions (insertBullet/insertEntry/insertContactLine/insertSection)
  //   are NOT guarded at the store level — their non-null return types make
  //   bare `return;` unsafe. Insert lock protection lives at the UI layer
  //   (keyboard / slash command handlers — Task 19 Step 5a/5b/5e).

  it('deleteBullet is no-op when bullet is locked', () => {
    useAILockStore.getState().lock(['b1']);
    deleteBullet('b1', ORIGIN());
    expect(
      useResumeStore.getState().resume!.sections[0].entries[0].bullets.find(b => b.id === 'b1'),
    ).toBeTruthy();
  });

  it('deleteBullet succeeds when not locked', () => {
    deleteBullet('b1', ORIGIN());
    expect(
      useResumeStore.getState().resume!.sections[0].entries[0].bullets.find(b => b.id === 'b1'),
    ).toBeUndefined();
  });

  it('deleteEntry is no-op when entry is locked', () => {
    useAILockStore.getState().lock(['e1']);
    deleteEntry('e1', ORIGIN());
    expect(
      useResumeStore.getState().resume!.sections[0].entries.find(e => e.id === 'e1'),
    ).toBeTruthy();
  });

  it('moveBullet is no-op when source bullet is locked', () => {
    useAILockStore.getState().lock(['b1']);
    moveBullet('b1', 'e2', 0, ORIGIN());
    const r = useResumeStore.getState().resume!;
    expect(r.sections[0].entries[0].bullets.find(b => b.id === 'b1')).toBeTruthy();
    expect(r.sections[0].entries[1].bullets.find(b => b.id === 'b1')).toBeUndefined();
  });

  it('moveBullet is no-op when destination entry is locked', () => {
    useAILockStore.getState().lock(['e2']);
    moveBullet('b1', 'e2', 0, ORIGIN());
    const r = useResumeStore.getState().resume!;
    expect(r.sections[0].entries[0].bullets.find(b => b.id === 'b1')).toBeTruthy();
  });

  it('moveEntry is no-op when entry is locked', () => {
    useAILockStore.getState().lock(['e1']);
    moveEntry('e1', 's2', 0, ORIGIN());
    const r = useResumeStore.getState().resume!;
    expect(r.sections[0].entries.find(e => e.id === 'e1')).toBeTruthy();
    expect(r.sections[1].entries.find(e => e.id === 'e1')).toBeUndefined();
  });

  it("insertBullet is NOT gated at store level (returns BlockId, can't no-op return) — UI guard in keyboard handler is the protection", () => {
    // This test documents the design decision so a future regression that
    // adds a store-level insert guard fails loudly.
    useAILockStore.getState().lock(['e1']);
    const newId = insertBullet(
      'e1', 0,
      { type: 'doc', content: [{ type: 'paragraph' }] },
      ORIGIN(),
    );
    expect(typeof newId).toBe('string');  // returned a real id, not no-op
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets[0].id).toBe(newId);
  });

  it('insertEntry succeeds (insert is NOT store-gated) when not locked — sanity check', () => {
    const result = insertEntry('s2', 0, ORIGIN());
    expect(typeof result.entryId).toBe('string');
    expect(useResumeStore.getState().resume!.sections[1].entries.length).toBe(1);
  });
});
