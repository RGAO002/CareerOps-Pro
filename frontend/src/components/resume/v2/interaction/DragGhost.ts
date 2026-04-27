// frontend/src/components/resume/v2/interaction/DragGhost.ts
import type { BlockId } from '../types';

export function makeDragGhost(blockId: BlockId): HTMLElement | null {
  const source = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!source) return null;
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll('[contenteditable]').forEach((el) => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
  });
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  Object.assign(ghost.style, {
    position: 'fixed',
    pointerEvents: 'none',
    opacity: '0.7',
    zIndex: '9999',
    width: source.getBoundingClientRect().width + 'px',
  });
  return ghost;
}
