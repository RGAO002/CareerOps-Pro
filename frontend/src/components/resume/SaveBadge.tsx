// frontend/src/components/resume/SaveBadge.tsx
"use client";

import { useEffect, useState } from "react";

import { formatRelative } from "@/lib/relativeTime";

type Status = "idle" | "saving" | "saved" | "error" | "offline";

interface Props {
  status: Status;
  lastSavedAt: number | null;
  onRetry?: () => void;
}

export function SaveBadge({ status, lastSavedAt, onRetry }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const dot = (cls: string) => (
    <span className={`mr-1.5 inline-block size-2 rounded-full ${cls}`} aria-hidden />
  );

  const tooltip = lastSavedAt ? new Date(lastSavedAt).toLocaleString() : undefined;

  if (status === "saving") {
    return (
      <span className="flex items-center text-[11px] text-neutral-600">
        {dot("animate-pulse bg-blue-500")}Saving…
      </span>
    );
  }
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center text-[11px] text-red-600 hover:underline"
      >
        {dot("bg-red-500")}Save failed · Retry
      </button>
    );
  }
  if (status === "offline") {
    return (
      <span className="flex items-center text-[11px] text-amber-700" title={tooltip}>
        {dot("bg-amber-500")}Offline · changes kept locally
      </span>
    );
  }
  if (lastSavedAt == null) {
    return null;
  }
  return (
    <span className="flex items-center text-[11px] text-neutral-500" title={tooltip}>
      {dot("bg-emerald-500")}Saved · {formatRelative(lastSavedAt)}
    </span>
  );
}
