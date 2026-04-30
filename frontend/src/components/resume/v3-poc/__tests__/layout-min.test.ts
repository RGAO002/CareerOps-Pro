import { describe, it, expect } from 'vitest';
import { computeLayout } from '../layout-min';

function makeElement(heightPx: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ height: heightPx, top: 0, bottom: heightPx, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return el;
}

describe('computeLayout', () => {
  const baseInput = { pageHeightPx: 1000, marginTopPx: 100, marginBottomPx: 100, screenGapPx: 32 };

  it('places all rows on one page when total height fits', () => {
    const rows = [makeElement(100), makeElement(200), makeElement(300)];
    const out = computeLayout({ ...baseInput, rowElements: rows });
    expect(out.pageBreaks).toEqual([]);
    expect(out.pageGeometries).toHaveLength(1);
    expect(out.pageGeometries[0]).toEqual({ pageIndex: 0, topPx: 0, heightPx: 1000 });
  });

  it('breaks to a new page when next row would overflow; emits per-break screen height; cards on fixed grid', () => {
    // contentHeight = 1000 - 200 = 800. Rows 400 + 400 = 800 fits exactly, 400 more does not.
    const rows = [makeElement(400), makeElement(400), makeElement(400)];
    const out = computeLayout({ ...baseInput, rowElements: rows });

    expect(out.pageBreaks).toHaveLength(1);
    expect(out.pageBreaks[0].afterRowIndex).toBe(1);
    expect(out.pageBreaks[0].pageIndex).toBe(0);
    // remaining space = 800 - 800 = 0. screenHeightPx = 0 + 100 + 32 + 100 = 232 (flow fill).
    expect(out.pageBreaks[0].screenHeightPx).toBe(232);

    // Page cards sit on the fixed visual grid: page2.top = 1 × (pageHeight + gap) = 1032.
    // Independent of break flow height; it's a fixed-grid layout.
    expect(out.pageGeometries).toHaveLength(2);
    expect(out.pageGeometries[0]).toEqual({ pageIndex: 0, topPx: 0, heightPx: 1000 });
    expect(out.pageGeometries[1]).toEqual({ pageIndex: 1, topPx: 1032, heightPx: 1000 });
  });

  it('break that happens early because next row is tall produces larger flow-fill height; card grid unchanged', () => {
    // contentHeight = 800. Row 1 = 400 (fits). Row 2 = 600 (would overflow → break before it).
    // Remaining space at break = 800 - 400 = 400. screenHeightPx = 400 + 100 + 32 + 100 = 632.
    const rows = [makeElement(400), makeElement(600)];
    const out = computeLayout({ ...baseInput, rowElements: rows });

    expect(out.pageBreaks).toHaveLength(1);
    expect(out.pageBreaks[0].screenHeightPx).toBe(632);
    // Page 2 card position is the SAME 1032 as the previous test, even though
    // the break flow-fill height differs. The card grid is independent of
    // when content broke.
    expect(out.pageGeometries[1].topPx).toBe(1032);
  });

  it('three-page document: card grid spans 0, 1032, 2064', () => {
    // 6 rows of 400 each → 3 pages: rows[0..1] on p0, rows[2..3] on p1, rows[4..5] on p2.
    const rows = Array.from({ length: 6 }, () => makeElement(400));
    const out = computeLayout({ ...baseInput, rowElements: rows });

    expect(out.pageGeometries).toHaveLength(3);
    expect(out.pageGeometries[0].topPx).toBe(0);
    expect(out.pageGeometries[1].topPx).toBe(1032);
    expect(out.pageGeometries[2].topPx).toBe(2064);
  });

  it('handles a single row that exceeds page height (no infinite loop)', () => {
    const rows = [makeElement(2000)];
    const out = computeLayout({ ...baseInput, rowElements: rows });
    expect(out.pageBreaks).toEqual([]);
    expect(out.pageGeometries).toHaveLength(1);
  });
});
