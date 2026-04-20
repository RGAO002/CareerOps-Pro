// frontend/src/components/layout/AIChatPanel/PanelCompact.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Maximize2 } from "lucide-react";
import { useAiPanelStore } from "@/stores/aiPanel";
import { useConversationStore } from "@/stores/conversation";
import { MessageInput } from "./MessageInput";
import { ModeIndicator } from "./ModeIndicator";
import { C } from "./colors";

interface Props {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onSendAndExpand: () => void;
  typing: boolean;
}

export function PanelCompact({ input, setInput, onSend, onSendAndExpand, typing }: Props) {
  const setState = useAiPanelStore((s) => s.setState);
  const messages = useConversationStore((s) => s.messages);

  // Show only the latest AI message in compact mode (last reply, line-clamped)
  const latestAi = [...messages].reverse().find((m) => m.role === "ai") ?? null;

  return (
    <div className="flex h-[130px] w-full flex-col">
      {/* Header (28px) */}
      <div
        className="flex h-[28px] shrink-0 items-center gap-2 px-4"
        style={{ borderBottom: `1px solid ${C.innerBorder}` }}
      >
        <ModeIndicator />
        <span
          className="rounded px-1.5 py-0.5 text-[9px] shrink-0"
          style={{
            color: C.textMuted,
            border: `1px solid ${C.innerBorder}`,
            background: C.badgeBg,
          }}
        >
          ⌘↑ expand
        </span>
        <button
          type="button"
          aria-label="Expand"
          onClick={() => setState("expanded")}
          className="flex size-6 shrink-0 items-center justify-center rounded transition-colors"
          style={{ color: C.textMuted }}
        >
          <Maximize2 className="size-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label="Collapse"
          onClick={() => setState("collapsed")}
          className="flex size-6 shrink-0 items-center justify-center rounded transition-colors"
          style={{ color: C.textMuted }}
        >
          <ChevronDown className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Latest AI reply preview (~58px) — single most-recent assistant message,
          line-clamped to 3 lines. Click to expand to full conversation. */}
      <button
        type="button"
        onClick={() => setState("expanded")}
        className="group relative flex min-h-0 flex-1 items-start gap-2.5 overflow-hidden px-4 py-2 text-left transition-colors"
        aria-label="Expand to read full conversation"
        style={{ background: "transparent" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {typing ? (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2.5 self-center"
            >
              <div
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: C.accent, boxShadow: `0 0 8px ${C.accent}` }}
              />
              <div className="flex h-4 items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="typing-dot inline-block size-1.5 rounded-full"
                    style={{ backgroundColor: C.textMuted, animationDelay: `${i * 0.18}s` }}
                  />
                ))}
              </div>
            </motion.div>
          ) : latestAi ? (
            <motion.div
              key={latestAi.id}
              initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="flex w-full items-start gap-2.5"
            >
              <div
                className="ai-pulse mt-[0.45em] size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: C.accent }}
              />
              <p
                className="line-clamp-3 text-[12.5px] leading-[1.5]"
                style={{ color: C.textBody }}
              >
                {latestAi.content}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex w-full items-center justify-start"
            >
              <p className="text-[11.5px]" style={{ color: C.textDim }}>
                Ask me anything about your resume, jobs, or what's next.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Input (~44px) */}
      <div className="shrink-0 px-3 pb-3 pt-1">
        <MessageInput
          value={input}
          onChange={setInput}
          onSend={onSend}
          onSendAndExpand={onSendAndExpand}
          disabled={typing}
          size="compact"
        />
      </div>
    </div>
  );
}
