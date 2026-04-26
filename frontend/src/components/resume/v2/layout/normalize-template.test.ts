// frontend/src/components/resume/v2/layout/normalize-template.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeTemplate } from './normalize-template';
import { PX_PER_INCH } from '../tokens/layout-tokens';

const FIXTURE = {
  id: 'fixture',
  layoutStrategyId: 'single-column' as const,
  page: {
    width: '8.5in',
    height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' },
  },
  theme: {
    fontFamily: 'Inter',
    bodyFontSize: 14, bodyLineHeight: 1.5, bodyColor: '#000',
    headingFontSize: 26, headingColor: '#000',
    sectionHeadingFontSize: 11, sectionHeadingLetterSpacing: '0.14em',
    sectionHeadingColor: '#666', accent: '#2563eb',
  },
};

describe('normalizeTemplate', () => {
  it('parses page geometry to px floats', () => {
    const n = normalizeTemplate(FIXTURE);
    expect(n.page.widthPx).toBe(8.5 * PX_PER_INCH);
    expect(n.page.heightPx).toBe(11 * PX_PER_INCH);
    expect(n.page.contentWidthPx).toBeCloseTo(6.7 * PX_PER_INCH, 2);
    expect(n.page.contentHeightPx).toBeCloseTo(9.5 * PX_PER_INCH, 2);
  });
  it('parses atom gap', () => {
    const n = normalizeTemplate(FIXTURE);
    expect(n.atom.gapPx).toBe(12);
  });
  it('fills column mapping defaults', () => {
    const n = normalizeTemplate(FIXTURE);
    expect(n.columnMapping.default).toBe('main');
    expect(n.columnMapping.skills).toBe('main');
  });
  it('overrides column mapping when provided', () => {
    const n = normalizeTemplate({
      ...FIXTURE,
      columnMapping: { skills: 'sidebar', default: 'main' },
    });
    expect(n.columnMapping.skills).toBe('sidebar');
    expect(n.columnMapping.experience).toBe('main');
  });
});
