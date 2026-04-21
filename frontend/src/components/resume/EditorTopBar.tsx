// frontend/src/components/resume/EditorTopBar.tsx
"use client";

import { Download } from "lucide-react";
import type { ResumeMeta } from "./types";

interface Props {
  meta: ResumeMeta;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

export function EditorTopBar({ meta, saveStatus }: Props) {
  const tailoringLabel =
    meta.target_company && meta.target_role
      ? `${meta.target_company} · ${meta.target_role}`
      : "No target job selected";

  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur-md">
      {/* Resume title — Plan B will replace with a variant dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-900">{meta.title}</span>
      </div>

      <div className="flex-1 text-center">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Tailoring for</span>
        <span className="ml-2 text-sm text-neutral-800">{tailoringLabel}</span>
      </div>

      <SaveBadge status={saveStatus} />

      {/* Disabled placeholder — Plan C implements actual PDF export */}
      <button
        type="button"
        disabled
        className="flex items-center gap-1.5 rounded-md bg-neutral-900/90 px-3 py-1.5 text-xs font-medium text-white opacity-40"
        title="PDF export coming in Plan C"
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
