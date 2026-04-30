// frontend/src/components/resume/v3/ResumeCanvasV3.tsx
//
// T29 — Minimal scaffold for the v3 resume canvas.
//
// Wires together:
//   - A TipTap-style EditorContent (passed in via children/editor prop)
//   - DragController (T28) — owns row drag state
//   - InteractionLayer (T29) — renders drop indicator + drag ghost + auto-scroll
//
// This is intentionally minimal. Production wiring (page background, atom
// content layer, section highlight, etc.) lands in M5/M7. The purpose of
// this scaffold is to give T29 (and future M4/M5 tasks) a single mounting
// point that stitches the drag controller's state into the React tree.

'use client';

import * as React from 'react';
import type { EditorView } from '@tiptap/pm/view';

import { DragController } from './interaction/DragController';
import type { DropIndicator } from './interaction/DragController';
import { InteractionLayer } from './layers/InteractionLayer';
import type { RowId } from './schema/types';

export interface ResumeCanvasV3Props {
  /** The PM EditorView for the v3 doc. Drag controller installs around it. */
  view: EditorView | null;
  /** Editor mount target (passed in from the parent that owns useEditor / boot). */
  children?: React.ReactNode;
}

/**
 * Minimal v3 canvas: editor content + drag interaction overlays.
 *
 * The DragController is constructed once `view` becomes available and
 * forwards drop-indicator state into React via setState so InteractionLayer
 * can render the indicator + ghost + auto-scroll near edges.
 */
export function ResumeCanvasV3({ view, children }: ResumeCanvasV3Props) {
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const [dropIndicator, setDropIndicator] = React.useState<DropIndicator | null>(null);
  const [draggedRowIds, setDraggedRowIds] = React.useState<RowId[]>([]);
  const controllerRef = React.useRef<DragController | null>(null);

  React.useEffect(() => {
    if (!view) return;
    const ctl = new DragController({
      view,
      onDropIndicator: (payload) => {
        setDropIndicator(payload);
        if (payload === null) {
          // Drag ended (cleanup or never started).
          setDraggedRowIds([]);
        } else {
          // Update dragged row ids from the controller's resolved range.
          const range = ctl.getDraggedRange();
          if (range) setDraggedRowIds([...range.rowIds]);
        }
      },
    });
    controllerRef.current = ctl;
    return () => {
      controllerRef.current = null;
      setDropIndicator(null);
      setDraggedRowIds([]);
    };
  }, [view]);

  return (
    <div
      ref={canvasRef}
      data-canvas-root
      data-canvas-version="v3"
      style={{ position: 'relative', overflow: 'auto' }}
    >
      {children}
      <InteractionLayer
        dropIndicator={dropIndicator}
        draggedRowIds={draggedRowIds}
        canvasRef={canvasRef}
      />
    </div>
  );
}
