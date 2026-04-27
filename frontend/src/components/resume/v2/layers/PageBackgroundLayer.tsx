// frontend/src/components/resume/v2/layers/PageBackgroundLayer.tsx
'use client';
import { getPageCardTop } from '../layout/coords';
import type { CanvasMode } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';

interface Props {
  pageCount: number;
  mode: CanvasMode;
  template: NormalizedTemplate;
}

export function PageBackgroundLayer({ pageCount, mode, template }: Props) {
  return (
    <div
      className="page-background-layer"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: pageCount }).map((_, i) => (
        <div
          key={i}
          className="page-card"
          data-page-index={i}
          style={{
            position: 'absolute',
            top: getPageCardTop(i, mode, template),
            left: 0,
            width: template.page.widthPx,
            height: template.page.heightPx,
            background: 'white',
            boxShadow: mode === 'edit'
              ? '0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)'
              : 'none',
          }}
        />
      ))}
    </div>
  );
}
