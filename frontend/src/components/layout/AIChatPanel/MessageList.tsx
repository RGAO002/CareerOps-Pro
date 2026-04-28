// frontend/src/components/layout/AIChatPanel/MessageList.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useConversationStore } from "@/stores/conversation";
import { C } from "./colors";

interface Props {
  /** "compact" shows only the last 2 messages; "full" shows everything. */
  variant: "compact" | "full";
  /** Whether the AI is currently composing a reply (typing indicator). */
  typing?: boolean;
}

export function MessageList({ variant, typing = false }: Props) {
  const messages = useConversationStore((s) => s.messages);
  // Compact and full both render the entire conversation; the container's
  // h-full + overflow-y-auto lets the user scroll through history.
  // Auto-scroll on new messages keeps the newest reply visible by default.
  const visible  = messages;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  if (visible.length === 0 && !typing) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-[12px]" style={{ color: C.textDim }}>
          Ask anything about your job search.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 overflow-y-auto px-4",
        variant === "compact" ? "py-2" : "py-4",
      )}
      style={{ scrollbarWidth: "none" }}
    >
      {visible.map((msg) => (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
        >
          {msg.role === "ai" && (
            <div className="flex max-w-[88%] gap-2.5">
              <div
                className="mt-[0.45em] size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: C.accent }}
              />
              <div className="flex flex-col items-start">
                <p
                  className="text-[13px] leading-[1.65] whitespace-pre-line"
                  style={{ color: C.textBody }}
                >
                  {msg.content}
                </p>
                {msg.action && (
                  <button
                    type="button"
                    onClick={msg.action.onClick}
                    style={{
                      marginTop: 6,
                      padding: "3px 8px",
                      background: "#d49b5e",
                      color: "#2a1f12",
                      border: "none",
                      borderRadius: 3,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {msg.action.label}
                  </button>
                )}
              </div>
            </div>
          )}

          {msg.role === "user" && (
            <div
              className="max-w-[80%] rounded-2xl rounded-br-[4px] px-3.5 py-2"
              style={{ background: C.surface2, border: `1px solid ${C.innerBorder}` }}
            >
              <p className="text-[13px] leading-relaxed" style={{ color: C.userBubble }}>
                {msg.content}
              </p>
            </div>
          )}
        </motion.div>
      ))}

      <AnimatePresence>
        {typing && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.28 }}
            className="flex items-center gap-2.5"
          >
            <div
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: C.accent }}
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
        )}
      </AnimatePresence>

      <div ref={bottomRef} />
    </div>
  );
}
