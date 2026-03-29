"use client";

import { usePathname } from "next/navigation";
import { useAppStore } from "@/stores/app";

const pageLabels: Record<string, string> = {
  "/": "Home",
  "/analysis": "Analysis",
  "/editor": "Editor",
  "/cover-letter": "Cover Letter",
  "/interview": "Interview",
  "/tracker": "Tracker",
  "/insights": "Insights",
  "/settings": "Settings",
};

export function TopBar() {
  const pathname = usePathname();
  const modelChoice = useAppStore((s) => s.modelChoice);
  const apiKeys = useAppStore((s) => s.apiKeys);
  const label = pageLabels[pathname] ?? "Home";

  const hasKey =
    apiKeys.openai || apiKeys.google || apiKeys.anthropic;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-8 backdrop-blur-md">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-foreground/30 font-medium">CareerOps</span>
        <span className="text-foreground/20">/</span>
        <span className="font-semibold text-foreground">{label}</span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-4 text-[12px]">
        <span className="rounded-md bg-secondary px-2.5 py-1 font-mono font-medium text-secondary-foreground uppercase tracking-wide">
          {modelChoice}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-1.5 rounded-full"
            style={{
              backgroundColor: hasKey
                ? "oklch(0.60 0.14 150)"
                : "oklch(0.60 0.18 25)",
            }}
          />
          <span className="text-muted-foreground">
            {hasKey ? "Ready" : "No key"}
          </span>
        </span>
      </div>
    </header>
  );
}
