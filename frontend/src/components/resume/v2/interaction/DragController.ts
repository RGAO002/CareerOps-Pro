// frontend/src/components/resume/v2/interaction/DragController.ts
import type { AtomId, AtomLayout, BlockId, LayoutAtom, SelectableBlock, UpdateOrigin } from '../types';
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin } from '../store/source-of-truth';
import { moveSection } from '../store/actions/moveSection';
import { moveEntry } from '../store/actions/moveEntry';
import { moveBullet } from '../store/actions/moveBullet';
import { projectAtoms } from '../layout/atoms-projection';
import { selectionManager } from './SelectionManager';
import { setDragPreview, setRecentlyDroppedId, getRecentlyDroppedId } from './drag-preview-state';
import { makeDragGhost } from './DragGhost';
import type { LayoutEngine } from '../layout/LayoutEngine';

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
/**
 * Pixels the cursor must travel PAST a competing target's midline before drop
 * selection switches to that target. Prevents jitter when the cursor sits near
 * the boundary between two adjacent rows — without hysteresis, the displaced
 * row visibly flips back and forth on each pointermove of a noisy mouse.
 *
 * Bumped from 8 → 12 px. Even with the live-DOM-vs-snapshot fix below, a noisy
 * trackpad can spam pointermoves over a 5–8 px arc; 12 px is comfortably outside
 * that band but still small enough to feel responsive on a deliberate move.
 */
const HYSTERESIS_PX = 12;

/**
 * Per-drag-session state for hysteresis. We DON'T put this on a closure inside
 * startDrag because findNearestDropTarget is exported (and tested) standalone.
 * Caller resets via resetDropTargetHysteresis() at drag start.
 */
let _stickyTargetKey: string | null = null;

export function targetKey(t: DropTarget): string {
  if (t.kind === 'section-slot') return `s:${t.insertBeforeSectionId ?? '*'}`;
  if (t.kind === 'entry-slot') return `e:${t.sectionId}:${t.insertAtIndex}`;
  return `b:${t.entryId}:${t.insertAtIndex}`;
}

export function resetDropTargetHysteresis(): void {
  _stickyTargetKey = null;
}

/**
 * Snapshot every drop target's Y coordinate ONCE at drag start, before any
 * preview transforms touch the DOM.
 *
 * Why: Issue 1 — adjacent-bullet jitter — was *not* a hysteresis bug. The
 * preview animation translates sibling bullets/atoms via CSS `translateY` to
 * "open a slot". `getBoundingClientRect` reflects those transforms, so reading
 * a target's Y on every pointermove gives a value that *moves with the
 * preview itself*. As the cursor sits still near a boundary, the preview
 * shifts → the target's Y moves → distance recomputes → "nearest" flips →
 * preview re-shifts. Classic feedback loop. Hysteresis (added in 36c783b)
 * couldn't break it because the candidates' positions were oscillating, not
 * just the cursor's distance to them.
 *
 * Fix: capture target Ys ONCE, before any preview applies, and reuse the
 * snapshot for the whole drag. Targets stay anchored regardless of what the
 * preview does to the DOM.
 */
export function snapshotDropTargetYs(targets: DropTarget[]): Map<string, number> {
  const snap = new Map<string, number>();
  for (const t of targets) {
    const y = getDropTargetY(t);
    if (y !== null) snap.set(targetKey(t), y);
  }
  return snap;
}

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

/**
 * Build the post-drop atom list (the order the canvas WILL be in if the user
 * drops here right now). Used by previewLayout to compute true post-drop
 * positions for shifted atoms — without this we can only offer a local
 * +H/-H stub which is wrong across page boundaries.
 *
 * Mirrors the same insert-after-remove semantics as moveSection/moveEntry,
 * but on the projected atom list. Bullet drops aren't atom-level so they
 * return the current atoms unchanged (preview stays null).
 */
function buildHypotheticalAtoms(
  block: SelectableBlock,
  target: DropTarget,
  currentAtoms: LayoutAtom[],
): LayoutAtom[] | null {
  if (target.kind === 'bullet-slot') return null;
  // Identify the dragged group (single entry, or section-heading + entries).
  const startIdx = currentAtoms.findIndex(a => a.sourceBlockId === block.id);
  if (startIdx < 0) return null;
  let endIdx = startIdx + 1;
  if (block.kind === 'section') {
    while (endIdx < currentAtoms.length && currentAtoms[endIdx].kind !== 'section-heading') {
      endIdx++;
    }
  }
  const group = currentAtoms.slice(startIdx, endIdx);
  const remaining = [...currentAtoms.slice(0, startIdx), ...currentAtoms.slice(endIdx)];
  // Translate the DropTarget into an insertion index in `remaining`.
  let insertAt: number;
  if (target.kind === 'section-slot') {
    if (target.insertBeforeSectionId === null) {
      insertAt = remaining.length;
    } else {
      const i = remaining.findIndex(
        a => a.kind === 'section-heading' && a.sourceBlockId === target.insertBeforeSectionId,
      );
      insertAt = i >= 0 ? i : remaining.length;
    }
  } else {
    // entry-slot — insert after the section heading, at the Nth entry slot.
    const sectionAtomIdx = remaining.findIndex(
      a => a.kind === 'section-heading' && a.sourceBlockId === target.sectionId,
    );
    if (sectionAtomIdx < 0) return null;
    let entryCount = 0;
    let cursor = sectionAtomIdx + 1;
    while (cursor < remaining.length && remaining[cursor].kind !== 'section-heading') {
      if (entryCount === target.insertAtIndex) break;
      if (remaining[cursor].kind === 'entry') entryCount++;
      cursor++;
    }
    insertAt = cursor;
  }
  return [...remaining.slice(0, insertAt), ...group, ...remaining.slice(insertAt)];
}

/**
 * Resolve the LayoutEngine instance the canvas exposes on window during drag.
 * Falls back to null if not in a browser env (tests) or not yet mounted —
 * AtomContentLayer.shiftFor will then use the legacy H-based math.
 */
function getLayoutEngine(): LayoutEngine | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).__layoutEngine as LayoutEngine | undefined) ?? null;
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
  ySnapshot?: Map<string, number>,
): DropTarget | null {
  if (validTargets.length === 0) return null;
  type Candidate = { target: DropTarget; y: number };
  const candidates: Candidate[] = [];
  for (const t of validTargets) {
    // Prefer snapshot Y (immune to preview's translateY shifts on siblings) —
    // see snapshotDropTargetYs comment. Fall back to live DOM read for tests
    // and for the no-snapshot legacy call shape.
    const y = ySnapshot?.get(targetKey(t)) ?? getDropTargetY(t);
    if (y !== null) candidates.push({ target: t, y });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(a.y - cursorY) - Math.abs(b.y - cursorY));
  const nearest = candidates[0];

  // Hysteresis: keep the previously-chosen target sticky until the cursor
  // moves at least HYSTERESIS_PX closer to a different candidate. Prevents
  // adjacent-row jitter when the cursor sits near the boundary midline.
  if (_stickyTargetKey !== null) {
    const stuck = candidates.find(c => targetKey(c.target) === _stickyTargetKey);
    if (stuck) {
      const stuckDist = Math.abs(stuck.y - cursorY);
      const nearestDist = Math.abs(nearest.y - cursorY);
      // Switch only if the new candidate is the better choice by MORE than
      // HYSTERESIS_PX. Otherwise stay sticky.
      if (stuckDist - nearestDist <= HYSTERESIS_PX) {
        return stuck.target;
      }
    }
  }
  _stickyTargetKey = targetKey(nearest.target);
  return nearest.target;
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

/**
 * After commitDrop, fade the ghost out IN PLACE at the cursor (no flight) and
 * let the dropped atom play its own "settle" animation at its final position
 * (driven by recentlyDroppedId → AtomContentLayer reads it and applies the
 * `atom-settle` keyframe).
 *
 * Why not glide the ghost to the atom rect? It read as "the item flew away" —
 * users felt the drop happened *somewhere else*, not where they let go. The
 * settle pattern gives the opposite feel: "the slot caught the drop right
 * here". The two halves run simultaneously so total perceived motion is ~180
 * ms with no teleport seam.
 */
function animateSoftDrop(ghost: HTMLElement | null): void {
  if (!ghost) return;
  ghost.style.transition = 'opacity 0.15s ease-out';
  ghost.style.opacity = '0';
  setTimeout(() => ghost.remove(), 160);
}

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
  resetDropTargetHysteresis();
  // Snapshot target Ys NOW, before any preview transforms run. See
  // snapshotDropTargetYs comment for why this is critical to kill jitter.
  const targetYs = snapshotDropTargetYs(validTargets);

  const onMove = (ev: PointerEvent) => {
    if (!dragStarted) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      dragStarted = true;
      // For section drag, the ghost includes the section heading + all its
      // entry atoms (so the user sees the whole section being lifted).
      // For entry / bullet drag the ghost is a single block.
      let ghostIds: BlockId[] = [block.id];
      if (block.kind === 'section') {
        const atoms = currentAtoms();
        const group = atomGroupForBlock(block, atoms);
        if (group.ids.length > 0) {
          // group.ids are atom ids; for atoms, id === sourceBlockId, so
          // [data-block-id="${id}"] resolves to the right element.
          ghostIds = atoms
            .slice(group.startIdx, group.endIdx)
            .map(a => a.sourceBlockId);
        }
      }
      ghost = makeDragGhost(ghostIds);
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
    const target = findNearestDropTarget(ev.clientY, block, validTargets, targetYs);
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

    // Compute true post-drop layout for every atom so AtomContentLayer can
    // shift each atom to its real destination (cross-page-correct), not a
    // local +H/-H stub. If engine isn't available (tests), pass null and
    // shiftFor falls back to legacy math.
    let previewLayouts: Map<AtomId, AtomLayout> | null = null;
    const engine = getLayoutEngine();
    if (engine) {
      const hypothetical = buildHypotheticalAtoms(block, target, atoms);
      if (hypothetical) {
        try {
          previewLayouts = engine.previewLayout(hypothetical);
        } catch {
          previewLayouts = null;
        }
      }
    }

    setDragPreview({
      kind: 'atom',
      draggedAtomIds: ids,
      draggedHeight: heightSum,
      srcStartIdx: startIdx,
      srcEndIdx: endIdx,
      dstAtomIndex,
      previewLayouts,
    });
  };

  const onUp = (ev: PointerEvent) => {
    if (!dragStarted) {
      cleanup();
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
    const target = findNearestDropTarget(ev.clientY, block, validTargets, targetYs);
    if (target) {
      // SOFT DROP — "settle in place" pattern:
      //   - Ghost fades out at the cursor (no flight). Reads as "I let go."
      //   - The dropped atom plays the `atom-settle` keyframe at its final
      //     position (opacity 0 → 1). Reads as "the slot caught it here."
      // The two run in parallel ~180 ms total, no teleport seam.
      animateSoftDrop(ghost);
      ghost = null;  // ownership transferred to animateSoftDrop
      // Mark dropped atom so AtomContentLayer plays atom-settle on it.
      setRecentlyDroppedId(block.id);
      setTimeout(() => {
        // Clear only if it's still us (defensive — another drop could have started)
        if (getRecentlyDroppedId() === block.id) setRecentlyDroppedId(null);
      }, 220);
      commitDrop(block, target, makeOrigin('drag-reorder'));
    }
    cleanup();
  };

  const onCancel = () => cleanup();
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cleanup(); };

  function cleanup(): void {
    try { handleEl.releasePointerCapture(e.pointerId); } catch {}
    // Only remove the ghost here if it hasn't been transferred to the soft-drop
    // animator (which manages its own teardown).
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
