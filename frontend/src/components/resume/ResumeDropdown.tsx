// frontend/src/components/resume/ResumeDropdown.tsx
"use client";

import { ChevronDown, FilePlus2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { Resume, ResumeSummary } from "@/lib/resumeApi";

interface Props {
  current: Resume;
  available: ResumeSummary[];
  onNewVariant: () => void;
}

export function ResumeDropdown({ current, available, onNewVariant }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
      >
        {current.title}
        <ChevronDown className="size-3.5 text-neutral-500" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          {available.map((r) => {
            const isCurrent = r.id === current.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!isCurrent) router.push(`/resume/${r.id}`);
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-50 ${
                  isCurrent ? "text-neutral-900" : "text-neutral-700"
                }`}
              >
                <span className="truncate">{r.title}</span>
                {isCurrent && <span className="text-xs text-emerald-600">✓</span>}
              </button>
            );
          })}
          <div className="my-1 border-t border-neutral-100" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNewVariant();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <FilePlus2 className="size-3.5" /> New variant from this
          </button>
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <Upload className="size-3.5" /> Upload another PDF
          </button>
        </div>
      )}
    </div>
  );
}
