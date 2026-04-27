// frontend/src/components/resume/v2/layers/AtomContentLayer.tsx
'use client';
import { AtomRenderer } from '../atoms/AtomRenderer';
import { getAtomAbsoluteCoord } from '../layout/coords';
import type { LayoutAtom, AtomLayout, AtomId, ResumeDoc, CanvasMode } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';
import type { AtomElementRegistry } from '../layout/AtomElementRegistry';

interface Props {
  atoms: LayoutAtom[];
  layouts: Map<AtomId, AtomLayout>;
  resume: ResumeDoc;
  mode: CanvasMode;
  template: NormalizedTemplate;
  registry?: AtomElementRegistry | null;
}

export function AtomContentLayer({ atoms, layouts, resume, mode, template, registry }: Props) {
  return (
    <div
      className="atom-content-layer"
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    >
      {atoms.map((atom) => {
        const layout = layouts.get(atom.id);
        if (!layout) return null;
        const coord = getAtomAbsoluteCoord(layout, mode, template);
        return (
          <div
            key={atom.id}
            style={{
              position: 'absolute',
              top: coord.top,
              left: coord.left,
              width: layout.width,
              pointerEvents: 'auto',
            }}
          >
            <AtomRenderer atom={atom} resume={resume} mode={mode} registry={registry} />
          </div>
        );
      })}
    </div>
  );
}
