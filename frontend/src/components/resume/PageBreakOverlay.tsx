// frontend/src/components/resume/PageBreakOverlay.tsx
"use client";

import { useEffect, useState } from "react";

const PAGE_HEIGHT_PX = 11 * 96; // 11 inch * 96 dpi = 1056 px

interface Props {
  /** A ref-like getter that returns the canvas DOM element. */
  getCanvas: () => HTMLElement | null;
}

export function PageBreakOverlay({ getCanvas }: Props) {
  const [breaks, setBreaks] = useState<number[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const update = () => {
      const el = getCanvas();
      if (!el) return;
      const h = el.scrollHeight;
      const pages = Math.max(1, Math.ceil(h / PAGE_HEIGHT_PX));
      const positions: number[] = [];
      for (let i = 1; i < pages; i++) positions.push(i * PAGE_HEIGHT_PX);
      setBreaks(positions);
      setTotalPages(pages);
    };

    update();
    const el = getCanvas();
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [getCanvas]);

  return (
    <div className="page-break-overlay pointer-events-none absolute inset-0">
      {breaks.map((y, i) => (
        <div key={i} style={{ top: `${y}px` }} className="absolute left-0 right-0">
          <div className="border-t border-dashed border-neutral-300" />
          <div className="absolute right-2 top-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
            Page {i + 2} of {totalPages}
          </div>
        </div>
      ))}
      {totalPages > 1 && (
        <div className="absolute right-2 top-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
          Page 1 of {totalPages}
        </div>
      )}
    </div>
  );
}
