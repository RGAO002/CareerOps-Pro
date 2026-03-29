"use client";

import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div
        className={cn(
          "transition-[margin-left] duration-300",
          collapsed ? "ml-16" : "ml-56",
        )}
        style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
      >
        <TopBar />
        <main className="mx-auto max-w-5xl px-8 py-10">{children}</main>
      </div>
    </div>
  );
}
