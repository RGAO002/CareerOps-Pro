// frontend/src/components/layout/AIChatPanel/ModeIndicator.tsx
"use client";

import { usePageContextStore } from "@/stores/pageContext";
import { C } from "./colors";

const MODE_LABELS: Record<string, string> = {
  dashboard:        "Dashboard mode",
  resume_editor:    "Resume Editor mode",
  job_search:       "Job Search mode",
  applications:     "Applications mode",
  mock_interview:   "Interview mode",
  insights:         "Insights mode",
};

interface Props {
  /** When true, also show the secondary context summary (used in Expanded). */
  showSummary?: boolean;
}

export function ModeIndicator({ showSummary = false }: Props) {
  const ctx = usePageContextStore((s) => s.context);
  const label = ctx ? (MODE_LABELS[ctx.page] ?? "Assistant") : "Assistant";

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <div
        className="size-2 shrink-0 rounded-sm"
        style={{ background: C.brandGrad }}
      />
      <span
        className="text-[10px] font-semibold tracking-[0.05em] shrink-0"
        style={{ color: C.textPrimary }}
      >
        AI · {label}
      </span>
      {showSummary && ctx?.summary && (
        <>
          <span className="text-[10px]" style={{ color: C.textMuted }}>·</span>
          <span
            className="text-[10px] truncate"
            style={{ color: C.textMuted }}
            title={ctx.summary}
          >
            {ctx.summary}
          </span>
        </>
      )}
    </div>
  );
}
