// frontend/src/components/resume/v2/interaction/DragController.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDropTargetsFor,
  commitDrop,
  findNearestDropTarget,
  resetDropTargetHysteresis,
  buildHypotheticalAtoms,
  startDrag,
  type DropTarget,
} from './DragController';
import { projectAtoms } from '../layout/atoms-projection';
import { useResumeStore } from '../store/useResumeStore';
import { useAILockStore } from '@/stores/aiLock';
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

/* ─── isNoopTargetFor: filter out drop slots that would commit no movement ──
 *
 * The bug this guards against: when src is at index N, the slot "just below
 * self" (insertAtIndex = N+1 for entries/bullets, insertBefore=next-sibling
 * for sections) maps to the same effective position. moveEntry/moveSection/
 * moveBullet all detect this and no-op the commit, but the preview path
 * (buildHypotheticalAtoms) interpreted insertAtIndex in post-removal space and
 * showed a phantom swap. Fix: filter these slots out of validTargets at
 * startDrag so the cursor snaps past them — preview and commit then agree on
 * the next meaningful slot, which actually swaps with the next sibling.
 */
describe('isNoopTargetFor', () => {
  it('section: drop on self is a no-op', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    expect(isNoopTargetFor(
      { kind: 'section', id: 's1' },
      { kind: 'section-slot', insertBeforeSectionId: 's1' },
    )).toBe(true);
  });
  it('section: drop just below self (insertBefore next sibling) is a no-op', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    // s1 → s2 in fixture; insertBefore s2 while dragging s1 is "stay put".
    expect(isNoopTargetFor(
      { kind: 'section', id: 's1' },
      { kind: 'section-slot', insertBeforeSectionId: 's2' },
    )).toBe(true);
  });
  it('section: drop at end while already last is a no-op', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    expect(isNoopTargetFor(
      { kind: 'section', id: 's2' },                              // s2 is last
      { kind: 'section-slot', insertBeforeSectionId: null },
    )).toBe(true);
  });
  it('section: drop before a non-adjacent sibling is NOT a no-op', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    // s2 dragged, insertBefore s1 = move s2 to top → real change.
    expect(isNoopTargetFor(
      { kind: 'section', id: 's2' },
      { kind: 'section-slot', insertBeforeSectionId: 's1' },
    )).toBe(false);
  });

  it('entry: drop at own index is a no-op', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    // Use 4-entry fixture so srcIdx and srcIdx+1 are both reachable + non-end.
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        sections: [
          { id: 's1', role: 'experience', heading: 'Exp', entries: [
            { id: 'p', title: 'P', meta: '', bullets: [] },
            { id: 'f', title: 'F', meta: '', bullets: [] },
            { id: 'd', title: 'D', meta: '', bullets: [] },
            { id: 'i', title: 'I', meta: '', bullets: [] },
          ]},
          { id: 's2', role: 'skills', heading: 'Skills', entries: [] },
        ],
      },
      bulletMeta: {},
    });
    expect(isNoopTargetFor(
      { kind: 'entry', id: 'p', sectionId: 's1' },
      { kind: 'entry-slot', sectionId: 's1', insertAtIndex: 0 },   // p is at idx 0
    )).toBe(true);
  });
  it('entry: drop just below self (srcIdx + 1) is a no-op — the Skills bug', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        sections: [
          { id: 's1', role: 'experience', heading: 'Exp', entries: [
            { id: 'p', title: 'P', meta: '', bullets: [] },
            { id: 'f', title: 'F', meta: '', bullets: [] },
          ]},
          { id: 's2', role: 'skills', heading: 'Skills', entries: [] },
        ],
      },
      bulletMeta: {},
    });
    // Dragging P (idx 0) and aiming at insertAtIndex=1 (top of F) is the
    // "phantom swap" case that prompted this fix.
    expect(isNoopTargetFor(
      { kind: 'entry', id: 'p', sectionId: 's1' },
      { kind: 'entry-slot', sectionId: 's1', insertAtIndex: 1 },
    )).toBe(true);
  });
  it('entry: drop at srcIdx + 2 (real swap) is NOT a no-op', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        sections: [
          { id: 's1', role: 'experience', heading: 'Exp', entries: [
            { id: 'p', title: 'P', meta: '', bullets: [] },
            { id: 'f', title: 'F', meta: '', bullets: [] },
            { id: 'd', title: 'D', meta: '', bullets: [] },
          ]},
          { id: 's2', role: 'skills', heading: 'Skills', entries: [] },
        ],
      },
      bulletMeta: {},
    });
    expect(isNoopTargetFor(
      { kind: 'entry', id: 'p', sectionId: 's1' },
      { kind: 'entry-slot', sectionId: 's1', insertAtIndex: 2 },   // between F and D = swap with F
    )).toBe(false);
  });
  it('entry: cross-section drop is NEVER a no-op (even at index that matches src)', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    expect(isNoopTargetFor(
      { kind: 'entry', id: 'e1', sectionId: 's1' },                // e1 at s1 idx 0
      { kind: 'entry-slot', sectionId: 's2', insertAtIndex: 0 },   // moving to s2
    )).toBe(false);
  });

  it('bullet: drop at own index is a no-op', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    expect(isNoopTargetFor(
      { kind: 'bullet', id: 'b1', entryId: 'e1' },
      { kind: 'bullet-slot', entryId: 'e1', insertAtIndex: 0 },
    )).toBe(true);
  });
  it('bullet: drop at srcIdx + 1 is a no-op', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    expect(isNoopTargetFor(
      { kind: 'bullet', id: 'b1', entryId: 'e1' },
      { kind: 'bullet-slot', entryId: 'e1', insertAtIndex: 1 },
    )).toBe(true);
  });
  it('bullet: cross-entry drop is NEVER a no-op', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    // Add a second entry to s1 so we have a cross-entry destination.
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        sections: [
          { id: 's1', role: 'experience', heading: 'Exp', entries: [
            { id: 'e1', title: '', meta: '', bullets: [
              { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
            ]},
            { id: 'e2', title: '', meta: '', bullets: [] },
          ]},
        ],
      },
      bulletMeta: {},
    });
    expect(isNoopTargetFor(
      { kind: 'bullet', id: 'b1', entryId: 'e1' },
      { kind: 'bullet-slot', entryId: 'e2', insertAtIndex: 0 },
    )).toBe(false);
  });

  it('header-row: never filtered (rows are few; phantom no-op slots not perceptible)', async () => {
    const { isNoopTargetFor } = await import('./DragController');
    expect(isNoopTargetFor(
      { kind: 'header-row', rowKey: 'name', headerId: 'h' },
      { kind: 'header-row-slot', headerId: 'h', insertAtIndex: 0 },
    )).toBe(false);
  });
});

/* ─── buildHypotheticalAtoms: preview must match commit semantics ─────────
 *
 * Same root cause as the Skills phantom-swap. `moveEntry` interprets
 * `insertAtIndex` in the section's ORIGINAL entries[] space and decrements by
 * one for same-section drags where dst > srcIdx (because removing src shifts
 * subsequent indices down). The preview's hypothetical atom list must match
 * that adjustment, otherwise previewLayouts (engine path) shows one extra
 * atom shifted — preview lies, commit doesn't.
 *
 * Symptom before fix: dragging P (idx 0) down to insertAtIndex=2 (intended
 * "swap with F") showed BOTH F AND D shifted up in preview, while commit
 * only swapped P with F.
 */
describe('buildHypotheticalAtoms entry-slot adjustment', () => {
  // 4-entry section gives us the canonical [P, F, D, I] case.
  function setupFourEntries() {
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        sections: [
          { id: 's1', role: 'experience', heading: 'Exp', entries: [
            { id: 'p', title: 'P', meta: '', bullets: [] },
            { id: 'f', title: 'F', meta: '', bullets: [] },
            { id: 'd', title: 'D', meta: '', bullets: [] },
            { id: 'i', title: 'I', meta: '', bullets: [] },
          ]},
        ],
      },
      bulletMeta: {},
    });
  }

  // Pull just the entry ids in order from a hypothetical atom list (drop the
  // header / section-heading atoms so the assertion stays focused on entry
  // ordering — the only thing the preview actually moves around).
  function entryIds(atoms: ReturnType<typeof projectAtoms>): string[] {
    return atoms.filter(a => a.kind === 'entry').map(a => a.sourceBlockId);
  }

  it('same-section dst > srcIdx: result matches moveEntry (Skills bug fix)', () => {
    setupFourEntries();
    const atoms = projectAtoms(useResumeStore.getState().resume!);
    const result = buildHypotheticalAtoms(
      { kind: 'entry', id: 'p', sectionId: 's1' },
      { kind: 'entry-slot', sectionId: 's1', insertAtIndex: 2 },   // "swap with F"
      atoms,
    );
    expect(result).not.toBeNull();
    // Expected: P after F, before D = [F, P, D, I] — NOT [F, D, P, I].
    expect(entryIds(result!)).toEqual(['f', 'p', 'd', 'i']);
  });

  it('same-section dst at end: P moves to tail', () => {
    setupFourEntries();
    const atoms = projectAtoms(useResumeStore.getState().resume!);
    const result = buildHypotheticalAtoms(
      { kind: 'entry', id: 'p', sectionId: 's1' },
      { kind: 'entry-slot', sectionId: 's1', insertAtIndex: 4 },
      atoms,
    );
    expect(entryIds(result!)).toEqual(['f', 'd', 'i', 'p']);
  });

  it('same-section dst < srcIdx: no adjustment needed (drag up)', () => {
    setupFourEntries();
    const atoms = projectAtoms(useResumeStore.getState().resume!);
    // Drag I (idx 3) up to insertAtIndex=1 ("between P and F" → swap with F).
    const result = buildHypotheticalAtoms(
      { kind: 'entry', id: 'i', sectionId: 's1' },
      { kind: 'entry-slot', sectionId: 's1', insertAtIndex: 1 },
      atoms,
    );
    expect(entryIds(result!)).toEqual(['p', 'i', 'f', 'd']);
  });

  it('cross-section: no adjustment (target section unaffected by removing src)', () => {
    useResumeStore.setState({
      resume: {
        ...structuredClone(RESUME),
        sections: [
          { id: 's1', role: 'experience', heading: 'Exp', entries: [
            { id: 'p', title: 'P', meta: '', bullets: [] },
            { id: 'f', title: 'F', meta: '', bullets: [] },
          ]},
          { id: 's2', role: 'skills', heading: 'Skills', entries: [
            { id: 'a', title: 'A', meta: '', bullets: [] },
            { id: 'b', title: 'B', meta: '', bullets: [] },
          ]},
        ],
      },
      bulletMeta: {},
    });
    const atoms = projectAtoms(useResumeStore.getState().resume!);
    // Move P from s1 into s2 at insertAtIndex=1 (between A and B).
    const result = buildHypotheticalAtoms(
      { kind: 'entry', id: 'p', sectionId: 's1' },
      { kind: 'entry-slot', sectionId: 's2', insertAtIndex: 1 },
      atoms,
    );
    expect(entryIds(result!)).toEqual(['f', 'a', 'p', 'b']);
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

/* ─── AI lock blocks drag (spec § 6.2 / Task 19) ──────────────────────────
 *
 * When the AI lock store has the source block (or its parent) flagged as
 * locked, startDrag must return a no-op session BEFORE setPointerCapture or
 * any pointer-event listeners attach. No preview, no commit, no undo entry.
 */
describe('AI lock blocks drag (spec § 6.2)', () => {
  beforeEach(() => {
    useResumeStore.setState({ resume: structuredClone(RESUME), bulletMeta: {} });
    useResumeStore.getState()._undo.clear();
    _resetTransactionCounter();
    useAILockStore.setState({ lockedBlockIds: new Set() });
  });

  afterEach(() => {
    useAILockStore.setState({ lockedBlockIds: new Set() });
  });

  it('startDrag returns a no-op session when block is locked', () => {
    useAILockStore.getState().lock(['e1']);
    // Build a fake handle element + pointer event:
    const handleEl = document.createElement('div');
    document.body.appendChild(handleEl);
    handleEl.setPointerCapture = () => {};
    handleEl.releasePointerCapture = () => {};
    const session = startDrag(
      { pointerId: 1, clientX: 0, clientY: 0 } as unknown as PointerEvent,
      handleEl,
      { kind: 'entry', id: 'e1', sectionId: 's1' },
      () => {},
    );
    // Move + up — nothing should happen, no preview / no selection / no commit.
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    // No undo entry should have appeared:
    expect(useResumeStore.getState()._undo.canUndo()).toBe(false);
    // And the returned session is a no-op shape (cancel callable, nothing else).
    expect(typeof session.cancel).toBe('function');
    handleEl.remove();
  });
});
