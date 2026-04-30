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
import type { RowId, GroupId } from './schema/types';
import { groupsPluginKey } from './plugins/GroupsPlugin';
import { useAssistantStore } from '@/stores/assistant';

// Resolve which rows should be highlighted when the user hovers `targetRow`.
// Hovering on a section heading lights up the whole section group; hovering
// on entry.title / entry.meta lights up the whole entry group; other rows
// light up just themselves. Mirrors v2's atom-aware hover scopes.
function resolveHoverGroup(view: EditorView, targetRow: HTMLElement): HTMLElement[] {
  const kind = targetRow.getAttribute('data-row-kind');
  const gid = targetRow.getAttribute('data-group-id') || null;
  const rows = Array.from(view.dom.querySelectorAll<HTMLElement>(':scope > div > .row'));

  if (kind === 'section.heading' && gid) {
    // Section: heading row + all entry rows whose parentSectionGroupId === gid.
    const groupsState = groupsPluginKey.getState(view.state);
    const memberEntryGids = new Set<string>();
    if (groupsState) {
      for (const [eid, g] of groupsState.byId.entries()) {
        if (g.kind === 'entry' && g.parentSectionGroupId === (gid as GroupId)) {
          memberEntryGids.add(eid as string);
        }
      }
    }
    return rows.filter((r) => {
      if (r === targetRow) return true;
      const rgid = r.getAttribute('data-group-id') || null;
      return rgid !== null && (rgid === gid || memberEntryGids.has(rgid));
    });
  }

  if ((kind === 'entry.title' || kind === 'entry.meta') && gid) {
    // Entry: all rows tagged with this entry's gid.
    return rows.filter((r) => r.getAttribute('data-group-id') === gid);
  }

  // Single-row hover for bullet / plain / header.* — just the hovered row.
  return [targetRow];
}

// Map a hovered row to a label for the AI sidebar scope pill.
function rowLabel(view: EditorView, row: HTMLElement): { blockId: string; label: string } | null {
  const kind = row.getAttribute('data-row-kind');
  const rowId = row.getAttribute('data-row-id') || '';
  const gid = row.getAttribute('data-group-id') || '';
  const text = row.querySelector('.row-content')?.textContent?.trim() ?? '';
  const truncated = text.length > 40 ? text.slice(0, 38) + '…' : text;

  if (kind === 'section.heading') {
    return { blockId: gid || rowId, label: truncated || 'Section' };
  }
  if (kind === 'entry.title' || kind === 'entry.meta') {
    // Use the entry group's title as the label if available.
    const groupsState = groupsPluginKey.getState(view.state);
    const sectionGid = groupsState?.byId.get(gid as GroupId);
    let sectionLabel = '';
    if (sectionGid && sectionGid.kind === 'entry' && sectionGid.parentSectionGroupId) {
      const parent = groupsState?.byId.get(sectionGid.parentSectionGroupId);
      if (parent && parent.kind === 'section') sectionLabel = parent.label ?? '';
    }
    const titleText = view.dom.querySelector(
      `:scope > div > .row[data-row-kind="entry.title"][data-group-id="${gid}"] .row-content`,
    )?.textContent?.trim() ?? truncated;
    const lab = sectionLabel ? `${sectionLabel} · ${titleText}` : titleText;
    return { blockId: gid || rowId, label: lab || 'Entry' };
  }
  if (kind === 'header.name' || kind === 'header.contact') {
    return { blockId: rowId, label: 'Header' };
  }
  return { blockId: rowId, label: truncated || 'Row' };
}

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
    const handleCleanups: Array<() => void> = [];   // per-row pointer/click handlers — torn down on rebind
    const sessionCleanups: Array<() => void> = [];  // canvas-wide listeners — survive rebind, torn down on unmount
    const ctl = new DragController({
      view,
      onDropIndicator: (payload) => {
        setDropIndicator(payload);
        if (payload === null) {
          setDraggedRowIds([]);
        } else {
          const range = ctl.getDraggedRange();
          if (range) setDraggedRowIds([...range.rowIds]);
        }
      },
    });
    controllerRef.current = ctl;

    const clearHandleBindings = () => {
      while (handleCleanups.length > 0) handleCleanups.pop()?.();
    };

    // Group-aware hover: when the pointer enters a row, scope-resolve to find
    // all rows that should highlight together (whole section / whole entry /
    // single row), and toggle .is-group-hovered on each. v2 parity.
    let lastHoveredScope: Set<HTMLElement> | null = null;
    const clearHoverScope = () => {
      if (!lastHoveredScope) return;
      for (const r of lastHoveredScope) r.classList.remove('is-group-hovered');
      lastHoveredScope = null;
    };
    const onPointerOver = (ev: PointerEvent) => {
      const target = (ev.target as HTMLElement | null)?.closest<HTMLElement>('.row');
      if (!target) { clearHoverScope(); return; }
      const scope = resolveHoverGroup(view, target);
      const next = new Set(scope);
      if (lastHoveredScope) {
        for (const r of lastHoveredScope) {
          if (!next.has(r)) r.classList.remove('is-group-hovered');
        }
      }
      for (const r of next) r.classList.add('is-group-hovered');
      lastHoveredScope = next;
    };
    const onPointerLeave = (ev: PointerEvent) => {
      const related = ev.relatedTarget as HTMLElement | null;
      if (related && view.dom.contains(related)) return;
      clearHoverScope();
    };
    view.dom.addEventListener('pointerover', onPointerOver);
    view.dom.addEventListener('pointerleave', onPointerLeave);
    sessionCleanups.push(() => {
      view.dom.removeEventListener('pointerover', onPointerOver);
      view.dom.removeEventListener('pointerleave', onPointerLeave);
      clearHoverScope();
    });

    // Block-selected state: 6-dot click commits a selection of section /
    // entry / row scope. CSS .is-block-selected paints the deeper warm bg
    // (oklch(.96 .03 45)) and the first row of the scope gets a terracotta
    // strip on its left edge.
    let lastSelectedScope: HTMLElement[] | null = null;
    const clearSelectedScope = () => {
      if (!lastSelectedScope) return;
      for (const r of lastSelectedScope) {
        r.classList.remove('is-block-selected');
        r.classList.remove('is-block-selected-first');
        r.classList.remove('is-block-selected-last');
      }
      lastSelectedScope = null;
    };
    const setSelectedScope = (scope: HTMLElement[]) => {
      clearSelectedScope();
      if (scope.length === 0) return;
      for (const r of scope) r.classList.add('is-block-selected');
      // Mark first + last in document order so the per-row terracotta strips
      // visually join into one continuous bar with 8px top + 8px bottom
      // insets, matching design_handoff_ai_sidebar's .r-section.active::after.
      const sorted = [...scope].sort((a, b) => {
        const pos = a.compareDocumentPosition(b);
        return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
      });
      sorted[0]?.classList.add('is-block-selected-first');
      sorted[sorted.length - 1]?.classList.add('is-block-selected-last');
      lastSelectedScope = scope;
    };
    // Click outside any row clears the selection.
    const onCanvasClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest('.row-handle')) return; // handled below
      if (target?.closest('.row.is-block-selected')) return; // clicking inside a selected row keeps selection
      clearSelectedScope();
    };
    view.dom.addEventListener('click', onCanvasClick);
    sessionCleanups.push(() => {
      view.dom.removeEventListener('click', onCanvasClick);
      clearSelectedScope();
    });

    const bindRowHandles = () => {
      clearHandleBindings();
      const rows = Array.from(view.dom.querySelectorAll<HTMLElement>(':scope > div > .row'));
      for (const row of rows) {
        const handle = row.querySelector<HTMLElement>('.row-handle');
        const rowId = row.getAttribute('data-row-id') as RowId | null;
        if (!handle || !rowId) continue;
        const onPointerDown = (ev: PointerEvent) => ctl.onPointerDown(ev, rowId, handle);
        // Click on .row-handle (without dragging) → block-select scope +
        // open AI sidebar.
        const onClick = (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
          const scope = resolveHoverGroup(view, row);
          setSelectedScope(scope);
          const labelInfo = rowLabel(view, row);
          if (labelInfo) useAssistantStore.getState().openSidebarWithScope(labelInfo);
        };
        handle.addEventListener('pointerdown', onPointerDown);
        handle.addEventListener('click', onClick);
        handleCleanups.push(() => handle.removeEventListener('pointerdown', onPointerDown));
        handleCleanups.push(() => handle.removeEventListener('click', onClick));
      }
    };

    bindRowHandles();
    const observer = new MutationObserver(() => bindRowHandles());
    observer.observe(view.dom, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearHandleBindings();
      while (sessionCleanups.length > 0) sessionCleanups.pop()?.();
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
