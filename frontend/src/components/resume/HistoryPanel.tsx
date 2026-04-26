// frontend/src/components/resume/HistoryPanel.tsx
"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { resumeApi, type ResumeSnapshot } from "@/lib/resumeApi";
import { formatRelative } from "@/lib/relativeTime";

interface Props {
  resumeId: string;
  onClose: () => void;
  onRestored: () => void;
}

export function HistoryPanel({ resumeId, onClose, onRestored }: Props) {
  const [snaps, setSnaps] = useState<ResumeSnapshot[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resumeApi
      .listSnapshots(resumeId)
      .then((r) => {
        if (!cancelled) setSnaps(r.snapshots);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  async function restore(snapshotId: string) {
    setRestoring(snapshotId);
    try {
      await resumeApi.restore(resumeId, snapshotId);
      onRestored();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setRestoring(null);
    }
  }

  return (
    <div className="fixed right-0 top-0 z-40 flex h-screen w-[360px] flex-col border-l border-neutral-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">History</h2>
        <button onClick={onClose} className="rounded p-1 hover:bg-neutral-100">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {error && <div className="mb-3 text-xs text-red-600">{error}</div>}
        {snaps == null && <Loader2 className="mx-auto mt-8 size-5 animate-spin text-neutral-400" />}
        {snaps && snaps.length === 0 && (
          <div className="mt-8 text-center text-xs text-neutral-400">
            No snapshots yet — keep editing.
          </div>
        )}
        {snaps && (
          <ul className="space-y-1">
            {snaps.map((s) => (
              <li
                key={s.id}
                className="rounded border border-neutral-200 p-2 hover:border-neutral-300"
              >
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>{formatRelative(s.created_at)}</span>
                  <TriggerBadge trigger={s.trigger} />
                </div>
                {s.label && <div className="mt-1 text-xs font-medium">{s.label}</div>}
                {s.diff_summary && (
                  <div className="mt-1 text-xs text-neutral-600">{s.diff_summary}</div>
                )}
                <button
                  type="button"
                  disabled={restoring === s.id}
                  onClick={() => restore(s.id)}
                  className="mt-2 rounded bg-neutral-900 px-2 py-1 text-[11px] text-white disabled:opacity-50"
                >
                  {restoring === s.id ? "Restoring…" : "Restore this version"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TriggerBadge({ trigger }: { trigger: ResumeSnapshot["trigger"] }) {
  const colors: Record<typeof trigger, string> = {
    auto: "bg-neutral-100 text-neutral-600",
    manual_save: "bg-blue-100 text-blue-700",
    ai_edit: "bg-purple-100 text-purple-700",
    checkpoint: "bg-emerald-100 text-emerald-700",
  };
  const labels: Record<typeof trigger, string> = {
    auto: "auto",
    manual_save: "save",
    ai_edit: "AI",
    checkpoint: "✓ checkpoint",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${colors[trigger]}`}>
      {labels[trigger]}
    </span>
  );
}
