// frontend/src/components/resume/v2/layout/normalize-template.ts
import { parseToPx } from '../tokens/layout-tokens';
import type { SectionRole } from '../types';

export type LayoutStrategyId = 'single-column';
export type ColumnId = 'main' | 'sidebar';

export type PageSpec = {
  width: string;
  height: string;
  margin: { top: string; right: string; bottom: string; left: string };
};

export type TemplateTheme = {
  fontFamily: string;
  bodyFontSize: number;
  bodyLineHeight: number;
  bodyColor: string;
  headingFontSize: number;
  headingColor: string;
  sectionHeadingFontSize: number;
  sectionHeadingLetterSpacing: string;
  sectionHeadingColor: string;
  accent: string;
};

export type TemplateConfig = {
  id: string;
  layoutStrategyId: LayoutStrategyId;
  page: PageSpec;
  theme: TemplateTheme;
  columnMapping?: Partial<Record<SectionRole | 'default', ColumnId>>;
};

export type ResolvedColumnMapping = Record<SectionRole | 'default', ColumnId>;

const DEFAULT_MAPPING: ResolvedColumnMapping = {
  default: 'main',
  summary: 'main',
  skills: 'main',
  experience: 'main',
  projects: 'main',
  education: 'main',
  awards: 'main',
  publications: 'main',
  custom: 'main',
};

export type NormalizedTemplate = {
  id: string;
  layoutStrategyId: LayoutStrategyId;
  page: {
    widthPx: number;
    heightPx: number;
    marginPx: { top: number; right: number; bottom: number; left: number };
    contentWidthPx: number;
    contentHeightPx: number;
  };
  atom: { gapPx: number };
  theme: TemplateTheme;
  columnMapping: ResolvedColumnMapping;
};

export function normalizeTemplate(
  config: TemplateConfig,
  atomGap: string = '12px',
): NormalizedTemplate {
  const widthPx = parseToPx(config.page.width);
  const heightPx = parseToPx(config.page.height);
  const margin = {
    top: parseToPx(config.page.margin.top),
    right: parseToPx(config.page.margin.right),
    bottom: parseToPx(config.page.margin.bottom),
    left: parseToPx(config.page.margin.left),
  };
  return {
    id: config.id,
    layoutStrategyId: config.layoutStrategyId,
    page: {
      widthPx,
      heightPx,
      marginPx: margin,
      contentWidthPx: widthPx - margin.left - margin.right,
      contentHeightPx: heightPx - margin.top - margin.bottom,
    },
    atom: { gapPx: parseToPx(atomGap) },
    theme: config.theme,
    columnMapping: { ...DEFAULT_MAPPING, ...(config.columnMapping ?? {}) },
  };
}
