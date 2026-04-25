// frontend/src/components/resume/EditorTopBar.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { Download } from "lucide-react";
import type { ResumeMeta } from "./types";
import { FormatToolbar } from "./FormatToolbar";

interface Props {
  meta: ResumeMeta;
  saveStatus: "idle" | "saving" | "saved" | "error";
  editor: Editor | null;
}

export function EditorTopBar({ meta, saveStatus, editor }: Props) {
  const tailoringLabel =
    meta.target_company && meta.target_role
      ? `${meta.target_company} · ${meta.target_role}`
      : "No target job selected";

  return (
    <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white/85 px-5 backdrop-blur-md">
      {/* Resume title */}
      <span className="shrink-0 truncate text-sm font-medium text-neutral-900">
        {meta.title}
      </span>

      {/* Format toolbar — always visible, operates on current selection */}
      <FormatToolbar editor={editor} />

      <div className="min-w-0 flex-1 truncate text-center">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Tailoring for</span>
        <span className="ml-2 whitespace-nowrap text-sm text-neutral-800">{tailoringLabel}</span>
      </div>

      <SaveBadge status={saveStatus} />

      {/* Export PDF — triggers browser print dialog (Save as PDF).
          @media print rules in resume-editor.css strip editor chrome so the
          output matches the canvas. Server-side WeasyPrint is Plan C v2. */}
      <button
        type="button"
        onClick={() => {
          // Blur any active editor selection so print doesn't show cursor
          if (typeof document !== "undefined") {
            (document.activeElement as HTMLElement | null)?.blur?.();
          }
          window.print();
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800"
        title="Export PDF (⌘P)"
      >
        <Download className="size-3.5" strokeWidth={2} />
        Export PDF
      </button>
    </div>
  );
}

function SaveBadge({ status }: { status: Props["saveStatus"] }) {
  const labels = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Save failed",
  } as const;
  if (status === "idle") return <span className="w-[4.5rem]" aria-hidden />;
  return (
    <span
      className={`w-[4.5rem] text-right text-[11px] ${
        status === "error" ? "text-red-500" : "text-neutral-500"
      }`}
    >
      {labels[status]}
    </span>
  );
}
