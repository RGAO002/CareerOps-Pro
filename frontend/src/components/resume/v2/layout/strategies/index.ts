// frontend/src/components/resume/v2/layout/strategies/index.ts
import type { LayoutAtom, AtomLayout, AtomId } from '../../types';
import type { NormalizedTemplate, ColumnId, LayoutStrategyId } from '../normalize-template';
import { SingleColumnLayoutStrategy } from './SingleColumnLayoutStrategy';

export type ComputeLayoutInput = {
  atoms: LayoutAtom[];
  measuredHeights: Map<AtomId, number>;
  template: NormalizedTemplate;
};

export type ComputeLayoutOutput = {
  atomLayouts: Map<AtomId, AtomLayout>;
  pageCount: number;
};

export type ColumnSpec = {
  id: ColumnId;
  xWithinPage: number;
  width: number;
};

export interface LayoutStrategy {
  computeLayout(input: ComputeLayoutInput): ComputeLayoutOutput;
  describeColumns(template: NormalizedTemplate): ColumnSpec[];
}

export const LAYOUT_STRATEGIES: Record<LayoutStrategyId, LayoutStrategy> = {
  'single-column': SingleColumnLayoutStrategy,
};
