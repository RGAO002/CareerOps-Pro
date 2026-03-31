"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app";
import { FluidCanvas } from "@/components/landing/FluidCanvas";

/* ─── Mock responses ──────────────────────────────────────────── */
const MOCK_RESPONSES: Record<string, string> = {
  "Why is my score 87 and not higher?":
    "Your resume is genuinely strong — 87 puts you in the top quartile of what we see.\n\nThe main gaps: Python and AWS don't appear in your skills section, but show up in 80% of your saved jobs. Adding those two alone could push you to 93+.\n\nThe other drag is two experience bullets without metrics. Recruiters skim, and numbers catch the eye.",
  "Help me rewrite my weakest bullet":
    "Let's look at your Snapbrillia bullet #3. Right now it reads: \"Worked on developing backend APIs for the platform.\"\n\nHere's a stronger version:\n\"Designed and shipped 12 REST APIs in Node.js, cutting average response time by 40% and unblocking the mobile team to ship 2 weeks early.\"\n\nThe formula: verb + scope + metric + impact on someone else. Share the original and I'll rewrite it directly.",
  "Which jobs should I apply to first?":
    "Based on your background, I'd prioritize:\n\n1. Google Senior PM (94% match) — your product sense is clear, and Google's H1B rate is 94%. Apply this week.\n\n2. Meta SWE II (89%) — strong IC track fits. The role closes in 12 days.\n\n3. Hold on Stripe Staff Eng for now — 'Staff' typically wants 7+ years of direct leadership, and your summary doesn't position you there yet.\n\nWant me to tailor your resume for Google first?",
  "What's missing from my resume?":
    "Three things stand out:\n\n1. Skills gap — Python, AWS, CI/CD appear in 80% of your saved JDs but aren't listed anywhere.\n\n2. Two un-quantified bullets — your Snapbrillia and freelance roles have strong work behind them but the framing is vague. Numbers make recruiters stop scrolling.\n\n3. No summary narrative — your career path has a clear through-line but the summary doesn't tell it. A two-sentence arc would tie everything together.",
};

const SUGGESTIONS = [
  "Why is my score 87 and not higher?",
  "Help me rewrite my weakest bullet",
  "Which jobs should I apply to first?",
  "What's missing from my resume?",
];

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
}

/* ─── Animation helpers ───────────────────────────────────────── */
const panelSpring = { type: "spring" as const, stiffness: 380, damping: 40 };
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const, delay } },
});

/* ─── Colors — transparent surfaces over FluidCanvas ────────────  */
const C = {
  bg:          "transparent",
  surface:     "oklch(0.08 0.020 34 / 0.55)",
  surface2:    "oklch(0.12 0.022 34 / 0.65)",
  border:      "oklch(0.55 0.015 40 / 0.18)",
  border2:     "oklch(0.60 0.018 40 / 0.22)",
  accent:      "oklch(0.72 0.13 38)",
  accentMuted: "oklch(0.72 0.13 38 / 0.18)",
  accentWarm:  "oklch(0.78 0.12 42)",
  textPrimary: "oklch(0.93 0.010 55)",
  textBody:    "oklch(0.78 0.010 52)",
  textMuted:   "oklch(0.55 0.008 50)",
  textDim:     "oklch(0.38 0.006 50)",
  backdrop:    "oklch(0.07 0.015 35 / 0.40)",
};

/* ─── Component ───────────────────────────────────────────────── */
export function AIChatPanel() {
  const open   = useAppStore((s) => s.aiPanelOpen);
  const toggle = useAppStore((s) => s.toggleAiPanel);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [typing, setTyping]     = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const areaRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 380);
  }, [open]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;

    setMessages((p) => [...p, { id: `u-${Date.now()}`, role: "user", content: t }]);
    setInput("");
    if (areaRef.current) areaRef.current.style.height = "auto";
    setTyping(true);

    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 700));

    setTyping(false);
    setMessages((p) => [
      ...p,
      {
        id: `a-${Date.now()}`,
        role: "ai",
        content:
          MOCK_RESPONSES[t] ??
          "That's a good question. Based on your resume and saved jobs, I can see a pattern worth discussing. Your experience tells a strong story — the framing just doesn't match current JD language. Want me to show you specific examples from your resume?",
      },
    ]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="ai-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-30"
            style={{ background: C.backdrop }}
            onClick={toggle}
          />

          {/* Panel */}
          <motion.aside
            key="ai-panel"
            initial={{ x: 380 }}
            animate={{ x: 0 }}
            exit={{ x: 380 }}
            transition={panelSpring}
            className="fixed right-0 z-40 flex flex-col overflow-hidden"
            style={{
              top: 56,
              bottom: 0,
              width: 368,
              borderLeft: "1px solid oklch(0.65 0.015 40 / 0.15)",
            }}
          >
            {/* ── Animated background ── */}
            <FluidCanvas className="absolute inset-0 z-0" forceAnimate />

            {/* ── Dark scrim so text is readable ── */}
            <div
              className="absolute inset-0 z-0"
              style={{ background: "oklch(0.06 0.018 34 / 0.30)" }}
            />

            {/* ── Header ── */}
            <div
              className="relative z-10 flex shrink-0 items-center justify-between px-5 py-4"
              style={{ borderBottom: `1px solid ${C.border}` }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex size-6 items-center justify-center rounded-lg"
                  style={{ background: C.accentMuted }}
                >
                  <Sparkles className="size-3.5" style={{ color: C.accentWarm }} strokeWidth={1.5} />
                </div>
                <span className="text-[13px] font-semibold tracking-tight" style={{ color: C.textPrimary }}>
                  AI Advisor
                </span>
              </div>

              <button
                onClick={toggle}
                className="flex size-7 items-center justify-center rounded-lg transition-colors duration-150"
                style={{ color: C.textMuted }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.textBody)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.textMuted)}
              >
                <X className="size-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* ── Messages / Empty state ── */}
            <div
              className="relative z-10 flex-1 overflow-y-auto px-5 py-5 space-y-5"
              style={{ scrollbarWidth: "none" }}
            >
              {messages.length === 0 ? (
                /* Empty state */
                <div className="space-y-7 pt-2">
                  <motion.div {...fadeUp(0.12)}>
                    <p
                      className="font-[family-name:var(--font-display)] text-[1.35rem] leading-snug tracking-tight"
                      style={{ color: C.textPrimary }}
                    >
                      What's on your mind?
                    </p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: C.textMuted }}>
                      Ask anything about your resume, jobs, or next steps.
                    </p>
                  </motion.div>

                  <div className="space-y-2">
                    {SUGGESTIONS.map((s, i) => (
                      <motion.button
                        key={s}
                        {...fadeUp(0.18 + i * 0.07)}
                        onClick={() => send(s)}
                        className="group flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-all duration-200"
                        style={{ background: C.surface, border: `1px solid ${C.border}` }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = C.surface2;
                          e.currentTarget.style.borderColor = "oklch(0.62 0.12 32 / 0.28)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = C.surface;
                          e.currentTarget.style.borderColor = C.border;
                        }}
                      >
                        <span className="text-[12.5px] leading-snug" style={{ color: C.textBody }}>
                          {s}
                        </span>
                        <ArrowRight
                          className="size-3.5 ml-3 shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                          style={{ color: C.accent }}
                          strokeWidth={1.5}
                        />
                      </motion.button>
                    ))}
                  </div>

                  {/* Subtle context hint */}
                  <motion.p {...fadeUp(0.55)} className="text-[11px]" style={{ color: C.textDim }}>
                    Context: your resume · 3 agents · 3 saved jobs
                  </motion.p>
                </div>
              ) : (
                /* Thread */
                <>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                      className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
                    >
                      {msg.role === "ai" && (
                        <div className="flex max-w-[90%] gap-2.5">
                          {/* Terracotta dot */}
                          <div
                            className="mt-[0.45em] size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: C.accent }}
                          />
                          <p
                            className="text-[13px] leading-[1.65] whitespace-pre-line"
                            style={{ color: C.textBody }}
                          >
                            {msg.content}
                          </p>
                        </div>
                      )}

                      {msg.role === "user" && (
                        <div
                          className="max-w-[82%] rounded-2xl rounded-br-[4px] px-4 py-2.5"
                          style={{ background: C.surface2, border: `1px solid ${C.border2}` }}
                        >
                          <p
                            className="text-[13px] leading-relaxed"
                            style={{ color: "oklch(0.82 0.012 52)" }}
                          >
                            {msg.content}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ))}

                  {/* Typing indicator */}
                  <AnimatePresence>
                    {typing && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center gap-2.5"
                      >
                        <div
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: C.accent }}
                        />
                        <div className="flex items-center gap-1 h-4">
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              className="typing-dot inline-block size-1.5 rounded-full"
                              style={{
                                backgroundColor: C.textMuted,
                                animationDelay: `${i * 0.18}s`,
                              }}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
              <div ref={bottomRef} />
            </div>

            {/* ── Input ── */}
            <div
              className="relative z-10 shrink-0 px-4 pb-4 pt-3"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <div
                className="flex items-end gap-2 rounded-xl px-4 py-3"
                style={{ background: C.surface, border: `1px solid ${C.border}` }}
                onClick={() => inputRef.current?.focus()}
              >
                <textarea
                  ref={(el) => {
                    (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
                    (areaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
                  }}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = "auto";
                    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
                  }}
                  placeholder="Ask anything..."
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none"
                  style={{
                    color: C.textBody,
                    caretColor: C.accentWarm,
                    overflowY: "auto",
                    scrollbarWidth: "none",
                  }}
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || typing}
                  className="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200"
                  style={{
                    background: input.trim() && !typing ? C.accent : C.surface2,
                    color: input.trim() && !typing ? "oklch(0.99 0.003 70)" : C.textMuted,
                  }}
                >
                  <Send className="size-3.5" strokeWidth={2} />
                </button>
              </div>

              <p className="mt-2 text-center text-[10.5px]" style={{ color: C.textDim }}>
                Recruiter · Hiring Manager · Career Coach
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
