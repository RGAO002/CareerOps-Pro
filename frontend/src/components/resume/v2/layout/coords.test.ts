// frontend/src/components/resume/v2/layout/coords.test.ts
import { describe, it, expect } from 'vitest';
import { getAtomAbsoluteCoord, getPageCardTop, totalCanvasHeight, SCREEN_GAP_PX, PRINT_GAP_PX } from './coords';
import { normalizeTemplate } from './normalize-template';

const T = normalizeTemplate({
  id: 'fix', layoutStrategyId: 'single-column',
  page: { width: '8.5in', height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' } },
  theme: {} as any,
});

describe('coords', () => {
  it('SCREEN_GAP_PX = 16, PRINT_GAP_PX = 0', () => {
    expect(SCREEN_GAP_PX).toBe(16);
    expect(PRINT_GAP_PX).toBe(0);
  });

  it('getAtomAbsoluteCoord respects mode gap', () => {
    const layout = { pageIndex: 1, xWithinPage: 0, yWithinPage: 100, width: 0, height: 0 };
    const editTop = getAtomAbsoluteCoord(layout, 'edit', T).top;
    const exportTop = getAtomAbsoluteCoord(layout, 'export', T).top;
    expect(editTop).toBe(exportTop + SCREEN_GAP_PX);
  });

  it('getPageCardTop page 0 = 0', () => {
    expect(getPageCardTop(0, 'edit', T)).toBe(0);
  });

  it('totalCanvasHeight: 1 page = pageHeight, no gap', () => {
    expect(totalCanvasHeight(1, 'edit', T)).toBe(T.page.heightPx);
    expect(totalCanvasHeight(1, 'export', T)).toBe(T.page.heightPx);
  });

  it('totalCanvasHeight: 3 pages edit includes 2 gaps', () => {
    expect(totalCanvasHeight(3, 'edit', T))
      .toBe(3 * T.page.heightPx + 2 * SCREEN_GAP_PX);
  });

  it('totalCanvasHeight: 3 pages export has no gap', () => {
    expect(totalCanvasHeight(3, 'export', T)).toBe(3 * T.page.heightPx);
  });
});
