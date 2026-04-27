// frontend/src/components/resume/v2/interaction/hover-state.ts
//
// Module-level reactive store for "what block is the cursor over right now".
// InteractionLayer's mousemove listener publishes this; field overlays
// (atom-level + bullet-level) subscribe and decide whether to show their
// drag handle / + / × buttons.
//
// Y-coordinate based: we don't rely on event.target → closest('[data-block-id]')
// because the gutter where ⋮⋮ buttons live has pointerEvents:'none' until
// hovered, which would create a Catch-22 (need hover to enable, need hover to
// detect).

import type { AtomId, BlockId } from '../types';

export type HoverState = {
  atomId: AtomId | null;
  bulletId: BlockId | null;
};

let _state: HoverState = { atomId: null, bulletId: null };
const _listeners = new Set<(s: HoverState) => void>();

export function getHoverState(): HoverState {
  return _state;
}

export function setHoverState(next: HoverState): void {
  if (_state.atomId === next.atomId && _state.bulletId === next.bulletId) return;
  _state = next;
  for (const l of _listeners) l(_state);
}

export function subscribeHover(listener: (s: HoverState) => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}
