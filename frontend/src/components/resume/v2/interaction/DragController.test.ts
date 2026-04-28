// frontend/src/components/resume/v2/interaction/DragController.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDropTargetsFor,
  commitDrop,
  findNearestDropTarget,
  resetDropTargetHysteresis,
  type DropTarget,
} from './DragController';
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin, _resetTransactionCounter } from '../store/source-of-truth';
import type { ResumeDoc } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: '', meta: '', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
    ]},
    { id: 's2', role: 'skills', heading: 'Skills', entries: [] },
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(RESUME), bulletMeta: {} });
  _resetTransactionCounter();
});

describe('getDropTargetsFor', () => {
  it('section drag → all section slots + tail', () => {
    const targets = getDropTargetsFor({ kind: 'section', id: 's1' });
    expect(targets).toHaveLength(3);  // before s1, before s2, end
  });
  it('entry drag → all entry slots in all sections', () => {
    const targets = getDropTargetsFor({ kind: 'entry', id: 'e1', sectionId: 's1' });
    // s1 has 1 entry → 2 slots; s2 has 0 entries → 1 slot
    expect(targets).toHaveLength(3);
  });
  it('bullet drag → bullet slots in all entries', () => {
    const targets = getDropTargetsFor({ kind: 'bullet', id: 'b1', entryId: 'e1' });
    expect(targets).toHaveLength(2);  // before b1, after b1
  });
  it('header-row drag → only header-row-slot targets in this header (never section/entry/bullet)', () => {
    // Replace header with one that has a contact line so we have 2 rows.
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        header: {
          id: 'h', name: 'A',
          contact_lines: [{ type: 'text', value: 'a' }],
        },
      },
      bulletMeta: {},
    });
    const targets = getDropTargetsFor({
      kind: 'header-row', rowKey: 'name', headerId: 'h',
    });
    // 2 rows → 3 slots (above, between, below).
    expect(targets).toHaveLength(3);
    // CRITICAL: header rows must NEVER produce section/entry/bullet drop
    // targets — that would let the user drop a contact line into the
    // experience section.
    expect(targets.every(t => t.kind === 'header-row-slot')).toBe(true);
    // All slots target the same header.
    expect(targets.every(t => t.kind === 'header-row-slot' && t.headerId === 'h')).toBe(true);
  });
});

describe('commitDrop', () => {
  it('section drop reorders sections', () => {
    commitDrop(
      { kind: 'section', id: 's1' },
      { kind: 'section-slot', insertBeforeSectionId: null },
      makeOrigin('drag-reorder'),
    );
    expect(useResumeStore.getState().resume!.sections.map(s => s.id)).toEqual(['s2', 's1']);
  });
});

/* ─── findNearestDropTarget hysteresis ────────────────────────────────────── */
//
// Two candidate bullet slots placed at y=100 and y=200 (midline = 150). Without
// hysteresis the chosen target would flip on every cursor move that crosses
// 150. With HYSTERESIS_PX=8 the chosen target only switches when the cursor
// gets at least 8px closer to a different candidate than to the sticky one.
describe('findNearestDropTarget hysteresis', () => {
  // Use a fresh resume with two bullets so we have well-defined drop targets.
  const RESUME_2BULLETS: ResumeDoc = {
    schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
    header: { id: 'h', name: '', contact_lines: [] },
    sections: [
      { id: 's1', role: 'experience', heading: 'Exp', entries: [
        { id: 'e1', title: '', meta: '', bullets: [
          { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
          { id: 'b2', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
        ]},
      ]},
    ],
    metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
  };

  // Stub the bullet/entry/section DOM elements with controlled getBoundingClientRect.
  // findNearestDropTarget reads y from `[data-block-id="..."]`'s rect.top/bottom.
  function placeEl(id: string, top: number, height = 20): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-block-id', id);
    document.body.appendChild(el);
    el.getBoundingClientRect = () => ({
      x: 0, y: top, top, left: 0, right: 100, bottom: top + height,
      width: 100, height, toJSON: () => ({}),
    } as DOMRect);
    return el;
  }

  beforeEach(() => {
    useResumeStore.setState({ resume: structuredClone(RESUME_2BULLETS), bulletMeta: {} });
    _resetTransactionCounter();
    resetDropTargetHysteresis();
    // b1 at y=100 → before-b1 slot is at y=100, after-b1 slot is at y=200
    placeEl('e1', 50, 200);   // entry container (used by tail slot)
    placeEl('b1', 100, 20);
    placeEl('b2', 200, 20);
  });

  afterEach(() => {
    document.querySelectorAll('[data-block-id]').forEach(el => el.remove());
  });

  it('keeps the same target across small mouse jitter (±7 px)', () => {
    const block = { kind: 'bullet' as const, id: 'b1', entryId: 'e1' };
    const targets: DropTarget[] = getDropTargetsFor(block);
    // Two bullet slots: insertAtIndex=0 (top of b1) at y=100, insertAtIndex=1 at y=200.
    // Cursor at 145 → nearest is index=0 (dist 45) over index=1 (dist 55). Pick that.
    const first = findNearestDropTarget(145, block, targets);
    expect(first).toEqual(expect.objectContaining({ insertAtIndex: 0 }));
    // Now cursor moves to 152 — nearest by distance becomes index=1 (dist 48 vs 52).
    // But hysteresis is 8 px so we shouldn't switch yet (delta = 4 < 8).
    const second = findNearestDropTarget(152, block, targets);
    expect(second).toEqual(expect.objectContaining({ insertAtIndex: 0 }));
  });

  it('switches when cursor crosses past midline by HYSTERESIS_PX (≥13 px)', () => {
    const block = { kind: 'bullet' as const, id: 'b1', entryId: 'e1' };
    const targets: DropTarget[] = getDropTargetsFor(block);
    findNearestDropTarget(145, block, targets);  // sticks index=0
    // Cursor at 165 → index=0 dist=65, index=1 dist=35 → delta = 30 > 12 → switch.
    const switched = findNearestDropTarget(165, block, targets);
    expect(switched).toEqual(expect.objectContaining({ insertAtIndex: 1 }));
  });

  /* ─── Snapshot-based stickiness (Issue 1 root-cause regression test) ─────
   *
   * The real bug behind "adjacent-bullet jitter" wasn't insufficient
   * hysteresis — it was that the preview's translateY shifts moved the very
   * elements `findNearestDropTarget` was measuring. As the cursor sat still,
   * the targets oscillated around the cursor and "nearest" flipped on every
   * frame.
   *
   * Fix: snapshot every target's Y at drag start; reuse the snapshot. These
   * tests prove that even if the live DOM reports moved positions (simulating
   * the preview shift), the snapshot keeps the chosen target stable.
   */
  it('uses snapshot Y over live DOM Y (target stays anchored under preview shift)', async () => {
    const { snapshotDropTargetYs } = await import('./DragController');
    const block = { kind: 'bullet' as const, id: 'b1', entryId: 'e1' };
    const targets = getDropTargetsFor(block);
    // Snapshot Ys NOW: before-b1 → 100, after-b1 → 200 (b2 top).
    const snap = snapshotDropTargetYs(targets);
    // Simulate the preview shifting b2 up by 30 px (would normally happen
    // when the user is "opening a slot" before b2 — exactly the scenario
    // that caused the jitter loop).
    (document.querySelector('[data-block-id="b2"]') as HTMLElement)
      .getBoundingClientRect = () => ({
        x: 0, y: 170, top: 170, left: 0, right: 100, bottom: 190,
        width: 100, height: 20, toJSON: () => ({}),
      } as DOMRect);

    // Without snapshot: the live before-b2 slot moved from 200 → 170, so
    // cursor at 175 would now be "nearest" to it (dist 5) over before-b1
    // (dist 75) → flip. With snapshot: before-b2 stays at 200 (snapped),
    // cursor at 175 is still nearest to before-b1 (dist 75 < dist 25? no:
    // 75 vs 25 → snap shows index 1 nearest). Pick a cursor that the
    // snapshot keeps anchored: 145 → snap distances: 45 vs 55 → index 0.
    // Without snap: distances 45 vs 25 → index 1. Snapshot must win.
    const target = findNearestDropTarget(145, block, targets, snap);
    expect(target).toEqual(expect.objectContaining({ insertAtIndex: 0 }));
  });

  it('snapshot + hysteresis kills jitter for noisy mouse over a stable boundary', async () => {
    const { snapshotDropTargetYs } = await import('./DragController');
    const block = { kind: 'bullet' as const, id: 'b1', entryId: 'e1' };
    const targets = getDropTargetsFor(block);
    const snap = snapshotDropTargetYs(targets);
    // Simulate 5 noisy mouse moves around the boundary midline (150).
    // Sequence: 145, 152, 148, 156, 144. Without snap+hysteresis at 12 px,
    // the result would oscillate between insertAtIndex 0 and 1. With both,
    // it must stay at 0 the whole time.
    const seen = new Set<number>();
    for (const y of [145, 152, 148, 156, 144]) {
      const t = findNearestDropTarget(y, block, targets, snap);
      if (t && t.kind === 'bullet-slot') seen.add(t.insertAtIndex);
    }
    expect([...seen]).toEqual([0]);
  });
});
