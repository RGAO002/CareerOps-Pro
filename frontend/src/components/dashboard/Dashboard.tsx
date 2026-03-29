"use client";

import { useResumeStore } from "@/stores/resume";

export function Dashboard() {
  const filename = useResumeStore((s) => s.pdfFilename);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-foreground">
          Welcome back
        </h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Working on <span className="font-medium text-foreground">{filename}</span>
        </p>
      </div>

      {/* Placeholder for analysis, jobs, etc. */}
      <div className="rounded-2xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground text-[14px]">
          Analysis dashboard coming soon
        </p>
      </div>
    </div>
  );
}
