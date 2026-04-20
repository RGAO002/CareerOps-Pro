// frontend/src/components/layout/AIChatPanel/MessageInput.tsx
"use client";

import { Send } from "lucide-react";
import { useRef } from "react";
import { C } from "./colors";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** When true, Cmd/Ctrl+Enter sends and forces panel to expanded. */
  onSendAndExpand?: () => void;
  /** Fired when the textarea gains focus. */
  onFocus?: () => void;
  /** Fired when the textarea loses focus. */
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** "compact" → pill input, "full" → larger input with Send button. */
  size?: "compact" | "full";
}

export function MessageInput({
  value,
  onChange,
  onSend,
  onSendAndExpand,
  onFocus,
  onBlur,
  disabled = false,
  placeholder = "Ask anything...",
  size = "compact",
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const isFull = size === "full";

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if ((e.metaKey || e.ctrlKey) && onSendAndExpand) {
        e.preventDefault();
        onSendAndExpand();
        return;
      }
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div
      className="flex items-end gap-2 rounded-xl px-3.5 py-2.5"
      style={{ background: C.surface, border: `1px solid ${C.innerBorder}` }}
      onClick={() => ref.current?.focus()}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        onFocus={onFocus}
        onBlur={onBlur}
        onInput={(e) => {
          const t = e.currentTarget;
          t.style.height = "auto";
          t.style.height = `${Math.min(t.scrollHeight, isFull ? 160 : 80)}px`;
        }}
        rows={1}
        placeholder={placeholder}
        className="flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none"
        style={{
          color: C.textBody,
          caretColor: C.accentWarm,
          overflowY: "auto",
          scrollbarWidth: "none",
        }}
      />

      {isFull ? (
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200"
          style={{
            background: !disabled && value.trim() ? C.accent : C.surface2,
            color: !disabled && value.trim() ? C.sendActiveText : C.textMuted,
          }}
        >
          <Send className="size-3.5" strokeWidth={2} />
        </button>
      ) : (
        <span
          className="mb-1 shrink-0 rounded px-1.5 py-0.5 text-[9px]"
          style={{
            color: C.textMuted,
            border: `1px solid ${C.innerBorder}`,
            background: C.badgeBg,
          }}
        >
          ⌘J
        </span>
      )}
    </div>
  );
}
