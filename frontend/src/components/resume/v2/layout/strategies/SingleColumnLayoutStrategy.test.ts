// frontend/src/components/resume/v2/layout/strategies/SingleColumnLayoutStrategy.test.ts
import { describe, it, expect } from 'vitest';
import { SingleColumnLayoutStrategy } from './SingleColumnLayoutStrategy';
import { normalizeTemplate } from '../normalize-template';
import type { LayoutAtom, AtomId } from '../../types';

const TEMPLATE = normalizeTemplate({
  id: 'fix', layoutStrategyId: 'single-column',
  page: { width: '8.5in', height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' } },
  theme: {} as any,
});
// contentHeight = 9.5in = 912 px

const headerAtom = (id: string): LayoutAtom =>
  ({ kind: 'header', id, sourceBlockId: id, keepWithNext: false });
const headingAtom = (id: string): LayoutAtom =>
  ({ kind: 'section-heading', id, sourceBlockId: id, keepWithNext: true });
const entryAtom = (id: string): LayoutAtom =>
  ({ kind: 'entry', id, sourceBlockId: id, keepWithNext: false });

function heights(map: Record<string, number>): Map<AtomId, number> {
  return new Map(Object.entries(map));
}

describe('SingleColumnLayoutStrategy.computeLayout', () => {
  it('places everything on page 1 if it fits', () => {
    const atoms = [headerAtom('h'), headingAtom('s1'), entryAtom('e1')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ h: 100, s1: 30, e1: 200 }),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(1);
    expect(r.atomLayouts.get('h')?.pageIndex).toBe(0);
    expect(r.atomLayouts.get('e1')?.pageIndex).toBe(0);
  });

  it('breaks to page 2 when chain does not fit', () => {
    // contentHeight 912; first 3 atoms total 900 → page 1; 4th atom 50 → page 2
    const atoms = [headerAtom('h'), entryAtom('e1'), entryAtom('e2'), entryAtom('e3')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ h: 300, e1: 300, e2: 280, e3: 50 }),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(2);
    expect(r.atomLayouts.get('e3')?.pageIndex).toBe(1);
  });

  it('keepWithNext binds heading to following entry', () => {
    // heading(30) + entry(900): together 930+gap > 912, so they should both
    // jump to next page if there's anything before them filling page 1.
    const atoms = [
      entryAtom('big'),
      headingAtom('s1'),
      entryAtom('e1'),
    ];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ big: 800, s1: 30, e1: 100 }),
      template: TEMPLATE,
    });
    // big takes 800; chain heading+e1 = 30+12+100 = 142; total page 1 = 800+12+142 = 954 > 912.
    // So heading and e1 must move together to page 2.
    expect(r.atomLayouts.get('s1')?.pageIndex).toBe(1);
    expect(r.atomLayouts.get('e1')?.pageIndex).toBe(1);
  });

  it('oversized single chain at top of page accepts overflow', () => {
    const atoms = [entryAtom('huge')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ huge: 2000 }),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(1);
    expect(r.atomLayouts.get('huge')?.pageIndex).toBe(0);
  });

  it('does NOT produce phantom trailing blank page after oversized', () => {
    // One oversized atom followed by nothing — pageCount must be 1, not 2
    const atoms = [entryAtom('huge')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ huge: 2000 }),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(1);
  });

  it('does NOT produce phantom blank page when last atom fills page exactly', () => {
    const atoms = [entryAtom('e1'), entryAtom('e2')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      // e1 fills page 1 exactly at 912; e2 goes to page 2
      measuredHeights: heights({ e1: 912, e2: 100 }),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(2);
  });

  it('empty atoms array → 1 empty page', () => {
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms: [],
      measuredHeights: new Map(),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(1);
    expect(r.atomLayouts.size).toBe(0);
  });

  it('chain of 3 (heading+heading+entry, defensive) all jump together', () => {
    const atoms = [
      entryAtom('big'),
      headingAtom('s1'),
      headingAtom('s2'),         // extremely defensive
      entryAtom('e1'),
    ];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ big: 800, s1: 30, s2: 30, e1: 200 }),
      template: TEMPLATE,
    });
    // chain s1+s2+e1 must end up on same page
    const p1 = r.atomLayouts.get('s1')?.pageIndex;
    const p2 = r.atomLayouts.get('s2')?.pageIndex;
    const p3 = r.atomLayouts.get('e1')?.pageIndex;
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
  });

  it('atoms have correct width (page content width)', () => {
    const atoms = [entryAtom('e1')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ e1: 100 }),
      template: TEMPLATE,
    });
    expect(r.atomLayouts.get('e1')?.width).toBeCloseTo(TEMPLATE.page.contentWidthPx, 5);
  });
});

describe('SingleColumnLayoutStrategy.describeColumns', () => {
  it('returns single main column at full content width', () => {
    const cols = SingleColumnLayoutStrategy.describeColumns(TEMPLATE);
    expect(cols).toHaveLength(1);
    expect(cols[0].id).toBe('main');
    expect(cols[0].xWithinPage).toBe(0);
    expect(cols[0].width).toBeCloseTo(TEMPLATE.page.contentWidthPx, 5);
  });
});
