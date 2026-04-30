// frontend/src/components/resume/ImportBanner.tsx
"use client";

import { X } from "lucide-react";

interface Props {
  onDismiss: () => void;
}

export function ImportBanner({ onDismiss }: Props) {
  return (
    <div className="sticky top-14 z-20 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">
      <span className="text-base">📥</span>
      <span className="flex-1">
        Just imported — please review for parse errors. Names, dates, and bullet structure
        may need light cleanup.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 hover:bg-amber-100"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
