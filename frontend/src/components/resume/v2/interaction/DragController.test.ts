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

  it('switches when cursor crosses past midline by HYSTERESIS_PX (≥9 px)', () => {
    const block = { kind: 'bullet' as const, id: 'b1', entryId: 'e1' };
    const targets: DropTarget[] = getDropTargetsFor(block);
    findNearestDropTarget(145, block, targets);  // sticks index=0
    // Cursor at 160 → index=0 dist=60, index=1 dist=40 → delta = 20 > 8 → switch.
    const switched = findNearestDropTarget(160, block, targets);
    expect(switched).toEqual(expect.objectContaining({ insertAtIndex: 1 }));
  });
});
