// frontend/src/components/resume/v3/layers/InteractionLayer.tsx
//
// T29 — InteractionLayer for v3 resume editor (M4).
//
// Responsibility
// --------------
// Renders the drop indicator + drag ghost on top of the v3 ProseMirror canvas
// during drag-and-drop. Subscribes to DragController state via props (the
// parent — typically `ResumeCanvasV3` — owns React state and forwards
// `DragController.onDropIndicator` callbacks into setState).
//
// Visuals (ported from v2/interaction/DropIndicator + v2/layers/InteractionLayer)
//   - Drop indicator = thin terracotta accent line (2px) spanning the canvas,
//     fixed to viewport at the cursor's emitted Y. v2 used #3b82f6 (blue);
//     per § 0.5 we preserve the v2 polish but the design system has moved to a
//     terracotta accent for "operation focus" — see v2/layers/SectionHighlightLayer
//     for the same color story. Falls back to a CSS color var if available.
//   - Drag ghost = floating wrapper that uses Framer Motion's `layout` to get
//     the spring-revert / drop-settle animation v2 had. We render an empty
//     placeholder (the real ghost contents are owned by the actual rows
//     getting `.row-dragging` via DragController); this layer just provides
//     the animated container so the drop position eases in smoothly.
//
// Auto-scroll
// -----------
// Per § 5.4: when cursor is within `EDGE_THRESHOLD_PX` of the canvas
// container's top/bottom edge, schedule `scrollBy` via rAF. C7 compliance:
// the listener is on the canvas container element passed via `canvasRef`,
// NOT on `window` with capture. It only fires while a drag is active
// (gated by `draggedRowIds.length > 0`).

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import type { DropIndicator } from '../interaction/DragController';
import type { RowId } from '../schema/types';

const EDGE_THRESHOLD_PX = 50;
const SCROLL_SPEED_PX = 12;

export interface InteractionLayerProps {
  /** Drop indicator state forwarded from DragController.onDropIndicator. */
  dropIndicator: DropIndicator | null;
  /** Row ids currently being dragged. Empty array = no active drag. */
  draggedRowIds: RowId[];
  /** Ref to the scrolling canvas container. Used for auto-scroll near edges. */
  canvasRef: React.RefObject<HTMLElement | null>;
}

export function InteractionLayer({
  dropIndicator,
  draggedRowIds,
  canvasRef,
}: InteractionLayerProps) {
  const isDragging = draggedRowIds.length > 0;

  // Auto-scroll: pointermove on the canvas container; rAF schedules scrollBy.
  React.useEffect(() => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId: number | null = null;
    let pendingDelta = 0;

    const flush = () => {
      rafId = null;
      if (pendingDelta === 0) return;
      // canvas.scrollBy may be missing in some test envs — fallback to scrollTop.
      if (typeof canvas.scrollBy === 'function') {
        canvas.scrollBy({ top: pendingDelta, behavior: 'auto' });
      } else {
        canvas.scrollTop += pendingDelta;
      }
      pendingDelta = 0;
    };

    const onMove = (e: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY;
      const distFromTop = y - rect.top;
      const distFromBottom = rect.bottom - y;
      let delta = 0;
      if (distFromTop >= 0 && distFromTop < EDGE_THRESHOLD_PX) {
        // Closer to edge → larger negative scroll. Scale linearly.
        const ratio = 1 - distFromTop / EDGE_THRESHOLD_PX;
        delta = -SCROLL_SPEED_PX * ratio;
      } else if (distFromBottom >= 0 && distFromBottom < EDGE_THRESHOLD_PX) {
        const ratio = 1 - distFromBottom / EDGE_THRESHOLD_PX;
        delta = SCROLL_SPEED_PX * ratio;
      } else {
        return;
      }
      pendingDelta = delta;
      if (rafId === null) {
        rafId = window.requestAnimationFrame(flush);
      }
    };

    canvas.addEventListener('pointermove', onMove as EventListener);
    return () => {
      canvas.removeEventListener('pointermove', onMove as EventListener);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [isDragging, canvasRef]);

  return (
    <div
      className="v3-interaction-layer"
      data-edit-only
      style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
    >
      {/* Drop-position red line removed. Visual feedback for drop target
          is now driven entirely by the row-translation animation in
          ResumeCanvasV3 — siblings shift to make room and the dragged row
          fades out at its source slot. */}

      <AnimatePresence>
        {isDragging && (
          <motion.div
            key="drag-ghost"
            data-v3-drag-ghost
            data-row-ids={draggedRowIds.join(',')}
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 0.85, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{
              position: 'fixed',
              top: dropIndicator?.cursorY ?? 0,
              left: 0,
              right: 0,
              pointerEvents: 'none',
              zIndex: 9997,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
