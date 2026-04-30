// frontend/src/components/resume/PageBreakOverlay.tsx
"use client";

import { useEffect, useState } from "react";

const PAGE_HEIGHT_PX = 11 * 96; // 11 inch * 96 dpi = 1056 px
export const PAGE_GAP_PX = 16; // visible gray gap between page cards (Google Docs style)
const PAGE_AND_GAP = PAGE_HEIGHT_PX + PAGE_GAP_PX;

interface Props {
  /** A ref-like getter that returns the canvas DOM element. */
  getCanvas: () => HTMLElement | null;
}

/**
 * Renders the visual page-card stack BEHIND the editor canvas AND repaginates
 * top-level resume blocks so they don't visually straddle the inter-page gap.
 *
 * Repagination works by measuring each top-level resume block (header + sections)
 * after the editor renders. If a block's bottom would cross a page boundary, we
 * apply a `margin-top` push to bring its top down to the next page card's start.
 * The browser then reflows the rest of the document below it. We re-measure
 * subsequent blocks live (synchronous reflow on each getBoundingClientRect read)
 * so cascading shifts work correctly.
 *
 * Caveats:
 *   - A single block taller than one page can't be split (it'll overflow). The
 *     resume schema makes this rare — only a section with way too many bullets.
 *   - The data attribute `data-pushed-by` is set on shifted blocks for debugging
 *     and to make the repagination visible in DevTools.
 */
export function PageBreakOverlay({ getCanvas }: Props) {
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const canvas = getCanvas();
    if (!canvas) return;

    let isUpdating = false;

    const repaginate = () => {
      // Re-entrancy guard: applying margins changes layout, which fires
      // ResizeObserver again, which would re-call repaginate. Skip the
      // recursive call and let the next user-driven mutation re-trigger.
      if (isUpdating) return;
      isUpdating = true;
      try {
        // The actual editable surface inside the canvas.
        const prose = canvas.querySelector(".ProseMirror") as HTMLElement | null;
        if (!prose) return;

        const canvasStyle = window.getComputedStyle(canvas);
        const pagePaddingTop = parseFloat(canvasStyle.paddingTop || "0") || 0;
        const pagePaddingBottom = parseFloat(canvasStyle.paddingBottom || "0") || 0;

        const blocks = Array.from(prose.children) as HTMLElement[];

        // Reset previous pushes — start from a clean slate every measurement.
        for (const b of blocks) {
          b.style.marginTop = "";
          b.removeAttribute("data-pushed-by");
        }

        // Force layout once with margins reset, then iterate.
        // Each getBoundingClientRect() inside the loop forces synchronous
        // reflow so subsequent measurements reflect previous pushes.
        const canvasRect = canvas.getBoundingClientRect();

        for (const block of blocks) {
          const rect = block.getBoundingClientRect();
          const top = rect.top - canvasRect.top; // position within canvas
          const height = rect.height;
          if (height <= 0) continue;

          // Which page's CONTENT AREA does this block start on? (0-indexed)
          // We treat the canvas's top/bottom padding as the per-page body
          // inset so blocks repaginate into the next page's text box, not
          // flush against the page edge.
          const startPage = Math.floor(
            Math.max(0, top - pagePaddingTop) / PAGE_AND_GAP,
          );
          // Bottom of that page's content area (before bottom padding).
          const startPageEnd =
            startPage * PAGE_AND_GAP + PAGE_HEIGHT_PX - pagePaddingBottom;
          const blockBottom = top + height;

          if (blockBottom > startPageEnd && height <= PAGE_HEIGHT_PX) {
            // This block would cross the page boundary AND it fits on a single page.
            // Push it down so its top lands at the next page's CONTENT start,
            // matching Google Docs / printed document body inset.
            const nextPageStart = (startPage + 1) * PAGE_AND_GAP + pagePaddingTop;
            const push = Math.max(0, Math.round(nextPageStart - top));
            if (push > 0) {
              block.style.marginTop = `${push}px`;
              block.setAttribute("data-pushed-by", String(push));
            }
          }
        }

        // Total page count based on where the LAST block ends (not raw
        // scrollHeight, which includes trailing canvas padding that can
        // overshoot into a phantom empty page).
        let lastBlockBottomFromCanvas = 0;
        for (const block of blocks) {
          const r = block.getBoundingClientRect();
          const bottom = r.bottom - canvasRect.top;
          if (bottom > lastBlockBottomFromCanvas) lastBlockBottomFromCanvas = bottom;
        }
        const lastPage = Math.max(
          0,
          Math.floor(Math.max(0, lastBlockBottomFromCanvas - 1) / PAGE_AND_GAP),
        );
        const pages = Math.max(1, lastPage + 1);
        setTotalPages((prev) => (prev === pages ? prev : pages));
      } finally {
        // Release guard on next frame so subsequent layout-driven RO callbacks
        // (from our own changes) don't loop.
        requestAnimationFrame(() => {
          isUpdating = false;
        });
      }
    };

    repaginate();
    const ro = new ResizeObserver(repaginate);
    ro.observe(canvas);
    // Also observe the .ProseMirror so we catch internal content changes that
    // don't change the canvas size (e.g. small edits within a fixed-height block).
    const prose = canvas.querySelector(".ProseMirror");
    if (prose) ro.observe(prose);

    return () => ro.disconnect();
  }, [getCanvas]);

  if (totalPages < 1) return null;

  return (
    <>
      {/* Page card backgrounds — sit BEHIND the canvas via z-index */}
      <div
        className="page-card-stack pointer-events-none absolute inset-x-0 top-0"
        style={{ zIndex: 0 }}
      >
        {Array.from({ length: totalPages }).map((_, i) => (
          <div
            key={i}
            data-page-card={i + 1}
            style={{
              position: "absolute",
              top: `${i * PAGE_AND_GAP}px`,
              left: 0,
              right: 0,
              height: `${PAGE_HEIGHT_PX}px`,
              background: "white",
              boxShadow:
                "0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)",
            }}
          />
        ))}
      </div>

      {/* Page indicators — sit ABOVE the canvas */}
      <div
        className="page-indicators pointer-events-none absolute inset-x-0 top-0"
        style={{ zIndex: 20 }}
      >
        {Array.from({ length: totalPages }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: `${i * PAGE_AND_GAP + 8}px`,
              right: 8,
            }}
            className="rounded bg-neutral-100/90 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500 backdrop-blur-sm"
          >
            Page {i + 1} of {totalPages}
          </div>
        ))}
      </div>
    </>
  );
}
