// frontend/src/components/resume/v2/layout/strategies/__tests__/MockTwoColumnLayoutStrategy.test.ts
import { describe, it, expect } from 'vitest';
import type { LayoutStrategy } from '../index';
import type { LayoutAtom } from '../../../types';
import { normalizeTemplate } from '../../normalize-template';

/** Demonstrates that the LayoutStrategy interface supports multi-column without
 * editor changes. v2 does not ship this — it only proves pluggability. */
const MockTwoColumnLayoutStrategy: LayoutStrategy = {
  computeLayout({ atoms, measuredHeights, template }) {
    const layouts = new Map();
    const half = template.page.contentWidthPx / 2;
    let mainY = 0, sideY = 0;
    for (const atom of atoms) {
      const h = measuredHeights.get(atom.id) ?? 0;
      const useSidebar = atom.kind === 'section-heading' && (atom as any).id.includes('skills');
      layouts.set(atom.id, {
        pageIndex: 0,
        xWithinPage: useSidebar ? 0 : half,
        yWithinPage: useSidebar ? sideY : mainY,
        width: half,
        height: h,
      });
      if (useSidebar) sideY += h; else mainY += h;
    }
    return { atomLayouts: layouts, pageCount: 1 };
  },
  describeColumns(template) {
    const w = template.page.contentWidthPx / 2;
    return [
      { id: 'sidebar', xWithinPage: 0, width: w },
      { id: 'main', xWithinPage: w, width: w },
    ];
  },
};

describe('Mock TwoColumnLayoutStrategy', () => {
  it('demonstrates the LayoutStrategy interface is pluggable', () => {
    const template = normalizeTemplate({
      id: 'mock', layoutStrategyId: 'single-column' as any,
      page: { width: '8.5in', height: '11in',
        margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' } },
      theme: {} as any,
    });
    const atoms: LayoutAtom[] = [
      { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false },
      { kind: 'section-heading', id: 'skills-1', sourceBlockId: 'skills-1', keepWithNext: true },
    ];
    const heights = new Map([['h', 50], ['skills-1', 30]]);
    const result = MockTwoColumnLayoutStrategy.computeLayout({
      atoms, measuredHeights: heights, template,
    });
    expect(result.atomLayouts.get('h')?.xWithinPage).toBeGreaterThan(0);  // main column
    expect(result.atomLayouts.get('skills-1')?.xWithinPage).toBe(0);     // sidebar
    expect(MockTwoColumnLayoutStrategy.describeColumns(template)).toHaveLength(2);
  });
});
