"use client";

import { ChevronUp } from "lucide-react";
import { useAiPanelStore } from "@/stores/aiPanel";
import { C } from "./colors";

export function PanelCollapsed() {
  const expandOne = useAiPanelStore((s) => s.expandOne);

  return (
    <button
      type="button"
      onClick={expandOne}
      className="flex w-full items-center gap-3 px-5 text-left"
      style={{ height: 38 }}
    >
      <div
        className="size-2 shrink-0 rounded-sm"
        style={{ background: C.brandGrad }}
      />
      <span
        className="flex-1 text-[12px]"
        style={{ color: C.textMuted }}
      >
        Ask anything about your job search...
      </span>
      <span
        className="rounded px-1.5 py-0.5 text-[9px]"
        style={{
          color: C.textMuted,
          border: `1px solid ${C.innerBorder}`,
          background: C.badgeBg,
        }}
      >
        ⌘J
      </span>
      <ChevronUp
        className="size-3.5"
        style={{ color: C.textMuted }}
        strokeWidth={1.8}
      />
    </button>
  );
}
