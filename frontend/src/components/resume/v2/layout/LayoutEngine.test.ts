import { describe, it, expect, vi } from 'vitest';
import { LayoutEngine } from './LayoutEngine';
import { normalizeTemplate } from './normalize-template';
import type { LayoutAtom } from '../types';

const TEMPLATE = normalizeTemplate({
  id: 'fix', layoutStrategyId: 'single-column',
  page: { width: '8.5in', height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' } },
  theme: {} as any,
});

const atoms: LayoutAtom[] = [
  { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false },
];

describe('LayoutEngine', () => {
  it('requestRepaginate immediately calls onLayout when not composing', () => {
    const onLayout = vi.fn();
    const engine = new LayoutEngine({ onLayout });
    engine.setInputs(atoms, new Map([['h', 100]]), TEMPLATE);
    engine.requestRepaginate();
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('queues repaginate during composition, flushes on compositionend', () => {
    const onLayout = vi.fn();
    const engine = new LayoutEngine({ onLayout });
    engine.setInputs(atoms, new Map([['h', 100]]), TEMPLATE);
    engine.compositionBegin('ed-1');
    engine.requestRepaginate();
    expect(onLayout).not.toHaveBeenCalled();
    engine.compositionEnd('ed-1');
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('does not flush when other editors still composing', () => {
    const onLayout = vi.fn();
    const engine = new LayoutEngine({ onLayout });
    engine.setInputs(atoms, new Map([['h', 100]]), TEMPLATE);
    engine.compositionBegin('ed-1');
    engine.compositionBegin('ed-2');
    engine.requestRepaginate();
    engine.compositionEnd('ed-1');
    expect(onLayout).not.toHaveBeenCalled();
    engine.compositionEnd('ed-2');
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('isComposing reflects state', () => {
    const engine = new LayoutEngine({ onLayout: vi.fn() });
    expect(engine.isComposing()).toBe(false);
    engine.compositionBegin('ed-1');
    expect(engine.isComposing()).toBe(true);
    engine.compositionEnd('ed-1');
    expect(engine.isComposing()).toBe(false);
  });

  describe('previewLayout', () => {
    /* Drag-preview drives this method: AtomContentLayer asks "if the user
       drops here NOW, what's every atom's final layout?" each pointermove,
       so the displayed shift = postDropTop - currentTop is correct even
       when the drop crosses a page boundary. */

    it('does not mutate engine state or fire onLayout', () => {
      const onLayout = vi.fn();
      const engine = new LayoutEngine({ onLayout });
      engine.setInputs(atoms, new Map([['h', 100]]), TEMPLATE);
      const hypothetical: LayoutAtom[] = [
        { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false },
        { kind: 'entry',  id: 'e1', sourceBlockId: 'e1', keepWithNext: false },
      ];
      const result = engine.previewLayout(hypothetical);
      expect(onLayout).not.toHaveBeenCalled();
      expect(result.size).toBe(2);
    });

    it('returns true post-drop layout for an atom that crosses a page boundary', () => {
      // Page contentHeightPx for our 11in × 0.75in margins ≈ 912px (11*96 - 2*72).
      // Pack the page with two ~600px entries — second won't fit on page 1
      // and gets pushed to page 2.
      const onLayout = vi.fn();
      const engine = new LayoutEngine({ onLayout });
      const heights = new Map<string, number>([
        ['h', 100],   // page 1
        ['e1', 600],  // page 1 (100 + gap + 600 = 712)
        ['e2', 600],  // page 1 attempted: 712 + gap + 600 = 1324 > 912 → page 2
      ]);
      const initialAtoms: LayoutAtom[] = [
        { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false },
        { kind: 'entry',  id: 'e1', sourceBlockId: 'e1', keepWithNext: false },
        { kind: 'entry',  id: 'e2', sourceBlockId: 'e2', keepWithNext: false },
      ];
      engine.setInputs(initialAtoms, heights, TEMPLATE);
      engine.requestRepaginate();

      // Initial: e1 is on page 1.
      const initialLayout = onLayout.mock.calls[0][0].atomLayouts;
      expect(initialLayout.get('e1').pageIndex).toBe(0);
      expect(initialLayout.get('e2').pageIndex).toBe(1);

      // Hypothetical: dragged e1 moves AFTER e2. Now e2 is first (with header),
      // e1 should land on page 2.
      const hypothetical: LayoutAtom[] = [
        { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false },
        { kind: 'entry',  id: 'e2', sourceBlockId: 'e2', keepWithNext: false },
        { kind: 'entry',  id: 'e1', sourceBlockId: 'e1', keepWithNext: false },
      ];
      const preview = engine.previewLayout(hypothetical);
      expect(preview.get('e1')!.pageIndex).toBe(1);
      expect(preview.get('e2')!.pageIndex).toBe(0);
      // e2 is now first entry on page 1 (after header).
      // The shift for e2 = postDropTop - currentTop should reflect a real
      // upward move that crosses a page boundary (page 1 → page 0).
      expect(initialLayout.get('e2')!.pageIndex).toBe(1);
      expect(preview.get('e2')!.pageIndex).toBe(0);
    });

    it('returns empty map when template not yet set', () => {
      const engine = new LayoutEngine({ onLayout: vi.fn() });
      // Note: no setInputs() call — template is null.
      const result = engine.previewLayout([
        { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false },
      ]);
      expect(result.size).toBe(0);
    });
  });
});
