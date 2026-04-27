// frontend/src/components/resume/v2/interaction/DragController.ts
import type { BlockId, LayoutAtom, SelectableBlock, UpdateOrigin } from '../types';
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin } from '../store/source-of-truth';
import { moveSection } from '../store/actions/moveSection';
import { moveEntry } from '../store/actions/moveEntry';
import { moveBullet } from '../store/actions/moveBullet';
import { projectAtoms } from '../layout/atoms-projection';
import { selectionManager } from './SelectionManager';
import { setDragPreview } from './drag-preview-state';
import { makeDragGhost } from './DragGhost';

/** Document-order block id list (sections, entries, bullets) — used as the
 *  range for shift-click selection extension. */
function allBlockIdsInDocOrder(): BlockId[] {
  const r = useResumeStore.getState().resume;
  if (!r) return [];
  const ids: BlockId[] = [];
  for (const s of r.sections) {
    ids.push(s.id);
    for (const e of s.entries) {
      ids.push(e.id);
      for (const b of e.bullets) ids.push(b.id);
    }
  }
  return ids;
}

export type DropTarget =
  | { kind: 'section-slot'; insertBeforeSectionId: BlockId | null }
  | { kind: 'entry-slot'; sectionId: BlockId; insertAtIndex: number }
  | { kind: 'bullet-slot'; entryId: BlockId; insertAtIndex: number };

const DRAG_THRESHOLD = 5;
const SCROLL_EDGE_PX = 30;

export function getDropTargetsFor(block: SelectableBlock): DropTarget[] {
  const r = useResumeStore.getState().resume;
  if (!r) return [];
  if (block.kind === 'section') {
    const targets: DropTarget[] = r.sections.map(s => ({ kind: 'section-slot', insertBeforeSectionId: s.id }));
    targets.push({ kind: 'section-slot', insertBeforeSectionId: null });
    return targets;
  }
  if (block.kind === 'entry') {
    const targets: DropTarget[] = [];
    for (const s of r.sections) {
      for (let i = 0; i <= s.entries.length; i++) {
        targets.push({ kind: 'entry-slot', sectionId: s.id, insertAtIndex: i });
      }
    }
    return targets;
  }
  // bullet
  const targets: DropTarget[] = [];
  for (const s of r.sections) {
    for (const e of s.entries) {
      for (let i = 0; i <= e.bullets.length; i++) {
        targets.push({ kind: 'bullet-slot', entryId: e.id, insertAtIndex: i });
      }
    }
  }
  return targets;
}

export function commitDrop(block: SelectableBlock, target: DropTarget, origin: UpdateOrigin): void {
  if (target.kind === 'section-slot' && block.kind === 'section') {
    moveSection(block.id, target.insertBeforeSectionId, origin);
  } else if (target.kind === 'entry-slot' && block.kind === 'entry') {
    moveEntry(block.id, target.sectionId, target.insertAtIndex, origin);
  } else if (target.kind === 'bullet-slot' && block.kind === 'bullet') {
    moveBullet(block.id, target.entryId, target.insertAtIndex, origin);
  }
  // Scroll the moved block into view after the layout engine reflows.
  // Two rAFs: one for React commit, one for layout engine repaginate.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-block-id="${block.id}"]`);
      if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
}

function getDropTargetY(target: DropTarget): number | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  if (target.kind === 'section-slot') {
    if (target.insertBeforeSectionId) {
      const el = document.querySelector(`[data-block-id="${target.insertBeforeSectionId}"]`);
      return el ? el.getBoundingClientRect().top : null;
    } else {
      const last = r.sections[r.sections.length - 1];
      if (!last) return null;
      const el = document.querySelector(`[data-block-id="${last.id}"]`);
      return el ? el.getBoundingClientRect().bottom : null;
    }
  }
  if (target.kind === 'entry-slot') {
    const section = r.sections.find(s => s.id === target.sectionId)!;
    if (target.insertAtIndex < section.entries.length) {
      const entryId = section.entries[target.insertAtIndex].id;
      const el = document.querySelector(`[data-block-id="${entryId}"]`);
      return el ? el.getBoundingClientRect().top : null;
    } else {
      const last = section.entries[section.entries.length - 1];
      if (!last) {
        const sEl = document.querySelector(`[data-block-id="${target.sectionId}"]`);
        return sEl ? sEl.getBoundingClientRect().bottom : null;
      }
      const el = document.querySelector(`[data-block-id="${last.id}"]`);
      return el ? el.getBoundingClientRect().bottom : null;
    }
  }
  // bullet-slot
  const entry = r.sections.flatMap(s => s.entries).find(e => e.id === target.entryId);
  if (!entry) return null;
  if (target.insertAtIndex < entry.bullets.length) {
    const bulletId = entry.bullets[target.insertAtIndex].id;
    const el = document.querySelector(`[data-block-id="${bulletId}"]`);
    return el ? el.getBoundingClientRect().top : null;
  }
  const last = entry.bullets[entry.bullets.length - 1];
  if (!last) {
    const eEl = document.querySelector(`[data-block-id="${target.entryId}"]`);
    return eEl ? eEl.getBoundingClientRect().bottom : null;
  }
  const el = document.querySelector(`[data-block-id="${last.id}"]`);
  return el ? el.getBoundingClientRect().bottom : null;
}

export function findNearestDropTarget(
  cursorY: number,
  _block: SelectableBlock,
  validTargets: DropTarget[],
): DropTarget | null {
  if (validTargets.length === 0) return null;
  type Candidate = { target: DropTarget; y: number };
  const candidates: Candidate[] = [];
  for (const t of validTargets) {
    const y = getDropTargetY(t);
    if (y !== null) candidates.push({ target: t, y });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(a.y - cursorY) - Math.abs(b.y - cursorY));
  return candidates[0].target;
}

/** Map a DropTarget back to an atom-list index (the position where the
 *  preview should "open up" a slot). Bullet drops return null because
 *  bullets aren't atoms — no atom-level preview animation for them. */
function dropTargetToAtomIndex(target: DropTarget, atoms: LayoutAtom[]): number | null {
  if (target.kind === 'section-slot') {
    if (target.insertBeforeSectionId === null) return atoms.length;
    const idx = atoms.findIndex(
      a => a.kind === 'section-heading' && a.sourceBlockId === target.insertBeforeSectionId,
    );
    return idx >= 0 ? idx : null;
  }
  if (target.kind === 'entry-slot') {
    const sectionAtomIdx = atoms.findIndex(
      a => a.kind === 'section-heading' && a.sourceBlockId === target.sectionId,
    );
    if (sectionAtomIdx < 0) return null;
    let entryCount = 0;
    for (let i = sectionAtomIdx + 1; i < atoms.length; i++) {
      if (atoms[i].kind === 'section-heading') return i;  // before the next section heading
      if (atoms[i].kind === 'entry') {
        if (entryCount === target.insertAtIndex) return i;
        entryCount++;
      }
    }
    return atoms.length;
  }
  return null;  // bullet-slot — no atom-level preview
}

function currentAtoms(): LayoutAtom[] {
  const r = useResumeStore.getState().resume;
  return r ? projectAtoms(r) : [];
}

/**
 * For a SectionBlock drag: group = [section-heading atom, ...all entry atoms
 *   until the next section-heading or end of list]. The whole group lifts
 *   visually, just like dragging a section in Notion lifts heading + content.
 * For an EntryBlock drag: group = [the single entry atom] (entries already
 *   render their bullets nested in EntryAtomRenderer, so the visual is whole).
 * For a BulletBlock drag: this function isn't called (bullet drag uses the
 *   bullet-level preview path).
 *
 * Returns: start/end indices (half-open) into the atoms array, the ids of
 * all atoms in the group, and the SUM of their measured heights (plus gaps
 * between them). Heights are read from current DOM via data-block-id.
 */
function atomGroupForBlock(
  block: SelectableBlock,
  atoms: LayoutAtom[],
): { startIdx: number; endIdx: number; ids: BlockId[]; heightSum: number } {
  const startIdx = atoms.findIndex(a => a.sourceBlockId === block.id);
  if (startIdx < 0) {
    return { startIdx: 0, endIdx: 0, ids: [], heightSum: 0 };
  }

  let endIdx: number;
  if (block.kind === 'section') {
    // Walk forward until we hit the next section-heading or end.
    endIdx = startIdx + 1;
    while (endIdx < atoms.length && atoms[endIdx].kind !== 'section-heading') {
      endIdx++;
    }
  } else {
    endIdx = startIdx + 1;
  }

  const ids: BlockId[] = atoms.slice(startIdx, endIdx).map(a => a.id);
  let heightSum = 0;
  const ATOM_GAP = 12; // mirror layout-tokens ATOM_SPEC.GAP
  for (let i = startIdx; i < endIdx; i++) {
    const el = document.querySelector(`[data-block-id="${atoms[i].sourceBlockId}"]`) as HTMLElement | null;
    heightSum += el ? el.getBoundingClientRect().height : 0;
    if (i < endIdx - 1) heightSum += ATOM_GAP;
  }
  return { startIdx, endIdx, ids, heightSum };
}

export type DropIndicatorPayload = { target: DropTarget; y: number } | null;

export type DragSession = { cancel(): void };

export function startDrag(
  e: PointerEvent,
  handleEl: HTMLElement,
  block: SelectableBlock,
  onDropIndicator: (payload: DropIndicatorPayload) => void,
): DragSession {
  handleEl.setPointerCapture(e.pointerId);
  const startX = e.clientX, startY = e.clientY;
  let dragStarted = false;
  let ghost: HTMLElement | null = null;
  let bulletDraggedHeight = 0;  // only used for bullet drags (atom drags compute their own group height)
  const validTargets = getDropTargetsFor(block);

  const onMove = (ev: PointerEvent) => {
    if (!dragStarted) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      dragStarted = true;
      ghost = makeDragGhost(block.id);
      if (ghost) document.body.appendChild(ghost);
      document.body.style.cursor = 'grabbing';
      // Measure dragged element height for bullet drags (atom drags compute
      // a group height per move via atomGroupForBlock).
      if (block.kind === 'bullet') {
        const blockEl = document.querySelector(`[data-block-id="${block.id}"]`) as HTMLElement | null;
        bulletDraggedHeight = blockEl ? blockEl.getBoundingClientRect().height : 0;
      }
    }
    if (ghost) {
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = ev.clientY + 'px';
    }
    if (ev.clientY < SCROLL_EDGE_PX) window.scrollBy({ top: -10 });
    if (ev.clientY > window.innerHeight - SCROLL_EDGE_PX) window.scrollBy({ top: 10 });
    const target = findNearestDropTarget(ev.clientY, block, validTargets);
    onDropIndicator(target ? { target, y: ev.clientY } : null);

    if (!target) {
      setDragPreview(null);
      return;
    }

    if (target.kind === 'bullet-slot' && block.kind === 'bullet') {
      // Bullet-level preview: shift bullets within the target entry.
      setDragPreview({
        kind: 'bullet',
        draggedBulletId: block.id,
        draggedHeight: bulletDraggedHeight,
        srcEntryId: block.entryId,
        dstEntryId: target.entryId,
        dstBulletIndex: target.insertAtIndex,
      });
      return;
    }

    // Atom-level preview. For a section drag this is a CONTIGUOUS GROUP:
    //   [section-heading, entry, entry, ...]
    // For an entry drag it's a single atom.
    const atoms = currentAtoms();
    const { startIdx, endIdx, ids, heightSum } = atomGroupForBlock(block, atoms);
    const dstAtomIndex = dropTargetToAtomIndex(target, atoms);
    setDragPreview({
      kind: 'atom',
      draggedAtomIds: ids,
      draggedHeight: heightSum,
      srcStartIdx: startIdx,
      srcEndIdx: endIdx,
      dstAtomIndex,
    });
  };

  const onUp = (ev: PointerEvent) => {
    cleanup();
    if (!dragStarted) {
      // Click-without-drag on the ⋮⋮ handle → block selection.
      // Mirrors the modifier semantics that used to live on the (now-deleted)
      // select dot: shift extends a range, cmd/ctrl toggles, plain selects.
      if (ev.shiftKey) {
        selectionManager.extendBlockSelection(block.id, allBlockIdsInDocOrder());
      } else if (ev.metaKey || ev.ctrlKey) {
        selectionManager.toggleBlock(block.id);
      } else {
        selectionManager.selectSingleBlock(block.id);
      }
      return;
    }
    const target = findNearestDropTarget(ev.clientY, block, validTargets);
    if (target) commitDrop(block, target, makeOrigin('drag-reorder'));
  };

  const onCancel = () => cleanup();
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cleanup(); };

  function cleanup(): void {
    try { handleEl.releasePointerCapture(e.pointerId); } catch {}
    if (ghost) ghost.remove();
    document.body.style.cursor = '';
    onDropIndicator(null);
    setDragPreview(null);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey);
  return { cancel: cleanup };
}
