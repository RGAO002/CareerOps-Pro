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
import { effectiveGidsFromState } from './schema/effectiveGid';
import { useAssistantStore } from '@/stores/assistant';

// Resolve which rows should be highlighted when the user hovers `targetRow`.
// Hovering on a section heading lights up the whole section group; hovering
// on entry.title / entry.meta lights up the whole entry group; other rows
// light up just themselves. Mirrors v2's atom-aware hover scopes.
function resolveHoverGroup(view: EditorView, targetRow: HTMLElement): HTMLElement[] {
  const kind = targetRow.getAttribute('data-row-kind');
  const rows = Array.from(view.dom.querySelectorAll<HTMLElement>(':scope > div > .row'));
  // Compute the effective gid per row from PM state (NOT from data-group-id
  // DOM attr). Plain rows store null in their schema attribute; their
  // effective gid is computed lazily via the inheritance rule in
  // schema/effectiveGid.ts. Reading data-group-id directly causes typed plain
  // rows that should belong to an entry/section to drop out of the highlight
  // scope. Spec § 2.2.
  const effGids = effectiveGidsFromState(view.state);
  const targetIdx = rows.indexOf(targetRow);
  const gid = (targetIdx >= 0 ? effGids[targetIdx] : null) || null;

  if (kind === 'section.heading' && gid) {
    // Section: heading row + all entry rows whose parentSectionGroupId === gid,
    // plus any plain rows whose effective gid resolves into the section
    // (via empty-plain → null cascade rule, typed plains under section heading).
    const groupsState = groupsPluginKey.getState(view.state);
    const memberEntryGids = new Set<string>();
    if (groupsState) {
      for (const [eid, g] of groupsState.byId.entries()) {
        if (g.kind === 'entry' && g.parentSectionGroupId === (gid as GroupId)) {
          memberEntryGids.add(eid as string);
        }
      }
    }
    return rows.filter((r, i) => {
      if (r === targetRow) return true;
      const rgid = effGids[i];
      return rgid !== null && (rgid === gid || memberEntryGids.has(rgid));
    });
  }

  if ((kind === 'entry.title' || kind === 'entry.meta') && gid) {
    // Entry: all rows whose effective gid === this entry's gid (includes
    // typed plain rows that lazily inherit from the previous row).
    return rows.filter((_r, i) => effGids[i] === gid);
  }

  // bullet / plain / header.* — single-row hover. Plain rows that effectively
  // belong to a section/entry STILL only highlight themselves on hover; the
  // wider section/entry scope is reserved for the heading/title/meta.
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
    // (oklch(.96 .03 45)) and the topmost / bottommost rows of each
    // contiguous run carry a terracotta strip on their left edge.
    //
    // Multi-select via Cmd/Ctrl+click toggles a scope into / out of the
    // selection union; first/last classes recompute per disjoint run so
    // each contiguous block gets its own bar.
    let selectedScopes: HTMLElement[][] = [];
    const allSelectedRows = (): Set<HTMLElement> => {
      const s = new Set<HTMLElement>();
      for (const scope of selectedScopes) for (const r of scope) s.add(r);
      return s;
    };
    // Build an AssistantScope from the current `selectedScopes`.
    //   1 scope:  re-use rowLabel on the first (doc-order) row of that scope.
    //   N scopes: anchor on the FIRST scope (in click-order), append "+N more"
    //             so the user sees both what's primary and how many extras.
    const buildScopeFromSelection = (): { blockId: string; label: string } | null => {
      if (selectedScopes.length === 0 || selectedScopes[0].length === 0) return null;
      const primary = rowLabel(view, selectedScopes[0][0]);
      if (!primary) return null;
      if (selectedScopes.length === 1) return primary;
      const extra = selectedScopes.length - 1;
      return { blockId: primary.blockId, label: `${primary.label} +${extra} more` };
    };
    // If the AI sidebar is already open, mirror the current selection into
    // its scope. Sidebar closed → no auto-open (single-clicking handles
    // shouldn't summon the sidebar; double-click is the explicit summon).
    const syncAssistantScope = () => {
      if (useAssistantStore.getState().pose !== 'sidebar') return;
      const next = buildScopeFromSelection();
      if (next) {
        useAssistantStore.getState().openSidebarWithScope(next);
      } else {
        useAssistantStore.getState().clearScope();
      }
    };
    const clearSelectedScope = () => {
      const all = allSelectedRows();
      for (const r of all) {
        r.classList.remove('is-block-selected');
        r.classList.remove('is-block-selected-first');
        r.classList.remove('is-block-selected-last');
      }
      selectedScopes = [];
      syncAssistantScope();
    };
    // Re-paint every selected row's classes based on current selectedScopes.
    // The .is-block-selected-first / -last classes mark each contiguous run's
    // boundaries; runs are computed from the union of all selected rows in
    // document order.
    const repaintSelectedClasses = () => {
      const allRows = Array.from(view.dom.querySelectorAll<HTMLElement>(':scope > div > .row'));
      const selected = allSelectedRows();
      // Clear all marks first.
      for (const r of allRows) {
        r.classList.remove('is-block-selected');
        r.classList.remove('is-block-selected-first');
        r.classList.remove('is-block-selected-last');
      }
      // Paint .is-block-selected on every selected row, plus first/last on
      // each contiguous run boundary.
      let runStart: HTMLElement | null = null;
      let prev: HTMLElement | null = null;
      const closeRun = () => {
        if (runStart && prev) {
          runStart.classList.add('is-block-selected-first');
          prev.classList.add('is-block-selected-last');
        }
        runStart = null;
      };
      for (const r of allRows) {
        if (selected.has(r)) {
          r.classList.add('is-block-selected');
          if (!runStart) runStart = r;
          prev = r;
        } else {
          closeRun();
          prev = null;
        }
      }
      closeRun();
    };
    const setSelectedScope = (scope: HTMLElement[], extend: boolean) => {
      if (!extend) {
        selectedScopes = scope.length > 0 ? [scope] : [];
      } else {
        // Toggle: if every row in `scope` is already selected, remove that
        // scope (deselect). Otherwise add it (union).
        const selected = allSelectedRows();
        const allInScopeSelected = scope.every((r) => selected.has(r));
        if (allInScopeSelected) {
          // Remove rows that belong to the scope being toggled.
          selectedScopes = selectedScopes
            .map((s) => s.filter((r) => !scope.includes(r)))
            .filter((s) => s.length > 0);
        } else {
          selectedScopes.push(scope);
        }
      }
      repaintSelectedClasses();
      syncAssistantScope();
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
        // Single-click on .row-handle → block-select scope ONLY (no
        // sidebar). Cmd/Ctrl+click toggles into multi-selection.
        const onClick = (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
          const scope = resolveHoverGroup(view, row);
          const extend = ev.metaKey || ev.ctrlKey;
          setSelectedScope(scope, extend);
        };
        // Double-click on .row-handle → open AI sidebar focused on this
        // scope. Decoupled from single-click so casual handle-clicks
        // (just for block-select) don't constantly summon the sidebar.
        const onDblClick = (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
          const labelInfo = rowLabel(view, row);
          if (labelInfo) useAssistantStore.getState().openSidebarWithScope(labelInfo);
        };
        handle.addEventListener('pointerdown', onPointerDown);
        handle.addEventListener('click', onClick);
        handle.addEventListener('dblclick', onDblClick);
        handleCleanups.push(() => handle.removeEventListener('pointerdown', onPointerDown));
        handleCleanups.push(() => handle.removeEventListener('click', onClick));
        handleCleanups.push(() => handle.removeEventListener('dblclick', onDblClick));
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

  // Drag-time state extracted from the dropIndicator object so each effect
  // can depend on only the bits it actually cares about.
  const dropTargetRowId = dropIndicator?.targetRowId ?? null;
  const dropActive = dropIndicator !== null;
  // Captured at drag start so the dragged ghost's translateY = (current Y −
  // initial Y), letting it visually follow the cursor without jumping.
  const initialCursorYRef = React.useRef<number | null>(null);

  // Effect A — neighbor shifts. NO cleanup return: the previous version's
  // cleanup ran on every dep change and reset transitions, causing rows to
  // visually snap back to origin between target switches → up/down jitter.
  // Reset is only needed when the drag ENDS — handled by the inactive
  // branch below, which fires once when dropActive flips to false.
  React.useEffect(() => {
    if (!view) return;
    const rows = Array.from(view.dom.querySelectorAll<HTMLElement>(':scope > div > .row'));

    if (!dropActive || draggedRowIds.length === 0) {
      // Drag ended (or never started) — clear all transforms.
      for (const row of rows) {
        row.style.transform = '';
        row.style.transition = '';
        row.style.opacity = '';
      }
      initialCursorYRef.current = null;
      return;
    }

    const dragged = new Set(draggedRowIds);
    const indices = draggedRowIds
      .map((id) => rows.findIndex((row) => row.getAttribute('data-row-id') === id))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    if (indices.length === 0) return;

    const srcStart = indices[0];
    const srcEnd = indices[indices.length - 1] + 1;
    const targetIndex = dropTargetRowId
      ? rows.findIndex((row) => row.getAttribute('data-row-id') === dropTargetRowId)
      : rows.length;
    if (targetIndex < 0) return;

    const firstRect = rows[srcStart].getBoundingClientRect();
    const lastRect = rows[srcEnd - 1].getBoundingClientRect();
    const draggedHeight = Math.max(0, lastRect.bottom - firstRect.top) + 12;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowId = row.getAttribute('data-row-id') as RowId | null;
      const isDragged = !!rowId && dragged.has(rowId);
      // Only set transition once if not already set — avoids any potential
      // re-trigger when the same value is re-assigned.
      const wantTrans = 'transform 180ms cubic-bezier(0.2, 0, 0, 1), opacity 120ms ease';
      if (isDragged) {
        // Effect B owns the dragged transform (cursor-follow). Here we
        // only set opacity so the ghost reads as a faint backdrop.
        if (row.style.opacity !== '0.35') row.style.opacity = '0.35';
        continue;
      }
      if (row.style.transition !== wantTrans) row.style.transition = wantTrans;

      let shift = 0;
      if (targetIndex > srcStart && i >= srcEnd && i < targetIndex) {
        shift = -draggedHeight;
      } else if (targetIndex < srcStart && i >= targetIndex && i < srcStart) {
        shift = draggedHeight;
      }
      const next = shift ? `translateY(${shift}px)` : '';
      if (row.style.transform !== next) row.style.transform = next;
      if (row.style.opacity !== '') row.style.opacity = '';
    }
  }, [view, dropTargetRowId, dropActive, draggedRowIds]);

  // Effect B — cursor-follow for the DRAGGED row(s). Re-runs on every
  // cursor tick (dropIndicator dep) but only writes transform on the 1-3
  // dragged rows, so it's cheap and never touches neighbour rows that
  // could jitter.
  React.useEffect(() => {
    if (!view || !dropIndicator || draggedRowIds.length === 0) return;
    if (initialCursorYRef.current === null) {
      initialCursorYRef.current = dropIndicator.cursorY;
    }
    const delta = dropIndicator.cursorY - initialCursorYRef.current;
    const rows = view.dom.querySelectorAll<HTMLElement>(':scope > div > .row');
    const draggedSet = new Set(draggedRowIds);
    rows.forEach((row) => {
      const rowId = row.getAttribute('data-row-id') as RowId | null;
      if (rowId && draggedSet.has(rowId)) {
        // No transition on the dragged row's transform — it should track
        // the cursor 1:1 with no easing lag. Other rows still get the
        // 180ms transition from Effect A.
        row.style.transition = 'opacity 120ms ease';
        row.style.transform = `translateY(${delta}px)`;
      }
    });
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
