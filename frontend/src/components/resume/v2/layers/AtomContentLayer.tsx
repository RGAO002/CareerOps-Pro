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

  /**
   * Compute the shift offset for atom at `atomIndex`, simulating the post-move
   * layout so atoms slide cleanly without the dragged group's faded ghost
   * staying behind.
   *
   * The dragged "group" can be:
   *   - a single entry atom (entry drag), OR
   *   - a section heading + all its entries as a contiguous range (section
   *     drag — group lifts together so the user sees the whole section move).
   *
   * Algorithm (Notion-style, generalized for ranges):
   *   group = [srcStart, srcEnd)
   *   - If srcStart < dst (moving DOWN): atoms in [srcEnd, dst) shift UP by H
   *     (close the group's gap; opens a slot at dst).
   *   - If srcStart > dst (moving UP): atoms in [dst, srcStart) shift DOWN
   *     by H (open a slot at dst; group will fill above).
   *   - Atoms inside the group: hidden.
   */
  function shiftFor(atomId: AtomId, atomIndex: number): number {
    if (!preview || preview.kind !== 'atom') return 0;
    if (preview.draggedAtomIds.includes(atomId)) return 0;
    if (preview.dstAtomIndex === null) return 0;
    const srcStart = preview.srcStartIdx;
    const srcEnd = preview.srcEndIdx;
    const dst = preview.dstAtomIndex;
    const H = preview.draggedHeight + DROP_SLOT_GAP_PX;
    if (srcStart < dst) {
      if (atomIndex >= srcEnd && atomIndex < dst) return -H;
    } else if (srcStart > dst) {
      if (atomIndex >= dst && atomIndex < srcStart) return H;
    }
    return 0;
  }

  function isDragged(atomId: AtomId): boolean {
    return preview?.kind === 'atom' && preview.draggedAtomIds.includes(atomId);
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
        const dragged = isDragged(atom.id);
        const shift = shiftFor(atom.id, idx);
        return (
          <div
            key={atom.id}
            style={{
              position: 'absolute',
              top: coord.top,
              left: coord.left,
              width: layout.width,
              pointerEvents: dragged ? 'none' : 'auto',
              // Always set transform (even at 0px) so CSS can transition
              // smoothly between values.
              transform: `translateY(${shift}px)`,
              transition: 'transform 0.18s ease-out, opacity 0.12s ease-out, visibility 0s',
              // Hide the dragged atom completely — the floating ghost shows
              // where it's headed. visibility: hidden keeps the slot in
              // layout (so subscribers' getBoundingClientRect stays stable)
              // but no pixels render.
              opacity: dragged ? 0 : 1,
              visibility: dragged ? 'hidden' : 'visible',
              willChange: preview ? 'transform, opacity' : undefined,
            }}
          >
            <AtomRenderer atom={atom} resume={resume} mode={mode} registry={registry} />
          </div>
        );
      })}
    </div>
  );
}
