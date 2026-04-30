// frontend/src/components/resume/v2/interaction/DragGhost.ts
import type { BlockId } from '../types';

/**
 * Build a floating "ghost" element that follows the cursor during a drag.
 *
 * Two requirements that bit us:
 *   1. SECTION drag must include the section heading PLUS all its entries.
 *      For other drags (entry / bullet) only the single block is cloned.
 *   2. The ghost must be styled like the real resume content. Since our
 *      typography is scoped under `[data-canvas-root] .resume-*`, just
 *      `cloneNode` + `appendChild(body)` produces unstyled text. We wrap the
 *      clones in a fresh `<div data-canvas-root>` so the scoped rules apply.
 *
 * Pass `blockIds` as a list to clone multiple sources in order. The first
 * source's width is used for the wrapper width.
 */
export function makeDragGhost(blockIds: BlockId | BlockId[]): HTMLElement | null {
  const ids = Array.isArray(blockIds) ? blockIds : [blockIds];
  const sources = ids
    .map(id => document.querySelector(`[data-block-id="${id}"]`))
    .filter((el): el is Element => !!el);
  if (sources.length === 0) return null;

  const firstRect = (sources[0] as HTMLElement).getBoundingClientRect();

  // The wrapper carries `data-canvas-root` so all `[data-canvas-root] .resume-*`
  // rules in resume-styles.css apply to the cloned content.
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-canvas-root', '');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.setAttribute('inert', '');
  Object.assign(wrapper.style, {
    position: 'fixed',
    pointerEvents: 'none',
    opacity: '0.85',
    zIndex: '9999',
    width: `${firstRect.width}px`,
    background: 'white',
    boxShadow: '0 6px 20px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06)',
    borderRadius: '4px',
    padding: '8px 12px',
    boxSizing: 'border-box',
  });

  for (const src of sources) {
    const clone = src.cloneNode(true) as HTMLElement;
    // Strip live editor chrome from the clone — it should look like static
    // rendered text, not a contenteditable element.
    clone.querySelectorAll('[contenteditable]').forEach(el => {
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
    });
    // Hide any drag handles / hover affordances in the clone (data-edit-only
    // elements live inside the cloned subtree).
    clone.querySelectorAll('[data-edit-only]').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });
    // Reset positioning on the clone so it flows naturally inside the wrapper
    // (the original may have inline transform / position from drag-preview state).
    Object.assign((clone as HTMLElement).style, {
      position: 'static',
      transform: 'none',
      opacity: '1',
      visibility: 'visible',
      width: '100%',
      marginBottom: '0.4rem',
    });
    wrapper.appendChild(clone);
  }
  return wrapper;
}
