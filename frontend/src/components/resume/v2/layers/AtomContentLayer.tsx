// frontend/src/components/resume/v2/layers/AtomContentLayer.tsx
'use client';
import { useEffect, useState } from 'react';
import { AtomRenderer } from '../atoms/AtomRenderer';
import { getAtomAbsoluteCoord } from '../layout/coords';
import {
  getDragPreview,
  subscribeDragPreview,
  type DragPreview,
} from '../interaction/drag-preview-state';
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

// Visible gap (px) added on top of the dragged atom's height when shifting
// downstream atoms — gives the user a clear "slot" to drop into.
const DROP_SLOT_GAP_PX = 12;

export function AtomContentLayer({ atoms, layouts, resume, mode, template, registry }: Props) {
  const [preview, setPreview] = useState<DragPreview>(getDragPreview());

  useEffect(() => subscribeDragPreview(setPreview), []);

  /** How many pixels to translate this atom down to "make room" at the
   *  drop position. The dragged atom itself never shifts (it fades). */
  function shiftFor(atomId: AtomId, atomIndex: number): number {
    if (!preview) return 0;
    if (preview.draggedAtomId === atomId) return 0;
    if (preview.insertAtAtomIndex === null) return 0;
    if (atomIndex >= preview.insertAtAtomIndex) {
      return preview.draggedHeight + DROP_SLOT_GAP_PX;
    }
    return 0;
  }

  return (
    <div
      className="atom-content-layer"
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    >
      {atoms.map((atom, idx) => {
        const layout = layouts.get(atom.id);
        if (!layout) return null;
        const coord = getAtomAbsoluteCoord(layout, mode, template);
        const isDragging = preview?.draggedAtomId === atom.id;
        const shift = shiftFor(atom.id, idx);
        return (
          <div
            key={atom.id}
            style={{
              position: 'absolute',
              top: coord.top,
              left: coord.left,
              width: layout.width,
              pointerEvents: 'auto',
              transform: shift ? `translateY(${shift}px)` : undefined,
              transition: 'transform 0.18s ease-out, opacity 0.18s ease-out',
              opacity: isDragging ? 0.3 : 1,
            }}
          >
            <AtomRenderer atom={atom} resume={resume} mode={mode} registry={registry} />
          </div>
        );
      })}
    </div>
  );
}
