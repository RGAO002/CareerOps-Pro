"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app";
import { AIChatPanel } from "./AIChatPanel";
import { PreferencesDrawer } from "./PreferencesDrawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed  = useAppStore((s) => s.sidebarCollapsed);
  const aiOpen     = useAppStore((s) => s.aiPanelOpen);
  const toggleAi   = useAppStore((s) => s.toggleAiPanel);

  return (
    <div className="min-h-screen">
      <Sidebar />

      {/* Main content — shifts left when AI panel opens */}
      <div
        className={cn("transition-[margin] duration-300")}
        style={{
          marginLeft: collapsed ? 64 : 224,
          marginRight: aiOpen ? 368 : 0,
          transitionTimingFunction: "var(--ease-out-expo)",
        }}
      >
        <TopBar />
        <main className="mx-auto max-w-5xl px-8 py-10">{children}</main>
      </div>

      {/* AI panel */}
      <AIChatPanel />

      {/* Preferences drawer */}
      <PreferencesDrawer />

      {/* Trigger tab — only visible when panel is closed */}
      <AnimatePresence>
        {!aiOpen && (
          <motion.button
            key="ai-trigger"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={toggleAi}
            className="group fixed z-20 flex flex-col items-center gap-1.5 py-3.5 px-[7px] rounded-l-xl transition-all duration-200"
            style={{
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              background: "oklch(0.13 0.025 34 / 0.92)",
              border: "1px solid oklch(0.28 0.018 35 / 0.4)",
              borderRight: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "oklch(0.18 0.028 34 / 0.95)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "oklch(0.13 0.025 34 / 0.92)";
            }}
          >
            <Sparkles
              className="size-3.5 transition-colors duration-200"
              style={{ color: "oklch(0.60 0.11 38)" }}
              strokeWidth={1.5}
            />
            {/* Vertical "AI" text */}
            <span
              className="text-[9px] font-bold tracking-[0.18em] uppercase transition-colors duration-200"
              style={{
                color: "oklch(0.42 0.01 50)",
                writingMode: "vertical-rl",
                letterSpacing: "0.15em",
              }}
            >
              AI
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
