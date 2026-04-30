// frontend/src/components/resume/EditorTopBar.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { Download, Eye, History as HistoryIcon } from "lucide-react";
import { useState } from "react";

import { resumeApi } from "@/lib/resumeApi";
import type { Resume, ResumeSummary } from "@/lib/resumeApi";

import { FormatToolbar } from "./FormatToolbar";
import { NewVariantModal } from "./NewVariantModal";
import { PreviewPDFModal } from "./PreviewPDFModal";
import { ResumeDropdown } from "./ResumeDropdown";
import { SaveBadge } from "./SaveBadge";

interface Props {
  current: Resume;
  available: ResumeSummary[];
  saveStatus: "idle" | "saving" | "saved" | "error" | "offline";
  lastSavedAt: number | null;
  editor: Editor | null;
  onOpenHistory?: () => void;
}

export function EditorTopBar({
  current,
  available,
  saveStatus,
  lastSavedAt,
  editor,
  onOpenHistory,
}: Props) {
  const [showNewVariant, setShowNewVariant] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const tailoringLabel =
    current.target_company && current.target_role
      ? `${current.target_company} · ${current.target_role}`
      : current.target_company
      ? current.target_company
      : null;

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur-md">
        <ResumeDropdown
          current={current}
          available={available}
          onNewVariant={() => setShowNewVariant(true)}
        />

        <div className="h-5 w-px bg-neutral-200" />

        <FormatToolbar editor={editor} />

        <div className="flex-1 text-center">
          {tailoringLabel && (
            <>
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                Tailoring for
              </span>
              <span className="ml-2 truncate text-sm text-neutral-800">{tailoringLabel}</span>
            </>
          )}
        </div>

        <SaveBadge status={saveStatus} lastSavedAt={lastSavedAt} />

        <button
          type="button"
          onClick={async () => {
            const label = window.prompt("Checkpoint label (optional):") ?? undefined;
            try {
              await resumeApi.createSnapshot(current.id, {
                trigger: "checkpoint",
                label: label?.trim() || undefined,
              });
            } catch {
              /* ignore */
            }
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
          title="Save a labeled checkpoint"
        >
          ✓ Checkpoint
        </button>

        <button
          type="button"
          onClick={onOpenHistory}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
          title="History (snapshots)"
        >
          <HistoryIcon className="size-3.5" />
          History
        </button>

        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
          title="Preview paginated PDF"
        >
          <Eye className="size-3.5" strokeWidth={2} />
          Preview
        </button>

        <a
          href={`${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"}/api/resume/${current.id}/pdf`}
          download
          className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
          title="Download the resume as PDF"
        >
          <Download className="size-3.5" strokeWidth={2} />
          Export PDF
        </a>
      </div>

      {showNewVariant && (
        <NewVariantModal
          parentId={current.id}
          parentTitle={current.title}
          onClose={() => setShowNewVariant(false)}
        />
      )}

      {showPreview && (
        <PreviewPDFModal resumeId={current.id} onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}
