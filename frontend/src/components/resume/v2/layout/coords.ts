// frontend/src/components/resume/v2/layout/coords.ts
import { parseToPx, SCREEN_GAP, PRINT_GAP } from '../tokens/layout-tokens';
import type { AtomLayout, CanvasMode } from '../types';
import type { NormalizedTemplate } from './normalize-template';

export const SCREEN_GAP_PX = parseToPx(SCREEN_GAP);
export const PRINT_GAP_PX = parseToPx(PRINT_GAP);

export function gapForMode(mode: CanvasMode): number {
  return mode === 'edit' ? SCREEN_GAP_PX : PRINT_GAP_PX;
}

export function getAtomAbsoluteCoord(
  atomLayout: AtomLayout,
  mode: CanvasMode,
  template: NormalizedTemplate,
): { top: number; left: number } {
  const gap = gapForMode(mode);
  const pageStride = template.page.heightPx + gap;
  return {
    top: atomLayout.pageIndex * pageStride
       + template.page.marginPx.top
       + atomLayout.yWithinPage,
    left: template.page.marginPx.left + atomLayout.xWithinPage,
  };
}

export function getPageCardTop(pageIndex: number, mode: CanvasMode, template: NormalizedTemplate): number {
  const gap = gapForMode(mode);
  return pageIndex * (template.page.heightPx + gap);
}

export function totalCanvasHeight(pageCount: number, mode: CanvasMode, template: NormalizedTemplate): number {
  const gap = gapForMode(mode);
  return pageCount * template.page.heightPx + Math.max(0, pageCount - 1) * gap;
}
