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

import type { AtomId, BlockId } from '../types';

/**
 * Drag preview can describe either an atom-level drag (header / section /
 * entry — drives AtomContentLayer animation) or a bullet-level drag inside
 * an entry (drives EntryAtomRenderer's local bullet shift).
 */
export type DragPreview =
  | {
      kind: 'atom';
      // Set of atoms being dragged as a group. For an entry drag this is just
      // the one entry atom. For a section drag this is the section heading PLUS
      // all entry atoms that follow it (until the next section or end of doc).
      draggedAtomIds: AtomId[];
      // Sum of all dragged atoms' heights + inter-atom gaps. Used to compute
      // how much room to open at the drop target.
      draggedHeight: number;
      srcStartIdx: number;     // first index in atom list (inclusive)
      srcEndIdx: number;       // last index + 1 (exclusive)
      dstAtomIndex: number | null;
    }
  | {
      kind: 'bullet';
      draggedBulletId: BlockId;
      draggedHeight: number;
      srcEntryId: BlockId;
      dstEntryId: BlockId;
      dstBulletIndex: number;
    }
  | null;

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
