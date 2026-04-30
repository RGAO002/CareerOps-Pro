// frontend/src/components/resume/v3/interaction/DragController.ts
//
// T28 — DragController for v3 resume editor (M4).
//
// Responsibility
// --------------
// Owns row-level drag-and-drop on the v3 ProseMirror document. Adapted from
// v2/interaction/DragController.ts but rewritten to v3 contracts:
//
//   * The dragged unit is a *row range* (RowId[]) resolved by the T25
//     rangeResolver — not a v2 SelectableBlock. A drag of `entry.title`
//     drags its whole entry; a drag on `section.heading` drags the section.
//
//   * Drop is a SINGLE atomic transaction built by `dispatchWithGroups`
//     (T18). Doc step + groupOps are committed together — never separate
//     dispatches. (C8 / F5)
//
//   * Pointer Events only — no mouse/touch fallback. The pre-drag listener
//     lives on the row-handle element itself; we capture the pointer on
//     pointerdown so subsequent moves come to the handle naturally. We
//     also register `pointermove` / `pointerup` / `pointercancel` /
//     `keydown` on `window` so the drag survives the cursor leaving the
//     handle's bounding box. Per § 5.3 these window listeners are allowed
//     because a drag has *started* — the C7 prohibition is on
//     pre-drag global capture, which we never do.
//
//   * Orphan-tolerant (F4): drop tolerates a dragged row whose
//     `parentSectionGroupId` references a missing group — rangeResolver
//     handles range collection; the move itself doesn't care if the entry
//     group exists in plugin state, it just emits an `updateParent` op.
//
// Drop indicator + auto-scroll + visual ghost
// -------------------------------------------
// The controller exposes an `onDropIndicator` callback so the drop indicator
// renderer (T29) can subscribe. Auto-scroll near canvas edges is intentionally
// out of scope here (T29). The dragged rows are flagged with a `row-dragging`
// CSS class so styling can dim/lift them; T29 handles ghost rendering.
//
// Drop position math
// ------------------
// We compute the target row by walking the doc's row positions and finding
// the first row whose `top` is greater than the cursor's clientY. Drop
// inserts the dragged range *before* that target row (or at end of doc if
// none found). The doc step is a single `replaceWith` that:
//   1. removes the source range
//   2. inserts the same nodes at the (post-removal-adjusted) target index
// Because we issue both replace+insert as one PM step pair on a single
// transaction, history captures one undo entry.
//
// Group bookkeeping on cross-section drop
// ---------------------------------------
// When the move crosses a section boundary, dragged rows that belong to an
// `entry` group must have that group's `parentSectionGroupId` updated to
// the destination section's id. We compute the destination section by
// scanning forward (and back) from the drop index for the nearest
// `section_heading` row's `semanticGroupId`. F4 fallback: if no section
// heading exists in the destination region we omit the updateParent op
// rather than emit an op pointing at a missing parent.

import type { EditorView } from '@tiptap/pm/view';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import type { RowId, GroupId, GroupOp } from '../schema/types';
import { resolveBlockRange, type BlockRange } from './rangeResolver';
import { dispatchWithGroups } from './dispatchWithGroups';
import { groupsPluginKey } from '../plugins/GroupsPlugin';

export const DRAG_THRESHOLD_PX = 4;

export interface DropIndicator {
  /** RowId of the row the drop will insert *before*, or null = end of doc. */
  targetRowId: RowId | null;
  /** Cursor Y at the time the indicator was emitted (px from viewport top). */
  cursorY: number;
}

export type DropIndicatorListener = (payload: DropIndicator | null) => void;

interface ActiveDrag {
  startRowId: RowId;
  startX: number;
  startY: number;
  pointerId: number;
  handle: HTMLElement;
  /** True once the threshold has been crossed — controller goes from
   *  "armed" to "active". Window listeners installed on pointerdown are
   *  always present; the threshold gates *visible drag* state and the
   *  drop transaction. */
  active: boolean;
  /** Cached row range (resolved on first move past threshold). */
  range: BlockRange | null;
}

export interface DragControllerOptions {
  view: EditorView;
  onDropIndicator?: DropIndicatorListener;
}

export class DragController {
  private view: EditorView;
  private onDropIndicator: DropIndicatorListener;
  private drag: ActiveDrag | null = null;
  private windowListeners: { type: string; fn: EventListener }[] = [];

  constructor(opts: DragControllerOptions) {
    this.view = opts.view;
    this.onDropIndicator = opts.onDropIndicator ?? (() => {});
  }

  // ---- public surface ----

  isDragging(): boolean {
    return this.drag?.active === true;
  }

  hasWindowListeners(): boolean {
    return this.windowListeners.length > 0;
  }

  getDraggedRange(): BlockRange | null {
    return this.drag?.range ?? null;
  }

  /**
   * Wire this on a `.row-handle` element's `pointerdown`. Caller is
   * responsible for resolving the rowId from the handle's data attribute.
   *
   * Per § 5.3 the listener installation pattern is:
   *   handleEl.addEventListener('pointerdown', e => ctl.onPointerDown(e, rowId, handleEl));
   * NOT a global capture-phase listener.
   */
  onPointerDown(e: PointerEvent, rowId: RowId, handle: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    try { handle.setPointerCapture(e.pointerId); } catch { /* jsdom may throw — non-fatal */ }
    this.drag = {
      startRowId: rowId,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      handle,
      active: false,
      range: null,
    };
    // Window listeners — allowed by C7 because a drag has been initiated by
    // an explicit user gesture on the handle itself.
    this.installWindowListeners();
  }

  onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;
    if (!d.active) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      // Activate.
      d.active = true;
      d.range = resolveBlockRange(this.view.state, d.startRowId);
      this.applyDraggingClass(d.range);
    }
    // Emit drop indicator for renderer (T29).
    const targetRowId = this.findDropTargetRowId(e.clientY);
    this.onDropIndicator({ targetRowId, cursorY: e.clientY });
  }

  onPointerUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (e.pointerId !== d.pointerId) {
      // Ignore stray pointers; do not cancel the active drag.
      return;
    }
    if (!d.active || !d.range) {
      this.cleanup();
      return;
    }
    const targetRowId = this.findDropTargetRowId(e.clientY);
    this.commitDrop(d.range, targetRowId);
    this.cleanup();
  }

  onPointerCancel(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;
    this.cleanup();
  }

  onKeyDown(e: KeyboardEvent): void {
    if (!this.drag) return;
    if (e.key === 'Escape') this.cleanup();
  }

  // ---- internals ----

  private installWindowListeners(): void {
    if (this.windowListeners.length > 0) return;
    if (typeof window === 'undefined') return;
    const move = (ev: Event) => this.onPointerMove(ev as PointerEvent);
    const up = (ev: Event) => this.onPointerUp(ev as PointerEvent);
    const cancel = (ev: Event) => this.onPointerCancel(ev as PointerEvent);
    const key = (ev: Event) => this.onKeyDown(ev as KeyboardEvent);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    this.windowListeners.push(
      { type: 'pointermove', fn: move },
      { type: 'pointerup', fn: up },
      { type: 'pointercancel', fn: cancel },
      { type: 'keydown', fn: key },
    );
  }

  private removeWindowListeners(): void {
    if (typeof window === 'undefined') {
      this.windowListeners = [];
      return;
    }
    for (const l of this.windowListeners) {
      window.removeEventListener(l.type, l.fn);
    }
    this.windowListeners = [];
  }

  private applyDraggingClass(range: BlockRange | null): void {
    if (!range) return;
    for (const id of range.rowIds) {
      const el = document.querySelector(`[data-row-id="${id}"]`);
      if (el) el.classList.add('row-dragging');
    }
  }

  private clearDraggingClass(): void {
    document.querySelectorAll('.row-dragging').forEach(el => el.classList.remove('row-dragging'));
  }

  /** Walk the doc's row positions and return the id of the first row whose
   *  rendered top is greater-than-or-equal-to the cursor Y. null = end of doc. */
  private findDropTargetRowId(cursorY: number): RowId | null {
    const state = this.view.state;
    const ids: RowId[] = [];
    state.doc.forEach((c) => { ids.push(c.attrs.id as RowId); });
    for (const id of ids) {
      const el = document.querySelector(`[data-row-id="${id}"]`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (cursorY < mid) return id;
    }
    return null;
  }

  private commitDrop(range: BlockRange, targetRowId: RowId | null): void {
    const state = this.view.state;
    const doc = state.doc;
    // Source row indices in doc order.
    const srcIdxSet = new Set<number>();
    const draggedRowIds = new Set(range.rowIds);
    const allChildren: { node: PMNode; idx: number; pos: number }[] = [];
    doc.forEach((c, off, idx) => {
      allChildren.push({ node: c, idx, pos: off });
      if (draggedRowIds.has(c.attrs.id as RowId)) srcIdxSet.add(idx);
    });
    if (srcIdxSet.size === 0) return; // no-op

    // Target child index (0..childCount). null = end.
    let targetIdx = doc.childCount;
    if (targetRowId) {
      const found = allChildren.find(c => c.node.attrs.id === targetRowId);
      if (found) targetIdx = found.idx;
    }
    // No-op: dropping into the same contiguous source range.
    if (srcIdxSet.has(targetIdx) || srcIdxSet.has(targetIdx - 1)) {
      // Drop adjacent to self → nothing to do.
      const sortedSrc = [...srcIdxSet].sort((a, b) => a - b);
      const first = sortedSrc[0];
      const last = sortedSrc[sortedSrc.length - 1];
      if (targetIdx >= first && targetIdx <= last + 1) return;
    }

    // Build the new doc child list.
    const draggedNodes = allChildren.filter(c => srcIdxSet.has(c.idx)).map(c => c.node);
    const remaining = allChildren.filter(c => !srcIdxSet.has(c.idx));
    // Translate targetIdx (in original space) to insertion index in `remaining`.
    let insertAt = remaining.findIndex(c => c.idx === targetIdx);
    if (insertAt < 0) insertAt = remaining.length; // end of doc
    const newChildren = [
      ...remaining.slice(0, insertAt).map(c => c.node),
      ...draggedNodes,
      ...remaining.slice(insertAt).map(c => c.node),
    ];

    // Compute destination section group id. We look at the row that will
    // immediately precede the dragged block in the new layout (the one at
    // newChildren[insertAt - 1]) and walk back to the nearest section_heading.
    const dstSectionGid = findEnclosingSectionGid(newChildren, insertAt);

    // Build groupOps: any *entry* group whose rows are in the dragged range
    // and whose current parentSectionGroupId differs from dstSectionGid gets
    // an updateParent op. F4: tolerate orphan groups (the op is still safe;
    // GroupOps.applyGroupOps no-ops updateParent for absent groups).
    const groupOps: GroupOp[] = [];
    if (dstSectionGid) {
      const groupsState = groupsPluginKey.getState(state);
      const draggedEntryGids = new Set<GroupId>();
      for (const n of draggedNodes) {
        const k = n.type.name;
        if (k === 'entry_title' || k === 'entry_meta' || k === 'bullet' || k === 'plain') {
          const gid = (n.attrs.semanticGroupId as string | null) ?? null;
          if (gid) draggedEntryGids.add(gid as GroupId);
        }
      }
      for (const gid of draggedEntryGids) {
        const g = groupsState?.byId.get(gid);
        // Only emit op for entry groups; skip if it's a section group or
        // points already at the destination.
        if (g && g.kind === 'entry') {
          if (g.parentSectionGroupId !== dstSectionGid) {
            groupOps.push({ type: 'updateParent', groupId: gid, parentSectionGroupId: dstSectionGid });
          }
        } else if (!g) {
          // F4 orphan: emit anyway — applyGroupOps will safely no-op an
          // updateParent against a missing group, but we keep the intent
          // recorded for future rehydration.
          groupOps.push({ type: 'updateParent', groupId: gid, parentSectionGroupId: dstSectionGid });
        }
      }
    }

    // Single PM step: replace the entire doc content with newChildren.
    // We use a `replaceWith` over the full doc range — atomic, one transaction.
    const docOp = (tr: Transaction): Transaction => {
      const fragment = Fragment.fromArray(newChildren);
      return tr.replaceWith(0, tr.doc.content.size, fragment);
    };

    dispatchWithGroups(this.view, { docOp, groupOps });
  }

  private cleanup(): void {
    const d = this.drag;
    if (d) {
      try { d.handle.releasePointerCapture(d.pointerId); } catch { /* ignore */ }
    }
    this.clearDraggingClass();
    this.removeWindowListeners();
    this.drag = null;
    this.onDropIndicator(null);
  }
}

// ---- helpers ----

/** Walk back from `insertAt - 1` to find the nearest `section_heading`'s
 *  semanticGroupId. Returns null if no preceding section heading exists. */
function findEnclosingSectionGid(children: PMNode[], insertAt: number): GroupId | null {
  for (let i = insertAt - 1; i >= 0; i--) {
    const n = children[i];
    if (n.type.name === 'section_heading') {
      const gid = (n.attrs.semanticGroupId as string | null) ?? null;
      return gid as GroupId | null;
    }
  }
  return null;
}

