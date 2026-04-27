// frontend/src/components/resume/v2/layers/AtomContentLayer.tsx
'use client';
import { useEffect, useState } from 'react';
import { AtomRenderer } from '../atoms/AtomRenderer';
import { getAtomAbsoluteCoord, gapForMode } from '../layout/coords';
import {
  getDragPreview,
  subscribeDragPreview,
  type DragPreview,
  getRecentlyDroppedId,
  subscribeRecentlyDropped,
} from '../interaction/drag-preview-state';
import type { LayoutAtom, AtomLayout, AtomId, BlockId, ResumeDoc, CanvasMode } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';
import type { AtomElementRegistry } from '../layout/AtomElementRegistry';

interface Props {
  atoms: LayoutAtom[];
  layouts: Map<AtomId, AtomLayout>;
  resume: ResumeDoc;
  mode: CanvasMode;
  template: NormalizedTemplate;
  registry?: AtomElementRegistry | null;
}

// Visible gap (px) added on top of the dragged atom's height when shifting
// downstream atoms — gives the user a clear "slot" to drop into.
const DROP_SLOT_GAP_PX = 12;

export function AtomContentLayer({ atoms, layouts, resume, mode, template, registry }: Props) {
  const [preview, setPreview] = useState<DragPreview>(getDragPreview());
  const [recentlyDroppedId, setRecentlyDroppedIdState] = useState<BlockId | null>(getRecentlyDroppedId());

  useEffect(() => subscribeDragPreview(setPreview), []);
  useEffect(() => subscribeRecentlyDropped(setRecentlyDroppedIdState), []);

  // Which page card a given absolute Y lives on (counting the inter-page gap
  // as belonging to the page above — i.e., the gap and the previous page card
  // are treated as one "row" for the purpose of cross-page detection).
  const pageStride = template.page.heightPx + gapForMode(mode);
  function pageOf(absoluteTop: number): number {
    return Math.floor(absoluteTop / pageStride);
  }

  /**
   * Compute the shift offset for atom at `atomIndex`, simulating the post-move
   * layout so atoms slide cleanly without the dragged group's faded ghost
   * staying behind.
   *
   * The dragged "group" can be:
   *   - a single entry atom (entry drag), OR
   *   - a section heading + all its entries as a contiguous range (section
   *     drag — group lifts together so the user sees the whole section move).
   *
   * Algorithm (Notion-style, generalized for ranges):
   *   group = [srcStart, srcEnd)
   *   - If srcStart < dst (moving DOWN): atoms in [srcEnd, dst) shift UP by H
   *     (close the group's gap; opens a slot at dst).
   *   - If srcStart > dst (moving UP): atoms in [dst, srcStart) shift DOWN
   *     by H (open a slot at dst; group will fill above).
   *   - Atoms inside the group: hidden.
   */
  function shiftFor(atomId: AtomId, atomIndex: number): number {
    if (!preview || preview.kind !== 'atom') return 0;
    if (preview.draggedAtomIds.includes(atomId)) return 0;
    if (preview.dstAtomIndex === null) return 0;

    // Layout-aware path: use the engine-computed post-drop layout to compute
    // the EXACT shift = postDropTop - currentTop. This is correct across page
    // boundaries (where +H/-H is wildly wrong — the atom would land in the
    // inter-page gap or on a wrong page). The legacy H-based math below is
    // kept as a fallback when previewLayouts isn't available (tests, or no
    // engine on window).
    if (preview.previewLayouts) {
      const currentLayout = layouts.get(atomId);
      const postDropLayout = preview.previewLayouts.get(atomId);
      if (currentLayout && postDropLayout) {
        const currentCoord = getAtomAbsoluteCoord(currentLayout, mode, template);
        const postDropCoord = getAtomAbsoluteCoord(postDropLayout, mode, template);
        return postDropCoord.top - currentCoord.top;
      }
    }

    const srcStart = preview.srcStartIdx;
    const srcEnd = preview.srcEndIdx;
    const dst = preview.dstAtomIndex;
    const H = preview.draggedHeight + DROP_SLOT_GAP_PX;
    let raw = 0;
    if (srcStart < dst) {
      if (atomIndex >= srcEnd && atomIndex < dst) raw = -H;
    } else if (srcStart > dst) {
      if (atomIndex >= dst && atomIndex < srcStart) raw = H;
    }
    if (raw === 0) return 0;
    return snapAcrossPageGap(atomId, raw);
  }

  /**
   * Drag preview shifts via CSS translateY do NOT re-flow into the next page
   * card — the pagination engine only runs on commit. So an atom shifted by H
   * pixels can land visually inside the inter-page gap (the gray strip between
   * page cards), where there's no page background behind it. This snaps the
   * shift so the atom lands at the top of the next/previous page card content
   * area instead of floating in the gap. Approximate but visually clean.
   */
  function snapAcrossPageGap(atomId: AtomId, rawShift: number): number {
    const layout = layouts.get(atomId);
    if (!layout) return rawShift;
    const gap = gapForMode(mode);
    const pageStride = template.page.heightPx + gap;
    const originalTop = layout.pageIndex * pageStride
      + template.page.marginPx.top
      + layout.yWithinPage;
    const newTop = originalTop + rawShift;

    if (rawShift > 0) {
      // Shifting DOWN. Find the page the new top lands on by stride.
      const targetPage = Math.floor(newTop / pageStride);
      const targetPageContentEnd = targetPage * pageStride
        + template.page.heightPx
        - template.page.marginPx.bottom;
      // If we land past the content area (in the bottom-margin OR gap), snap
      // to the next page's content top.
      if (newTop > targetPageContentEnd) {
        const snappedTop = (targetPage + 1) * pageStride + template.page.marginPx.top;
        return snappedTop - originalTop;
      }
      return rawShift;
    }

    // Shifting UP (rawShift < 0).
    const targetPage = Math.floor(newTop / pageStride);
    const targetPageContentStart = targetPage * pageStride + template.page.marginPx.top;
    // If new top falls before the content area (in top-margin OR previous gap),
    // snap to the previous page's content bottom.
    if (newTop < targetPageContentStart) {
      const prev = Math.max(0, targetPage - 1);
      const snappedTop = prev * pageStride
        + template.page.heightPx
        - template.page.marginPx.bottom;
      return snappedTop - originalTop;
    }
    return rawShift;
  }

  function isDragged(atomId: AtomId): boolean {
    return preview?.kind === 'atom' && preview.draggedAtomIds.includes(atomId);
  }

  return (
    <div
      className="atom-content-layer"
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    >
      {atoms.map((atom, idx) => {
        const layout = layouts.get(atom.id);
        if (!layout) return null;
        const coord = getAtomAbsoluteCoord(layout, mode, template);
        const dragged = isDragged(atom.id);
        const shift = shiftFor(atom.id, idx);
        const justDropped = recentlyDroppedId === atom.id;
        // Cross-page shifts: a linear CSS transform transition would visually
        // drag the atom through the inter-page gap (gray strip), making it
        // look like it's floating between pages mid-animation. Use a
        // fade-out / snap / fade-in keyframe instead so the user never sees
        // the atom inside the gap.
        //
        // With layout-aware preview (preview.previewLayouts present), the
        // shift is the TRUE post-drop delta — atoms whose final destination
        // is on another page get a numerically large shift that necessarily
        // crosses the gap. The keyframe still hides the gap-traversal
        // artifact correctly because it fades out → snaps → fades in.
        const crossesPageBoundary = shift !== 0
          && pageOf(coord.top) !== pageOf(coord.top + shift);
        let animationStyle: React.CSSProperties;
        if (crossesPageBoundary) {
          animationStyle = {
            animation: 'atom-cross-page-shift 0.24s ease-out',
            transition: 'visibility 0s',
            ['--atom-shift-to' as string]: `${shift}px`,
          };
        } else if (justDropped) {
          // Fade the freshly-dropped atom in (opacity 0 → 1) while the ghost
          // glides to its final rect. animateSoftDrop in DragController runs
          // for ~180ms, so we match that here.
          animationStyle = {
            transition: 'opacity 0.18s ease-out, transform 0.18s ease-out',
          };
        } else {
          animationStyle = {
            transition: 'transform 0.18s ease-out, opacity 0.12s ease-out, visibility 0s',
          };
        }
        // Opacity priority:
        //   - dragged: hidden (ghost is the visible proxy)
        //   - justDropped: fade in from 0 (soft-landing)
        //   - else: visible
        const opacity = dragged ? 0 : (justDropped ? 1 : 1);
        // For justDropped atoms, set the START opacity (0) so the transition
        // animates 0 → 1. We do this by toggling a key on the recently-dropped
        // marker — but to avoid forcing a remount, use animation instead.
        const startOpacityStyle: React.CSSProperties = justDropped
          ? { animation: 'atom-soft-drop-fade-in 0.18s ease-out' }
          : {};
        return (
          <div
            key={atom.id}
            style={{
              position: 'absolute',
              top: coord.top,
              left: coord.left,
              width: layout.width,
              pointerEvents: dragged ? 'none' : 'auto',
              // Always set transform (even at 0px) so CSS can transition
              // smoothly between values.
              transform: `translateY(${shift}px)`,
              ...animationStyle,
              ...startOpacityStyle,
              // Hide the dragged atom completely — the floating ghost shows
              // where it's headed. visibility: hidden keeps the slot in
              // layout (so subscribers' getBoundingClientRect stays stable)
              // but no pixels render.
              opacity,
              visibility: dragged ? 'hidden' : 'visible',
              willChange: (preview || justDropped) ? 'transform, opacity' : undefined,
            }}
          >
            <AtomRenderer atom={atom} resume={resume} mode={mode} registry={registry} />
          </div>
        );
      })}
    </div>
  );
}
