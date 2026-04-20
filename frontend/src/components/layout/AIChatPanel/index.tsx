// frontend/src/components/layout/AIChatPanel/index.tsx
"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useAiPanelStore, type AiPanelState } from "@/stores/aiPanel";
import { useConversationStore } from "@/stores/conversation";
import { FluidCanvas } from "@/components/landing/FluidCanvas";
import { PanelCollapsed } from "./PanelCollapsed";
import { PanelCompact }   from "./PanelCompact";
import { PanelExpanded }  from "./PanelExpanded";
import { C } from "./colors";

/* ─── Mock responses (re-used from old panel) ──────────────── */
const MOCK_RESPONSES: Record<string, string> = {
  "Why is my score 87 and not higher?":
    "Your resume is genuinely strong — 87 puts you in the top quartile of what we see.\n\nThe main gaps: Python and AWS don't appear in your skills section, but show up in 80% of your saved jobs.",
  "Help me rewrite my weakest bullet":
    "Let's look at your Snapbrillia bullet #3. Right now it reads: \"Worked on developing backend APIs for the platform.\"\n\nHere's a stronger version:\n\"Designed and shipped 12 REST APIs in Node.js, cutting average response time by 40%.\"",
};

const HEIGHT_MAP: Record<AiPanelState, string> = {
  collapsed: "44px",
  compact:   "340px",
  expanded:  "88vh",
};

// Each state has its own width so it doesn't span the full viewport.
// Collapsed = slim pill, Compact = floating card, Expanded = wide card with side margins.
const WIDTH_MAP: Record<AiPanelState, string> = {
  collapsed: "min(360px, calc(100vw - 32px))",
  compact:   "min(560px, calc(100vw - 32px))",
  expanded:  "min(880px, calc(100vw - 48px))",
};

// Snappier spring with slight overshoot — feels more responsive / "tech"
const panelSpring = { type: "spring" as const, stiffness: 460, damping: 32, mass: 0.85 };

export function AIChatPanel() {
  const state    = useAiPanelStore((s) => s.state);
  const setState = useAiPanelStore((s) => s.setState);
  const collapse = useAiPanelStore((s) => s.collapse);
  const expandOne = useAiPanelStore((s) => s.expandOne);

  const appendMessage = useConversationStore((s) => s.appendMessage);

  const [input, setInput]   = useState("");
  const [typing, setTyping] = useState(false);

  /* ── Send + mock reply ────────────────────────────────────── */
  const send = useCallback(async (forceExpand = false) => {
    const text = input.trim();
    if (!text || typing) return;

    appendMessage({ role: "user", content: text });
    setInput("");
    if (forceExpand) setState("expanded");
    setTyping(true);

    await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));

    setTyping(false);
    appendMessage({
      role: "ai",
      content: MOCK_RESPONSES[text] ??
        "That's a good question. Based on your resume and saved jobs, I see a pattern worth discussing.",
    });
  }, [input, typing, appendMessage, setState]);

  /* ── Keyboard shortcuts ───────────────────────────────────── */
  useEffect(() => {
    const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // ⌘J — toggle up
      if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        expandOne();
        return;
      }
      // ⌘↑ — force expand
      if (mod && e.key === "ArrowUp") {
        e.preventDefault();
        setState("expanded");
        return;
      }
      // ⌘↓ — collapse one
      if (mod && e.key === "ArrowDown") {
        e.preventDefault();
        collapse();
        return;
      }
      if (e.key === "Escape") {
        // Read store directly to avoid stale closure / re-running the effect on every state change.
        // Only intercept Esc (preventDefault) when the panel is open — otherwise let it bubble
        // so other handlers (modals, dialogs) can use it.
        const current = useAiPanelStore.getState().state;
        if (current !== "collapsed") {
          e.preventDefault();
          collapse();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapse, expandOne, setState]);

  return (
    <motion.aside
      role="complementary"
      aria-label="AI assistant"
      className="fixed left-1/2 z-40 overflow-hidden rounded-2xl"
      style={{
        bottom: 16,
        transform: "translateX(-50%)",
        // Collapsed shows a static colorful gradient (echoes the shader palette);
        // larger states use the dark base so FluidCanvas provides the color.
        background: state === "collapsed" ? C.panelBgStatic : C.panelBg,
        backdropFilter: C.panelBlur,
        WebkitBackdropFilter: C.panelBlur,
        border: C.border,
        boxShadow: state === "expanded" ? C.shadowUpBig : C.shadowUp,
      }}
      animate={{
        height: HEIGHT_MAP[state],
        width:  WIDTH_MAP[state],
      }}
      transition={panelSpring}
    >
      {/* Animated fluid shader background (same as landing hero).
          Skipped in collapsed state — at 44px tall the extreme aspect ratio
          distorts the shader into visible noise artifacts. */}
      {state !== "collapsed" && (
        <FluidCanvas className="absolute inset-0 z-0" forceAnimate speed={3} />
      )}
      {/* Light scrim for text legibility — kept low so the fluid colors stay visible */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: "oklch(0.07 0.015 35 / 0.28)" }}
      />

      {/* Tech-feel scan line on top edge during AI processing */}
      {typing && (
        <div
          aria-hidden
          className="absolute left-0 right-0 top-0 h-[1px] overflow-hidden pointer-events-none z-50"
        >
          <div className="ai-scanline absolute inset-y-0 w-1/3" />
        </div>
      )}

      {/* Panel content — above the shader + scrim */}
      <div className="relative z-10 h-full w-full">
        {state === "collapsed" && <PanelCollapsed />}
        {state === "compact" && (
          <PanelCompact
            input={input}
            setInput={setInput}
            onSend={() => send(false)}
            typing={typing}
          />
        )}
        {state === "expanded" && (
          <PanelExpanded
            input={input}
            setInput={setInput}
            onSend={() => send(false)}
            typing={typing}
          />
        )}
      </div>
    </motion.aside>
  );
}
