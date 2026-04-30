// frontend/src/components/layout/AppShell.tsx
"use client";

import { useAppStore } from "@/stores/app";
import { Assistant } from "@/components/ai/assistant";
import { PreferencesDrawer } from "./PreferencesDrawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);

  return (
    <div className="min-h-screen">
      <Sidebar />

      {/* Main content — no AI margin shift; AI panel overlays bottom */}
      <div
        className="transition-[margin] duration-300"
        style={{
          marginLeft: collapsed ? 64 : 224,
          transitionTimingFunction: "var(--ease-out-expo)",
        }}
      >
        <TopBar />
        <main className="mx-auto max-w-5xl px-8 py-10 pb-[200px]">
          {children}
        </main>
      </div>

      {/* AI Assistant (morphing bar / sidebar / orb) */}
      <Assistant />

      {/* Preferences drawer */}
      <PreferencesDrawer />
    </div>
  );
}
