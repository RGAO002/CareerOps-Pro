"use client";

import { useAppStore } from "@/stores/app";
import { Sidebar } from "@/components/layout/Sidebar";
import { Assistant } from "@/components/ai/assistant";
import { PreferencesDrawer } from "@/components/layout/PreferencesDrawer";
import { JobListPage } from "./JobListPage";

interface Props { animateIn: boolean; resumeId: string | null; }

export function JobsShell({ animateIn, resumeId }: Props) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);

  return (
    <div className="h-screen overflow-hidden">
      <Sidebar />
      <div
        className="h-full transition-[margin] duration-300"
        style={{
          marginLeft: collapsed ? 64 : 224,
          transitionTimingFunction: "var(--ease-out-expo)",
          position: "relative",
        }}
      >
        <JobListPage animateIn={animateIn} resumeId={resumeId} />
      </div>
      <Assistant />
      <PreferencesDrawer />
    </div>
  );
}
