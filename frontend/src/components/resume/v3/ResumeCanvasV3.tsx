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
    const handleCleanups: Array<() => void> = [];
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

    const clearHandleBindings = () => {
      while (handleCleanups.length > 0) {
        handleCleanups.pop()?.();
      }
    };

    const bindRowHandles = () => {
      clearHandleBindings();
      const rows = Array.from(view.dom.querySelectorAll<HTMLElement>(':scope > div > .row'));
      for (const row of rows) {
        const handle = row.querySelector<HTMLElement>('.row-handle');
        const rowId = row.getAttribute('data-row-id') as RowId | null;
        if (!handle || !rowId) continue;
        const onPointerDown = (ev: PointerEvent) => ctl.onPointerDown(ev, rowId, handle);
        handle.addEventListener('pointerdown', onPointerDown);
        handleCleanups.push(() => handle.removeEventListener('pointerdown', onPointerDown));
      }
    };

    bindRowHandles();
    const observer = new MutationObserver(() => bindRowHandles());
    observer.observe(view.dom, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearHandleBindings();
      controllerRef.current = null;
      setDropIndicator(null);
      setDraggedRowIds([]);
    };
  }, [view]);

  React.useEffect(() => {
    if (!view) return;
    const rows = Array.from(view.dom.querySelectorAll<HTMLElement>(':scope > div > .row'));
    const reset = () => {
      for (const row of rows) {
        row.style.transform = '';
        row.style.transition = '';
        row.style.opacity = '';
      }
    };

    if (!dropIndicator || draggedRowIds.length === 0) {
      reset();
      return;
    }

    const dragged = new Set(draggedRowIds);
    const indices = draggedRowIds
      .map((id) => rows.findIndex((row) => row.getAttribute('data-row-id') === id))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    if (indices.length === 0) {
      reset();
      return;
    }

    const srcStart = indices[0];
    const srcEnd = indices[indices.length - 1] + 1;
    const targetIndex = dropIndicator.targetRowId
      ? rows.findIndex((row) => row.getAttribute('data-row-id') === dropIndicator.targetRowId)
      : rows.length;
    if (targetIndex < 0) {
      reset();
      return;
    }

    const firstRect = rows[srcStart].getBoundingClientRect();
    const lastRect = rows[srcEnd - 1].getBoundingClientRect();
    const draggedHeight = Math.max(0, lastRect.bottom - firstRect.top) + 12;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowId = row.getAttribute('data-row-id') as RowId | null;
      const isDragged = !!rowId && dragged.has(rowId);
      row.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1), opacity 120ms ease';

      if (isDragged) {
        row.style.transform = '';
        row.style.opacity = '0.42';
        continue;
      }

      let shift = 0;
      if (targetIndex > srcStart && i >= srcEnd && i < targetIndex) {
        shift = -draggedHeight;
      } else if (targetIndex < srcStart && i >= targetIndex && i < srcStart) {
        shift = draggedHeight;
      }
      row.style.transform = shift ? `translateY(${shift}px)` : '';
      row.style.opacity = '';
    }

    return reset;
  }, [view, dropIndicator, draggedRowIds]);

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
