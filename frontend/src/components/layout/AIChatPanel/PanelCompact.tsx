// frontend/src/components/layout/AIChatPanel/PanelCompact.tsx
"use client";

import { ChevronDown, Maximize2 } from "lucide-react";
import { useAiPanelStore } from "@/stores/aiPanel";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ModeIndicator } from "./ModeIndicator";
import { C } from "./colors";

interface Props {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onSendAndExpand: () => void;
  typing: boolean;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
}

export function PanelCompact({ input, setInput, onSend, onSendAndExpand, typing, onInputFocus, onInputBlur }: Props) {
  const setState = useAiPanelStore((s) => s.setState);

  return (
    <div className="flex h-full w-full flex-col">
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

      {/* Last 2-3 messages — passive (does NOT expand on click) */}
      <div className="min-h-0 flex-1">
        <MessageList variant="compact" typing={typing} />
      </div>

      {/* Input (~44px) */}
      <div className="shrink-0 px-3 pb-3 pt-1">
        <MessageInput
          value={input}
          onChange={setInput}
          onSend={onSend}
          onSendAndExpand={onSendAndExpand}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          disabled={typing}
          size="compact"
        />
      </div>
    </div>
  );
}
