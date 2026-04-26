// frontend/src/components/resume/PageBreakOverlay.tsx
"use client";

import { useEffect, useState } from "react";

const PAGE_HEIGHT_PX = 11 * 96; // 11 inch * 96 dpi = 1056 px
export const PAGE_GAP_PX = 16; // visible gray gap between page cards (Google Docs style)

interface Props {
  /** A ref-like getter that returns the canvas DOM element. */
  getCanvas: () => HTMLElement | null;
}

/**
 * Renders the visual page-card stack BEHIND the editor canvas.
 *
 * Each page is a separate white "card" with shadow, with PAGE_GAP_PX of the
 * neutral page-bg color visible between them — like Google Docs / Pages.
 * The editor canvas itself sits on TOP of these cards with a transparent
 * background, so editor content visually appears to "live inside" the cards.
 *
 * Known limitation: the canvas is one continuous TipTap document, so text
 * that lands right at a page boundary will visually cross the gap. The
 * `break-inside: avoid` CSS on .resume-entry / .resume-bullet keeps this
 * rare in practice. Real per-page rendering is a Phase 2 follow-up.
 */
export function PageBreakOverlay({ getCanvas }: Props) {
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const update = () => {
      const el = getCanvas();
      if (!el) return;
      const h = el.scrollHeight;
      const pages = Math.max(1, Math.ceil(h / PAGE_HEIGHT_PX));
      setTotalPages(pages);
    };

    update();
    const el = getCanvas();
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
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
              top: `${i * (PAGE_HEIGHT_PX + PAGE_GAP_PX)}px`,
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
              top: `${i * (PAGE_HEIGHT_PX + PAGE_GAP_PX) + 8}px`,
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
