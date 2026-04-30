// frontend/src/components/resume/v2/layout/strategies/SingleColumnLayoutStrategy.ts
import type { LayoutAtom, AtomLayout, AtomId } from '../../types';
import type { NormalizedTemplate } from '../normalize-template';
import type { LayoutStrategy, ColumnSpec, ComputeLayoutInput, ComputeLayoutOutput } from './index';

export const SingleColumnLayoutStrategy: LayoutStrategy = {
  computeLayout({ atoms, measuredHeights, template }: ComputeLayoutInput): ComputeLayoutOutput {
    const contentHeight = template.page.contentHeightPx;
    const contentWidth = template.page.contentWidthPx;
    const gap = template.atom.gapPx;
    const result = new Map<AtomId, AtomLayout>();

    let pageIdx = 0;
    let cursorY = 0;
    let i = 0;

    while (i < atoms.length) {
      // Build keep-with-next chain starting at i
      const chain: LayoutAtom[] = [atoms[i]];
      let j = i;
      while (atoms[j].keepWithNext && j + 1 < atoms.length) {
        chain.push(atoms[j + 1]);
        j++;
      }
      const innerGapsHeight = (chain.length - 1) * gap;
      const chainContentHeight = chain.reduce(
        (sum, a) => sum + (measuredHeights.get(a.id) ?? 0), 0
      );
      const chainHeight = chainContentHeight + innerGapsHeight;

      const wouldUse = cursorY + chainHeight + (cursorY > 0 ? gap : 0);

      if (wouldUse <= contentHeight) {
        // Fits. Place chain on current page.
        const startY = cursorY === 0 ? 0 : cursorY + gap;
        let y = startY;
        for (const atom of chain) {
          const h = measuredHeights.get(atom.id) ?? 0;
          result.set(atom.id, {
            pageIndex: pageIdx,
            xWithinPage: 0,
            yWithinPage: y,
            width: contentWidth,
            height: h,
          });
          y += h + gap;
        }
        cursorY = y - gap;       // strip trailing gap
        i += chain.length;
      } else if (cursorY === 0) {
        // Already at top of page and chain still doesn't fit → accept overflow on this page
        let y = 0;
        for (const atom of chain) {
          const h = measuredHeights.get(atom.id) ?? 0;
          result.set(atom.id, {
            pageIndex: pageIdx,
            xWithinPage: 0,
            yWithinPage: y,
            width: contentWidth,
            height: h,
          });
          y += h + gap;
        }
        i += chain.length;
        // Only advance to next page if there are more atoms — prevents phantom blank page
        if (i < atoms.length) {
          pageIdx++;
          cursorY = 0;
        }
      } else {
        // Doesn't fit but page has content → flip to next page and retry (don't increment i)
        pageIdx++;
        cursorY = 0;
      }
    }

    // Compute pageCount from actual assignments (defense vs phantom)
    let maxPage = 0;
    for (const layout of result.values()) {
      if (layout.pageIndex > maxPage) maxPage = layout.pageIndex;
    }
    return { atomLayouts: result, pageCount: maxPage + 1 };
  },

  describeColumns(template: NormalizedTemplate): ColumnSpec[] {
    return [
      {
        id: 'main',
        xWithinPage: 0,
        width: template.page.contentWidthPx,
      },
    ];
  },
};
