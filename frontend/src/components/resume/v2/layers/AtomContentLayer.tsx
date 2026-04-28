// frontend/src/components/resume/v2/layers/AtomContentLayer.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
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

/**
 * Build a CSS `clip-path: path('…')` string that's the UNION of every page
 * card rect (with inter-page gaps EXCLUDED). When the AtomContentLayer wrapper
 * carries this clip, an atom can `transform: translateY(...)` linearly through
 * inter-page-gap Y values without ever rendering inside the gap — the clip
 * makes those Y rows invisible. This is what unlocks a smooth cross-page drag
 * preview without the previous fade-out/snap/fade-in keyframe (which felt
 * teleporty).
 *
 * SVG path with multiple closed sub-paths gets unioned by the default
 * non-zero fill rule (each rect is wound the same direction, so they all paint
 * "inside"). Modern Chrome/Firefox/Safari support `clip-path: path(...)`.
 *
 * Pure function — exported for testing.
 */
export function buildPageClipPath(
  pageCount: number,
  pageHeightPx: number,
  pageStridePx: number,
): string {
  if (pageCount <= 0) return 'none';
  const subPaths: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const top = i * pageStridePx;
    const bottom = top + pageHeightPx;
    // Use 0% / 100% for X so the clip auto-stretches with the wrapper's width.
    subPaths.push(`M0 ${top} L100% ${top} L100% ${bottom} L0 ${bottom} Z`);
  }
  return `path('${subPaths.join(' ')}')`;
}

export function AtomContentLayer({ atoms, layouts, resume, mode, template, registry }: Props) {
  const [preview, setPreview] = useState<DragPreview>(getDragPreview());
  const [recentlyDroppedId, setRecentlyDroppedIdState] = useState<BlockId | null>(getRecentlyDroppedId());

  useEffect(() => subscribeDragPreview(setPreview), []);
  useEffect(() => subscribeRecentlyDropped(setRecentlyDroppedIdState), []);

  // Page-card clip path: the wrapper masks out inter-page gap rows so atoms
  // can translate freely across page boundaries during drag preview without
  // becoming visible in the gap. Memoize on inputs that affect the geometry.
  const pageStride = template.page.heightPx + gapForMode(mode);
  // Derive page count from atom layouts (max pageIndex + 1). This avoids
  // threading pageCount through props — layouts already encode it.
  const pageCount = useMemo(() => {
    let max = 0;
    for (const l of layouts.values()) {
      if (l.pageIndex > max) max = l.pageIndex;
    }
    return max + 1;
  }, [layouts]);
  const pageClipPath = useMemo(
    () => buildPageClipPath(pageCount, template.page.heightPx, pageStride),
    [pageCount, template.page.heightPx, pageStride],
  );

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
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
        // Mask out inter-page gap rows so cross-page atom transforms don't
        // bleed into the gray strip between page cards. See buildPageClipPath.
        clipPath: pageClipPath,
        WebkitClipPath: pageClipPath,
      }}
    >
      {atoms.map((atom, idx) => {
        const layout = layouts.get(atom.id);
        if (!layout) return null;
        const coord = getAtomAbsoluteCoord(layout, mode, template);
        const dragged = isDragged(atom.id);
        const shift = shiftFor(atom.id, idx);
        const justDropped = recentlyDroppedId === atom.id;
        // Single transition handles both same-page and cross-page shifts —
        // the wrapper's clip-path hides any traversal of the inter-page gap.
        // No more keyframe / cross-page detection needed.
        const animationStyle: React.CSSProperties = {
          transition: 'transform 0.18s ease-out, opacity 0.12s ease-out, visibility 0s',
        };
        // Settle: a freshly-dropped atom plays atom-settle (opacity 0 → 1)
        // at its final position. Pairs with the ghost fading out in place
        // at the cursor → "the slot caught the drop here", not "the item
        // flew somewhere".
        const settleStyle: React.CSSProperties = justDropped
          ? { animation: 'atom-settle 0.24s ease-out' }
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
              // For the just-dropped atom, OMIT the inline transform so the
              // atom-settle keyframe (which animates `transform: scale(...)`)
              // can own transform during its 240 ms window. Post-drop shift
              // is 0 anyway (preview is gone), so no layout impact.
              ...(justDropped ? {} : { transform: `translateY(${shift}px)` }),
              ...animationStyle,
              ...settleStyle,
              // Hide the dragged atom completely — the floating ghost shows
              // where it's headed. visibility: hidden keeps the slot in
              // layout (so subscribers' getBoundingClientRect stays stable)
              // but no pixels render.
              opacity: dragged ? 0 : 1,
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
