// frontend/src/components/layout/AIChatPanel/index.tsx
"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useAiPanelStore, type AiPanelState } from "@/stores/aiPanel";
import { useConversationStore } from "@/stores/conversation";
import { usePageContextStore } from "@/stores/pageContext";
import { useAISidebarUIStore } from "@/stores/aiSidebarUI";
import { useResumeStore } from "@/components/resume/v2/store/useResumeStore";
import { selectionManager } from "@/components/resume/v2/interaction/SelectionManager";
import { runSSEStream } from "@/components/ai/AISessionClient";
import { FluidCanvas } from "@/components/landing/FluidCanvas";
import { PanelCollapsed } from "./PanelCollapsed";
import { PanelCompact }   from "./PanelCompact";
import { PanelExpanded }  from "./PanelExpanded";
import { C } from "./colors";

// FastAPI backend default; override via NEXT_PUBLIC_API_BASE.
const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) ||
  'http://localhost:8000';

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

  /* ── Send → POST /api/ai/run + open SSE stream ────────────── */
  const send = useCallback(async (forceExpand = false) => {
    const text = input.trim();
    if (!text || typing) return;

    appendMessage({ role: "user", content: text });
    setInput("");
    if (forceExpand) setState("expanded");

    // Guard: AI is gated to the resume editor page (Task 21 spec).
    const ctx = usePageContextStore.getState().context;
    const resume = useResumeStore.getState().resume;
    if (!ctx || ctx.page !== "resume_editor" || !resume) {
      appendMessage({ role: "ai", content: "AI 仅在简历编辑页可用。" });
      return;
    }

    // Selection comes from the v2 SelectionManager (vanilla class, not zustand).
    const selection = selectionManager.getBlocks();

    // Last 10 turns of chat history. Map our internal "ai" role to the API's
    // expected "assistant" role.
    const chatHistory = useConversationStore
      .getState()
      .messages
      .filter((m) => m.role === "user" || m.role === "ai")
      .slice(-10)
      .map((m) => ({
        role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

    // Optimistic ack — confirms the request was received before the run starts.
    appendMessage({ role: "ai", content: "好的，正在处理…" });
    setTyping(true);

    let runId: string;
    try {
      const r = await fetch(`${API_BASE}/api/ai/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: resume.id,
          userInput: text,
          selection,
          chatHistory,
        }),
      });
      if (!r.ok) throw new Error(`/api/ai/run returned ${r.status}`);
      const json = await r.json();
      runId = json.runId;
    } catch (err) {
      setTyping(false);
      appendMessage({ role: "ai", content: `AI 调用失败：${String(err)}` });
      return;
    }

    // Live tail of orchestrator events. Narrations append as separate
    // assistant messages; on run.completed we render the "view in sidebar"
    // button only if there are suggestions to review.
    runSSEStream(runId, {
      onNarration: (narrationText, agentId) => {
        appendMessage({
          role: "ai",
          content: `${agentId}: ${narrationText}`,
        });
      },
      onCompleted: (_rid, suggestionIds) => {
        setTyping(false);
        if (!suggestionIds || suggestionIds.length === 0) return;
        appendMessage({
          role: "ai",
          content: `提议了 ${suggestionIds.length} 处改动。`,
          action: {
            label: "📋 查看详情",
            onClick: () => useAISidebarUIStore.getState().open(),
          },
        });
      },
      onError: (err) => {
        setTyping(false);
        appendMessage({ role: "ai", content: `SSE 错误：${String(err)}` });
      },
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
        // Collapsed stacks 3 layers for a full-body liquid-glass look:
        //   (1) top specular spotlight (ellipse at top-center, bright fall-off)
        //   (2) vertical sheen (bright top → transparent mid → dark bottom)
        //   (3) the static 3-stop color gradient underneath
        // Larger states use the dark base + WebGL shader for color.
        background: state === "collapsed"
          ? `
              radial-gradient(ellipse 110% 90% at 50% -12%, oklch(0.99 0.005 60 / 0.22), transparent 58%),
              linear-gradient(180deg, oklch(0.99 0.005 60 / 0.10) 0%, transparent 38%, transparent 62%, rgba(0,0,0,0.15) 100%),
              ${C.panelBgStatic}
            `.trim()
          : C.panelBg,
        backdropFilter: state === "collapsed"
          ? "blur(14px) saturate(1.65) brightness(1.06)"
          : C.panelBlur,
        WebkitBackdropFilter: state === "collapsed"
          ? "blur(14px) saturate(1.65) brightness(1.06)"
          : C.panelBlur,
        border: C.border,
        boxShadow: [
          state === "expanded" ? C.shadowUpBig : C.shadowUp,
          state === "collapsed"
            ? "inset 0 1px 0 oklch(0.99 0.005 60 / 0.22)"
            : "inset 0 1.5px 0 oklch(0.99 0.005 60 / 0.30)",
          state === "collapsed"
            ? "inset 0 -1px 0 rgba(0,0,0,0.24)"
            : "inset 0 -1px 0 rgba(0,0,0,0.32)",
          "inset 0 0 0 1px oklch(0.98 0.005 60 / 0.07)",
          ...(state === "collapsed"
            ? [
                "inset 1px 0 1.5px oklch(0.99 0.005 60 / 0.07)",
                "inset -1px 0 1.5px oklch(0.99 0.005 60 / 0.07)",
              ]
            : []),
        ].join(", "),
      }}
      animate={{
        height: HEIGHT_MAP[state],
        width:  WIDTH_MAP[state],
      }}
      transition={panelSpring}
    >
      {/* Compact / Expanded: WebGL fluid shader (works well at normal aspect).
          brightness=1.45 — between landing's 1.0 (too dim) and full 1.8 (too bright). */}
      {state !== "collapsed" && (
        <FluidCanvas className="absolute inset-0 z-0" forceAnimate speed={3} brightness={1.45} />
      )}
      {/* Collapsed: pure-CSS horizontal shimmer sweep — gentle animation
          that behaves correctly at the 44px × 360px extreme aspect ratio,
          where the WebGL shader would produce pixel-sized artifacts. */}
      {state === "collapsed" && (
        <div aria-hidden className="ai-collapsed-sweep z-0" />
      )}
      {/* Light scrim for text legibility — kept low so the fluid colors stay visible */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: "oklch(0.10 0.015 35 / 0.12)" }}
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
