// frontend/src/stores/sectionHighlight.ts
//
// Hover preview store for the resume editor.
//
// Semantics: `hovered` represents "if the user clicks the 6-dot at the
// current mouse position, this block would be selected". It's a preview of
// what selection would do — the light bg in BlockHighlightLayer.
//
// Selection itself lives in `selectionManager` (interaction/SelectionManager.ts);
// this store is purely the preview cursor.
import { create } from 'zustand';
import type { BlockId } from '@/components/resume/v2/types';

export type HoverableBlockKind = 'section' | 'entry' | 'bullet';
export interface HoveredBlock {
  kind: HoverableBlockKind;
  id: BlockId;
}

interface BlockHoverState {
  hovered: HoveredBlock | null;
  setHovered: (h: HoveredBlock | null) => void;
  /** Clear only if the currently-hovered block matches the given id —
   *  prevents stale-leave events from clobbering a fresh enter. */
  clearIfMatches: (id: BlockId) => void;
}

export const useBlockHover = create<BlockHoverState>((set, get) => ({
  hovered: null,
  setHovered: (hovered) => set({ hovered }),
  clearIfMatches: (id) => {
    if (get().hovered?.id === id) set({ hovered: null });
  },
}));
