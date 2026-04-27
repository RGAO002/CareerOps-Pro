// frontend/src/components/resume/v2/layers/AtomContentLayer.test.tsx
//
// Verifies the LAYOUT-AWARE drag-preview shift path: when a DragPreview carries
// a `previewLayouts` map (computed by LayoutEngine.previewLayout on a
// hypothetical post-drop atom list), AtomContentLayer translates each displaced
// atom by `postDropTop - currentTop` instead of the local +H/-H stub. This is
// what makes cross-page drops animate to the correct destination instead of
// landing in the inter-page gap.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { AtomContentLayer } from './AtomContentLayer';
import { normalizeTemplate } from '../layout/normalize-template';
import { setDragPreview } from '../interaction/drag-preview-state';
import type { LayoutAtom, AtomLayout, AtomId, ResumeDoc } from '../types';

const TEMPLATE = normalizeTemplate({
  id: 'fix', layoutStrategyId: 'single-column',
  page: { width: '8.5in', height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' } },
  theme: {} as any,
});

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: '', meta: '', bullets: [] },
      { id: 'e2', title: '', meta: '', bullets: [] },
    ]},
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

const ATOMS: LayoutAtom[] = [
  { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false },
  { kind: 'section-heading', id: 's1', sourceBlockId: 's1', keepWithNext: true },
  { kind: 'entry', id: 'e1', sourceBlockId: 'e1', keepWithNext: false },
  { kind: 'entry', id: 'e2', sourceBlockId: 'e2', keepWithNext: false },
];

function layoutAt(pageIndex: number, yWithinPage: number): AtomLayout {
  return { pageIndex, xWithinPage: 0, yWithinPage, width: 500, height: 100 };
}

describe('AtomContentLayer layout-aware drag preview', () => {
  beforeEach(() => setDragPreview(null));
  afterEach(() => setDragPreview(null));

  it('translates by postDropTop - currentTop when previewLayouts is present', () => {
    // Current layout: e1 at page 0 y=200, e2 at page 0 y=400. Pretend the user
    // dragged e1 to AFTER e2 — engine's hypothetical layout has e2 at y=200,
    // e1 at y=400. So e2's shift should be (currentTop=400) → (postDropTop=200)
    // = -200. The legacy +H stub (with H≈100) would say -100. We assert the
    // layout-aware path wins.
    const layouts = new Map<AtomId, AtomLayout>([
      ['h',  layoutAt(0, 0)],
      ['s1', layoutAt(0, 100)],
      ['e1', layoutAt(0, 200)],
      ['e2', layoutAt(0, 400)],
    ]);
    const previewLayouts = new Map<AtomId, AtomLayout>([
      ['h',  layoutAt(0, 0)],
      ['s1', layoutAt(0, 100)],
      ['e2', layoutAt(0, 200)],   // moved up
      ['e1', layoutAt(0, 400)],   // moved down
    ]);
    let container!: HTMLElement;
    act(() => {
      ({ container } = render(
        <AtomContentLayer
          atoms={ATOMS}
          layouts={layouts}
          resume={RESUME}
          mode="edit"
          template={TEMPLATE}
        />,
      ));
    });
    act(() => {
      setDragPreview({
        kind: 'atom',
        draggedAtomIds: ['e1'],
        draggedHeight: 100,
        srcStartIdx: 2, srcEndIdx: 3,
        dstAtomIndex: 4,
        previewLayouts,
      });
    });
    // e2 wrapper should have transform: translateY(-200px). Each atom's outer
    // wrapper is the grandparent of [data-block-id] (wrapper > AtomRenderer-div
    // (data-atom-id) > content-div (data-block-id)).
    const e2Wrapper = container.querySelector('[data-atom-id="e2"]')!.parentElement!;
    expect(e2Wrapper.style.transform).toBe('translateY(-200px)');

    // e1 (the dragged atom) is hidden — opacity 0, visibility hidden.
    const e1Wrapper = container.querySelector('[data-atom-id="e1"]')!.parentElement!;
    expect(e1Wrapper.style.visibility).toBe('hidden');

    // h and s1 are above the source — no shift.
    const hWrapper = container.querySelector('[data-atom-id="h"]')!.parentElement!;
    expect(hWrapper.style.transform).toBe('translateY(0px)');
  });

  it('falls back to legacy +H/-H math when previewLayouts is null', () => {
    // Same scenario but with previewLayouts: null — should use the legacy
    // path. With H = 100 + DROP_SLOT_GAP_PX(12) = 112 and srcStart < dst,
    // e2 (atomIndex=3, between srcEnd=3 and dst=4 → matches `>= srcEnd && < dst`)
    // shifts by -112.
    const layouts = new Map<AtomId, AtomLayout>([
      ['h',  layoutAt(0, 0)],
      ['s1', layoutAt(0, 100)],
      ['e1', layoutAt(0, 200)],
      ['e2', layoutAt(0, 400)],
    ]);
    let container!: HTMLElement;
    act(() => {
      ({ container } = render(
        <AtomContentLayer
          atoms={ATOMS}
          layouts={layouts}
          resume={RESUME}
          mode="edit"
          template={TEMPLATE}
        />,
      ));
    });
    act(() => {
      setDragPreview({
        kind: 'atom',
        draggedAtomIds: ['e1'],
        draggedHeight: 100,
        srcStartIdx: 2, srcEndIdx: 3,
        dstAtomIndex: 4,
        previewLayouts: null,
      });
    });
    const e2Wrapper = container.querySelector('[data-atom-id="e2"]')!.parentElement!;
    expect(e2Wrapper.style.transform).toBe('translateY(-112px)');
  });
});
