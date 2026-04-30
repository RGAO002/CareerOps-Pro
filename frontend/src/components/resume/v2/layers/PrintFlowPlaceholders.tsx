// frontend/src/components/resume/v2/layers/PrintFlowPlaceholders.tsx
'use client';
import { gapForMode } from '../layout/coords';
import type { CanvasMode } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';

interface Props {
  pageCount: number;
  mode: CanvasMode;
  template: NormalizedTemplate;
}

/**
 * Static block-flow placeholders. Their height drives the document's natural
 * height; in print mode each one gets `break-after: page` so Chromium splits
 * the PDF on those exact boundaries instead of trying to slice absolute content.
 */
export function PrintFlowPlaceholders({ pageCount, mode, template }: Props) {
  const gap = gapForMode(mode);
  return (
    <div
      className="print-flow-placeholders"
      aria-hidden
      style={{ position: 'relative', visibility: 'hidden', pointerEvents: 'none' }}
    >
      {Array.from({ length: pageCount }).map((_, i) => (
        <div
          key={i}
          className="print-page-placeholder"
          style={{
            height: template.page.heightPx,
            marginBottom: i < pageCount - 1 ? gap : 0,
            breakAfter: mode === 'export' ? 'page' : 'auto',
          }}
        />
      ))}
    </div>
  );
}
