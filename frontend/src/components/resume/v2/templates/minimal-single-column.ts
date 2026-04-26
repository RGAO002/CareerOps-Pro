// frontend/src/components/resume/v2/templates/minimal-single-column.ts
import type { TemplateConfig } from '../layout/normalize-template';
import { PAGE_SPEC } from '../tokens/layout-tokens';

export const MINIMAL_SINGLE_COLUMN: TemplateConfig = {
  id: 'minimal-single-column',
  layoutStrategyId: 'single-column',
  page: {
    width: PAGE_SPEC.WIDTH,
    height: PAGE_SPEC.HEIGHT,
    margin: { ...PAGE_SPEC.MARGIN },
  },
  theme: {
    fontFamily: 'var(--font-resume), Inter, sans-serif',
    bodyFontSize: 14,
    bodyLineHeight: 1.5,
    bodyColor: '#374151',
    headingFontSize: 26,
    headingColor: '#111827',
    sectionHeadingFontSize: 11,
    sectionHeadingLetterSpacing: '0.14em',
    sectionHeadingColor: '#6b7280',
    accent: '#2563eb',
  },
  columnMapping: { default: 'main' },
};
