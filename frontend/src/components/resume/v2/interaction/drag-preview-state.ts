// frontend/src/components/resume/v2/interaction/drag-preview-state.ts
//
// Module-level reactive store for the drag preview ("make room") animation.
// While an atom is being dragged, AtomContentLayer subscribes to this state
// and translates atoms below the drop target downward by the dragged atom's
// height. The dragged atom itself fades to ~0.3 opacity (the floating ghost
// follows the cursor).
//
// Bullet drags do not produce an atom-level preview (insertAtAtomIndex stays
// null), so the canvas does not animate when reordering bullets within an
// entry — bullets aren't atoms.

import type { AtomId } from '../types';

export type DragPreview = {
  draggedAtomId: AtomId;             // which atom is being dragged
  draggedHeight: number;             // its height in px (measured at drag start)
  insertAtAtomIndex: number | null;  // atom index where it would land (or null)
} | null;

let _state: DragPreview = null;
const _listeners = new Set<(s: DragPreview) => void>();

export function getDragPreview(): DragPreview {
  return _state;
}

export function setDragPreview(s: DragPreview): void {
  _state = s;
  for (const l of _listeners) l(s);
}

export function subscribeDragPreview(l: (s: DragPreview) => void): () => void {
  _listeners.add(l);
  return () => {
    _listeners.delete(l);
  };
}
