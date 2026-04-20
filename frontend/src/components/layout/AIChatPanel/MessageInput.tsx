// frontend/src/components/layout/AIChatPanel/MessageInput.tsx
"use client";

import { Send } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { C } from "./colors";
import { modKeyLabel } from "./platform";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** Fired when the textarea gains focus. */
  onFocus?: () => void;
  /** Fired when the textarea loses focus. */
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** "compact" → pill input, "full" → larger input with Send button. */
  size?: "compact" | "full";
  /** Auto-focus the textarea on mount (useful when panel opens). */
  autoFocus?: boolean;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  onFocus,
  onBlur,
  disabled = false,
  placeholder,
  size = "compact",
  autoFocus = false,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const isFull = size === "full";
  const modKey = useMemo(modKeyLabel, []);
  const computedPlaceholder = placeholder ?? `Ask anything... (${modKey}↵ to send)`;

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter = send. Plain Enter and Shift+Enter both insert a newline.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
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
        placeholder={computedPlaceholder}
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
          {modKey}↵
        </span>
      )}
    </div>
  );
}
