"use client";

import { Minimize2, X } from "lucide-react";
import { useAiPanelStore } from "@/stores/aiPanel";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ModeIndicator } from "./ModeIndicator";
import { C } from "./colors";

interface Props {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  typing: boolean;
}

export function PanelExpanded({ input, setInput, onSend, typing }: Props) {
  const setState = useAiPanelStore((s) => s.setState);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div
        className="flex h-[40px] shrink-0 items-center gap-2 px-5"
        style={{ borderBottom: `1px solid ${C.innerBorder}` }}
      >
        <ModeIndicator showSummary />
        <span
          className="rounded px-1.5 py-0.5 text-[9px] shrink-0"
          style={{
            color: C.textMuted,
            border: `1px solid ${C.innerBorder}`,
            background: "oklch(0.18 0.025 34 / 0.4)",
          }}
        >
          Esc collapse
        </span>
        <button
          type="button"
          aria-label="Collapse to compact"
          onClick={() => setState("compact")}
          className="flex size-7 shrink-0 items-center justify-center rounded transition-colors"
          style={{ color: C.textMuted }}
        >
          <Minimize2 className="size-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label="Collapse fully"
          onClick={() => setState("collapsed")}
          className="flex size-7 shrink-0 items-center justify-center rounded transition-colors"
          style={{ color: C.textMuted }}
        >
          <X className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1">
        <MessageList variant="full" typing={typing} />
      </div>

      {/* Input */}
      <div
        className="shrink-0 px-5 pb-4 pt-3"
        style={{ borderTop: `1px solid ${C.innerBorder}` }}
      >
        <MessageInput
          value={input}
          onChange={setInput}
          onSend={onSend}
          disabled={typing}
          size="full"
        />
        <p className="mt-2 text-center text-[10.5px]" style={{ color: C.textDim }}>
          Recruiter · Hiring Manager · Career Coach
        </p>
      </div>
    </div>
  );
}
