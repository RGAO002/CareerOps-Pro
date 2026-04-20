# Global AI Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `frontend/src/components/layout/AIChatPanel.tsx` (right-side drawer) into a bottom-anchored 3-state global AI panel (Collapsed 38px / Compact 180px / Expanded 88vh) that overlays content instead of pushing it.

**Architecture:** Three Zustand stores (`aiPanel`, `pageContext`, `conversation`) plus a `usePageContext` hook decouple state from UI. The `AIChatPanel/` directory contains one orchestrator and three height-state sub-components sharing a `MessageList`, `MessageInput`, and `ModeIndicator`. Framer Motion springs animate height transitions. No content-shift in `AppShell` — the panel is `position: fixed` on the viewport bottom and overlays all page content.

**Tech Stack:** Next.js 16, React 19, Zustand 5 (with `persist`), Framer Motion 12, Tailwind 4, Lucide icons. No test framework — verification via `npx tsc --noEmit` and visual inspection in `npm run dev`.

**Reference spec:** `docs/superpowers/specs/2026-04-19-global-ai-panel-design.md`

---

## File Structure

**Created:**
- `frontend/src/stores/aiPanel.ts` — panel state machine (collapsed | compact | expanded)
- `frontend/src/stores/pageContext.ts` — current page's AI context
- `frontend/src/stores/conversation.ts` — message history (persisted to localStorage)
- `frontend/src/hooks/usePageContext.ts` — page-level context registration hook
- `frontend/src/components/layout/AIChatPanel/index.tsx` — orchestrator + keyboard shortcuts
- `frontend/src/components/layout/AIChatPanel/colors.ts` — shared color palette
- `frontend/src/components/layout/AIChatPanel/MessageList.tsx` — message rendering
- `frontend/src/components/layout/AIChatPanel/MessageInput.tsx` — input with auto-grow textarea
- `frontend/src/components/layout/AIChatPanel/ModeIndicator.tsx` — "AI · {mode}" header label
- `frontend/src/components/layout/AIChatPanel/PanelCollapsed.tsx` — 38px state
- `frontend/src/components/layout/AIChatPanel/PanelCompact.tsx` — 180px state
- `frontend/src/components/layout/AIChatPanel/PanelExpanded.tsx` — 88vh state

**Modified:**
- `frontend/src/components/layout/AppShell.tsx` — remove `marginRight` shift + right edge tab; render new panel
- `frontend/src/stores/app.ts` — remove `aiPanelOpen` and `toggleAiPanel` (moved to `aiPanel.ts`)
- `frontend/src/components/dashboard/Dashboard.tsx` — call `usePageContext({ page: "dashboard", summary: "首页总览" })`

**Deleted:**
- `frontend/src/components/layout/AIChatPanel.tsx` — old single-file panel (replaced by directory)

---

## Conventions

- **TypeScript strictness:** Existing repo passes `npx tsc --noEmit`. Every task ends with this command and expects exit code 0.
- **Visual verification:** Use `npm run dev` (port 3000 by default). Manually exercise the UI behavior described in the task.
- **Commit style:** Follow existing repo style (e.g., `Add Multi-LLM Review`, `Refactoring to Next.js`). Use imperative mood, no scope prefix needed.
- **No tests added:** Project has no test framework. If a behavior cannot be visually verified, skip it. Do not add Jest/Vitest in this plan.
- **Color tokens:** All colors come from `AIChatPanel/colors.ts`. Do not hardcode `oklch(...)` strings outside that file.

---

## Task 1: Create `aiPanel` store

**Files:**
- Create: `frontend/src/stores/aiPanel.ts`

- [ ] **Step 1: Write the store**

```ts
// frontend/src/stores/aiPanel.ts
import { create } from "zustand";

export type AiPanelState = "collapsed" | "compact" | "expanded";

interface AiPanelStore {
  state: AiPanelState;

  /** Drop one level: expanded → compact, compact → collapsed. No-op at collapsed. */
  collapse: () => void;
  /** Move up one level: collapsed → compact, compact → expanded. No-op at expanded. */
  expandOne: () => void;
  /** Force a specific state. */
  setState: (s: AiPanelState) => void;
  /** Convenience: jump straight to expanded. */
  forceExpand: () => void;
}

export const useAiPanelStore = create<AiPanelStore>((set) => ({
  state: "compact",

  collapse: () =>
    set((s) => ({
      state:
        s.state === "expanded" ? "compact" :
        s.state === "compact"  ? "collapsed" :
        "collapsed",
    })),

  expandOne: () =>
    set((s) => ({
      state:
        s.state === "collapsed" ? "compact"  :
        s.state === "compact"   ? "expanded" :
        "expanded",
    })),

  setState: (state) => set({ state }),
  forceExpand: () => set({ state: "expanded" }),
}));
```

- [ ] **Step 2: Verify type compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit code 0, no errors mentioning `aiPanel.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
git add frontend/src/stores/aiPanel.ts
git commit -m "Add aiPanel Zustand store for 3-state panel"
```

---

## Task 2: Create `pageContext` store

**Files:**
- Create: `frontend/src/stores/pageContext.ts`

- [ ] **Step 1: Write the store**

```ts
// frontend/src/stores/pageContext.ts
import { create } from "zustand";

export interface PageContext {
  /** Stable identifier for the page (e.g. "resume_editor", "dashboard"). */
  page: string;
  /** Natural-language summary fed into the AI's system prompt. */
  summary: string;
  /** Optional structured payload for tool calls. */
  data?: Record<string, unknown>;
}

interface PageContextStore {
  context: PageContext | null;
  setPageContext: (ctx: PageContext) => void;
  clearPageContext: () => void;
}

export const usePageContextStore = create<PageContextStore>((set) => ({
  context: null,
  setPageContext: (ctx) => set({ context: ctx }),
  clearPageContext: () => set({ context: null }),
}));
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/pageContext.ts
git commit -m "Add pageContext store for per-page AI mode"
```

---

## Task 3: Create `conversation` store with persistence

**Files:**
- Create: `frontend/src/stores/conversation.ts`

- [ ] **Step 1: Write the store**

```ts
// frontend/src/stores/conversation.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  /** Unix ms */
  createdAt: number;
}

interface ConversationStore {
  messages: Message[];
  /** Append a single message, auto-fills id and timestamp. */
  appendMessage: (msg: Omit<Message, "id" | "createdAt">) => void;
  /** Clear the entire conversation. */
  clearConversation: () => void;
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set) => ({
      messages: [],

      appendMessage: (msg) =>
        set((s) => ({
          messages: [
            ...s.messages,
            {
              ...msg,
              id: `${msg.role[0]}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              createdAt: Date.now(),
            },
          ],
        })),

      clearConversation: () => set({ messages: [] }),
    }),
    { name: "careerops-ai-conversation" },
  ),
);
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/conversation.ts
git commit -m "Add persisted conversation store"
```

---

## Task 4: Create `usePageContext` hook

**Files:**
- Create: `frontend/src/hooks/usePageContext.ts`

- [ ] **Step 1: Write the hook**

```ts
// frontend/src/hooks/usePageContext.ts
import { useEffect } from "react";
import { usePageContextStore, type PageContext } from "@/stores/pageContext";

/**
 * Register a page's AI context on mount, clear it on unmount.
 * Call this once per page. The summary feeds into the AI system prompt.
 *
 * Example:
 *   usePageContext({
 *     page: "resume_editor",
 *     summary: `正在编辑「${resume.name}」简历，目标 ${jobTitle ?? "未指定"}`,
 *   });
 */
export function usePageContext(ctx: PageContext) {
  const setPageContext   = usePageContextStore((s) => s.setPageContext);
  const clearPageContext = usePageContextStore((s) => s.clearPageContext);

  useEffect(() => {
    setPageContext(ctx);
    return () => clearPageContext();
    // Re-register if any field of ctx changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.page, ctx.summary, JSON.stringify(ctx.data)]);
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/usePageContext.ts
git commit -m "Add usePageContext hook for per-page AI registration"
```

---

## Task 5: Remove `aiPanelOpen` from `app.ts`

**Files:**
- Modify: `frontend/src/stores/app.ts:7-8,25-27` — remove the two `aiPanelOpen` lines and the `toggleAiPanel` action.

- [ ] **Step 1: Edit `app.ts`**

Replace the entire file contents with:

```ts
// frontend/src/stores/app.ts
import { create } from "zustand";

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  prefsOpen: boolean;
  togglePrefs: () => void;

  modelChoice: string;
  setModelChoice: (m: string) => void;

  apiKeys: { openai: string; google: string; anthropic: string };
  setApiKey: (provider: "openai" | "google" | "anthropic", key: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  prefsOpen: false,
  togglePrefs: () =>
    set((s) => ({ prefsOpen: !s.prefsOpen })),

  modelChoice: "gpt-5.4-mini",
  setModelChoice: (modelChoice) => set({ modelChoice }),

  apiKeys: { openai: "", google: "", anthropic: "" },
  setApiKey: (provider, key) =>
    set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
}));
```

- [ ] **Step 2: Type check (will fail in callers — expected)**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors about `aiPanelOpen` or `toggleAiPanel` in `AppShell.tsx` and existing `AIChatPanel.tsx`. These are fixed in Task 11.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/app.ts
git commit -m "Remove aiPanelOpen from app store (moved to aiPanel store)"
```

---

## Task 6: Create shared color palette

**Files:**
- Create: `frontend/src/components/layout/AIChatPanel/colors.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p /Users/fred/Desktop/CareerOps-Pro/frontend/src/components/layout/AIChatPanel
```

```ts
// frontend/src/components/layout/AIChatPanel/colors.ts
/**
 * Shared color palette for the global AI panel.
 * Dark warm + terracotta accent + backdrop blur.
 * Mirrors the mockup palette validated during brainstorming.
 */
export const C = {
  // Surfaces
  panelBg:     "linear-gradient(180deg, oklch(0.13 0.025 34 / 0.96), oklch(0.10 0.025 35 / 0.98))",
  panelBlur:   "blur(10px)",
  border:      "1px solid oklch(0.28 0.018 35 / 0.5)",

  // Inner surfaces
  surface:     "oklch(0.18 0.025 34 / 0.6)",
  surface2:    "oklch(0.20 0.04 38)",
  surfaceHover:"oklch(0.22 0.03 36 / 0.7)",
  innerBorder: "oklch(0.28 0.018 35 / 0.5)",

  // Accents
  accent:      "oklch(0.72 0.13 38)",       // terracotta
  accentMuted: "oklch(0.72 0.13 38 / 0.18)",
  accentWarm:  "oklch(0.78 0.12 42)",
  brandGrad:   "linear-gradient(135deg, #c5915a, #9d5e3a)",

  // Text
  textPrimary: "oklch(0.93 0.010 55)",
  textBody:    "oklch(0.85 0.020 50)",
  textMuted:   "oklch(0.55 0.020 50)",
  textDim:     "oklch(0.45 0.010 50)",
  userBubble:  "oklch(0.92 0.010 50)",

  // Shadows
  shadowUp:    "0 -8px 24px rgba(0,0,0,0.12)",
  shadowUpBig: "0 -16px 40px rgba(0,0,0,0.20)",
} as const;
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit` (still expects errors from Task 5 in AppShell/old AIChatPanel — those are acceptable until Task 11)
Expected: no NEW errors from `colors.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AIChatPanel/colors.ts
git commit -m "Add shared color palette for AI panel"
```

---

## Task 7: Build `MessageList` component

**Files:**
- Create: `frontend/src/components/layout/AIChatPanel/MessageList.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
  const visible  = variant === "compact" ? messages.slice(-2) : messages;
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
        "flex flex-col gap-3 overflow-y-auto px-4",
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
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors from `MessageList.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AIChatPanel/MessageList.tsx
git commit -m "Add MessageList component (compact + full variants)"
```

---

## Task 8: Build `MessageInput` component

**Files:**
- Create: `frontend/src/components/layout/AIChatPanel/MessageInput.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
            color: !disabled && value.trim() ? "oklch(0.99 0.003 70)" : C.textMuted,
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
            background: "oklch(0.18 0.025 34 / 0.4)",
          }}
        >
          ⌘J
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AIChatPanel/MessageInput.tsx
git commit -m "Add MessageInput component with auto-grow textarea"
```

---

## Task 9: Build `ModeIndicator` component

**Files:**
- Create: `frontend/src/components/layout/AIChatPanel/ModeIndicator.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/AIChatPanel/ModeIndicator.tsx
"use client";

import { usePageContextStore } from "@/stores/pageContext";
import { C } from "./colors";

const MODE_LABELS: Record<string, string> = {
  dashboard:        "Dashboard mode",
  resume_editor:    "Resume Editor mode",
  job_search:       "Job Search mode",
  applications:     "Applications mode",
  mock_interview:   "Interview mode",
  insights:         "Insights mode",
};

interface Props {
  /** When true, also show the secondary context summary (used in Expanded). */
  showSummary?: boolean;
}

export function ModeIndicator({ showSummary = false }: Props) {
  const ctx = usePageContextStore((s) => s.context);
  const label = ctx ? (MODE_LABELS[ctx.page] ?? "Assistant") : "Assistant";

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <div
        className="size-2 shrink-0 rounded-sm"
        style={{ background: C.brandGrad }}
      />
      <span
        className="text-[10px] font-semibold tracking-[0.05em] shrink-0"
        style={{ color: C.textPrimary }}
      >
        AI · {label}
      </span>
      {showSummary && ctx?.summary && (
        <>
          <span className="text-[10px]" style={{ color: C.textMuted }}>·</span>
          <span
            className="text-[10px] truncate"
            style={{ color: C.textMuted }}
            title={ctx.summary}
          >
            {ctx.summary}
          </span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AIChatPanel/ModeIndicator.tsx
git commit -m "Add ModeIndicator reading pageContext"
```

---

## Task 10: Build `PanelCollapsed` (38px bar)

**Files:**
- Create: `frontend/src/components/layout/AIChatPanel/PanelCollapsed.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/AIChatPanel/PanelCollapsed.tsx
"use client";

import { ChevronUp } from "lucide-react";
import { useAiPanelStore } from "@/stores/aiPanel";
import { C } from "./colors";

export function PanelCollapsed() {
  const expandOne = useAiPanelStore((s) => s.expandOne);

  return (
    <button
      type="button"
      onClick={expandOne}
      className="flex w-full items-center gap-3 px-5 text-left"
      style={{ height: 38 }}
    >
      <div
        className="size-2 shrink-0 rounded-sm"
        style={{ background: C.brandGrad }}
      />
      <span
        className="flex-1 text-[12px]"
        style={{ color: C.textMuted }}
      >
        Ask anything about your job search...
      </span>
      <span
        className="rounded px-1.5 py-0.5 text-[9px]"
        style={{
          color: C.textMuted,
          border: `1px solid ${C.innerBorder}`,
          background: "oklch(0.18 0.025 34 / 0.4)",
        }}
      >
        ⌘J
      </span>
      <ChevronUp
        className="size-3.5"
        style={{ color: C.textMuted }}
        strokeWidth={1.8}
      />
    </button>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AIChatPanel/PanelCollapsed.tsx
git commit -m "Add PanelCollapsed (38px bar)"
```

---

## Task 11: Build `PanelCompact` (180px)

**Files:**
- Create: `frontend/src/components/layout/AIChatPanel/PanelCompact.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
}

export function PanelCompact({ input, setInput, onSend, onSendAndExpand, typing }: Props) {
  const setState  = useAiPanelStore((s) => s.setState);

  return (
    <div className="flex h-[180px] w-full flex-col">
      {/* Header */}
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
            background: "oklch(0.18 0.025 34 / 0.4)",
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

      {/* Messages (~110px) */}
      <div className="min-h-0 flex-1">
        <MessageList variant="compact" typing={typing} />
      </div>

      {/* Input (~42px) */}
      <div className="shrink-0 px-3 pb-3 pt-2">
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
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AIChatPanel/PanelCompact.tsx
git commit -m "Add PanelCompact (180px)"
```

---

## Task 12: Build `PanelExpanded` (88vh)

**Files:**
- Create: `frontend/src/components/layout/AIChatPanel/PanelExpanded.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/layout/AIChatPanel/PanelExpanded.tsx
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
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AIChatPanel/PanelExpanded.tsx
git commit -m "Add PanelExpanded (88vh)"
```

---

## Task 13: Build orchestrator `index.tsx` + delete old file

**Files:**
- Create: `frontend/src/components/layout/AIChatPanel/index.tsx`
- Delete: `frontend/src/components/layout/AIChatPanel.tsx`

- [ ] **Step 1: Write the orchestrator**

```tsx
// frontend/src/components/layout/AIChatPanel/index.tsx
"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useAiPanelStore, type AiPanelState } from "@/stores/aiPanel";
import { useConversationStore } from "@/stores/conversation";
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
  collapsed: "38px",
  compact:   "180px",
  expanded:  "88vh",
};

const panelSpring = { type: "spring" as const, stiffness: 380, damping: 38 };

export function AIChatPanel() {
  const state    = useAiPanelStore((s) => s.state);
  const setState = useAiPanelStore((s) => s.setState);
  const collapse = useAiPanelStore((s) => s.collapse);
  const expandOne = useAiPanelStore((s) => s.expandOne);

  const appendMessage = useConversationStore((s) => s.appendMessage);

  const [input, setInput]   = useState("");
  const [typing, setTyping] = useState(false);

  /* ── Send + mock reply ────────────────────────────────────── */
  const send = async (forceExpand = false) => {
    const text = input.trim();
    if (!text) return;

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
  };

  /* ── Keyboard shortcuts ───────────────────────────────────── */
  useEffect(() => {
    const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

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
      // Esc — collapse one (only if panel is at compact or expanded)
      if (e.key === "Escape") {
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
      className="fixed bottom-0 left-0 right-0 z-40 overflow-hidden"
      style={{
        background: C.panelBg,
        backdropFilter: C.panelBlur,
        WebkitBackdropFilter: C.panelBlur,
        borderTop: C.border,
        boxShadow: state === "expanded" ? C.shadowUpBig : C.shadowUp,
      }}
      animate={{ height: HEIGHT_MAP[state] }}
      transition={panelSpring}
    >
      {state === "collapsed" && <PanelCollapsed />}
      {state === "compact" && (
        <PanelCompact
          input={input}
          setInput={setInput}
          onSend={() => send(false)}
          onSendAndExpand={() => send(true)}
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
    </motion.aside>
  );
}
```

- [ ] **Step 2: Delete old single-file panel**

```bash
rm /Users/fred/Desktop/CareerOps-Pro/frontend/src/components/layout/AIChatPanel.tsx
```

- [ ] **Step 3: Type-check (still expects errors in AppShell — fixed in Task 14)**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors only in `AppShell.tsx` (about `aiPanelOpen`, `toggleAiPanel`). No errors inside `AIChatPanel/`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AIChatPanel/index.tsx
git rm frontend/src/components/layout/AIChatPanel.tsx
git commit -m "Replace right-side AIChatPanel with bottom 3-state panel"
```

---

## Task 14: Update `AppShell.tsx`

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx` — replace entire file.

- [ ] **Step 1: Replace the file**

Write the full new contents:

```tsx
// frontend/src/components/layout/AppShell.tsx
"use client";

import { useAppStore } from "@/stores/app";
import { AIChatPanel } from "./AIChatPanel";
import { PreferencesDrawer } from "./PreferencesDrawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);

  return (
    <div className="min-h-screen">
      <Sidebar />

      {/* Main content — no AI margin shift; AI panel overlays bottom */}
      <div
        className="transition-[margin] duration-300"
        style={{
          marginLeft: collapsed ? 64 : 224,
          transitionTimingFunction: "var(--ease-out-expo)",
        }}
      >
        <TopBar />
        <main className="mx-auto max-w-5xl px-8 py-10 pb-[200px]">
          {children}
        </main>
      </div>

      {/* Bottom-anchored AI panel (3 heights: 38 / 180 / 88vh) */}
      <AIChatPanel />

      {/* Preferences drawer */}
      <PreferencesDrawer />
    </div>
  );
}
```

Key changes from the old version:
- Removed `aiOpen`, `toggleAi` reads
- Removed `marginRight: aiOpen ? 368 : 0`
- Removed the right-edge trigger button entirely
- Added `pb-[200px]` to `<main>` so content doesn't get hidden under the Compact panel

- [ ] **Step 2: Type-check (should now be clean)**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit code 0 — all errors resolved.

- [ ] **Step 3: Visual verification — run dev server**

Run: `cd frontend && npm run dev`
Open: http://localhost:3000

Verify:
- Page loads without errors
- A 180px-tall dark warm panel sits at the bottom of the viewport, full width
- Header shows "AI · Assistant" (no pageContext registered yet)
- Input field is visible at the bottom of the panel
- Press ⌘J → panel grows to ~88vh
- Press Esc → panel shrinks to 180px (compact)
- Press ⌘↓ → panel shrinks to 38px (collapsed bar)
- Click the 38px bar → grows back to compact
- Type "Why is my score 87 and not higher?" + Enter → user message bubble appears, then AI response after ~1s
- Resize the browser; panel stays full width

Stop the dev server (Ctrl+C) before committing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppShell.tsx
git commit -m "Update AppShell: remove right-margin shift, render bottom AI panel"
```

---

## Task 15: Wire `usePageContext` into Dashboard

**Files:**
- Modify: `frontend/src/components/dashboard/Dashboard.tsx` — add hook call near top.

- [ ] **Step 1: Read the existing Dashboard file**

Run: `cat frontend/src/components/dashboard/Dashboard.tsx | head -20`
Note the existing imports and the component name.

- [ ] **Step 2: Add the hook**

Use `Edit` tool to add after the existing imports:

Add a new import line:

```ts
import { usePageContext } from "@/hooks/usePageContext";
```

Inside the Dashboard component (or whatever the exported component is called), add as the very first hook:

```ts
usePageContext({
  page: "dashboard",
  summary: "首页总览，最近 3 个动态",
});
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 4: Visual verification**

Run: `cd frontend && npm run dev`
Open: http://localhost:3000 (Dashboard route)

Verify:
- AI panel header now reads "AI · Dashboard mode"
- Expand panel — header reads "AI · Dashboard mode · 首页总览，最近 3 个动态"

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/Dashboard.tsx
git commit -m "Register dashboard pageContext for AI panel"
```

---

## Task 16: Acceptance criteria walkthrough

This task is purely manual — no code changes. Confirm every spec acceptance criterion holds.

- [ ] **Step 1: Run dev server**

Run: `cd frontend && npm run dev`

- [ ] **Step 2: Walk through all 8 acceptance criteria from the spec**

Reference: `docs/superpowers/specs/2026-04-19-global-ai-panel-design.md` § "Acceptance Criteria".

For each, write a one-line PASS/FAIL note in the terminal:

1. **AC1:** Open `/` (Dashboard). Compact panel pinned to bottom (180px tall) with mode label "AI · Dashboard mode". → __ PASS / FAIL
2. **AC2:** Type a message in input and press Enter. → __ PASS / FAIL
3. **AC3:** Mock AI response appears in compact view (1-2 messages visible). → __ PASS / FAIL
4. **AC4:** Click ⤢ (Maximize2 icon) — smoothly animates to ~88vh. → __ PASS / FAIL
5. **AC5:** Click ⌄ (ChevronDown) in compact mode — collapses to 38px bar. → __ PASS / FAIL
6. **AC6:** Toggle panel — page content (Dashboard cards) does NOT shift horizontally. → __ PASS / FAIL
7. **AC7:** Send a message; navigate to another route (back to /) — last messages still visible in panel; panel state persists across navigation. → __ PASS / FAIL
8. **AC8:** Mock Interview override — DEFERRED (no Mock Interview page exists yet; this is documented).

- [ ] **Step 3: If any AC fails, file a follow-up task list**

If failures exist, create a short `FOLLOWUPS.md` file in `docs/superpowers/plans/` listing them and commit:

```bash
git add docs/superpowers/plans/FOLLOWUPS.md
git commit -m "Note AC failures from global AI panel walkthrough"
```

- [ ] **Step 4: If all pass (excluding deferred AC8), commit a summary**

```bash
git commit --allow-empty -m "Verified: global AI panel passes all spec acceptance criteria (AC1-AC7)"
```

- [ ] **Step 5: Push to remote**

```bash
git push origin main
```

---

## Self-Review Notes

Reviewed the plan against the spec on completion:

**Spec coverage:**
- Spec § "Three Heights" → Task 13 height map + Tasks 10/11/12 sub-components ✓
- Spec § "State Machine" → Task 1 store actions + Task 13 keyboard handler ✓
- Spec § "Layout Specs (Collapsed/Compact/Expanded)" → Tasks 10, 11, 12 ✓
- Spec § "Per-Page Behavior" → Task 9 ModeIndicator + Task 15 Dashboard registration. Other pages deferred (Mock Interview, Resume Editor, etc. each get their own usePageContext call when those pages exist or are touched in their own scope).
- Spec § "Interaction Details (Keyboard, Mouse, Animation)" → Task 13 orchestrator covers ⌘J / ⌘↑ / ⌘↓ / Esc. **Drag-to-resize is NOT implemented** (called out in spec as "open question" — defer). Spring physics covered.
- Spec § "Component Architecture" → File structure section maps 1:1 ✓
- Spec § "Removed / Changed" → Task 5 removes app.ts entries; Task 13 deletes old panel; Task 14 removes margin shift and trigger tab ✓
- Spec § "Acceptance Criteria" → Task 16 walks through all 8 ✓

**Placeholder scan:** None remain. Every code step shows the full content. Mock responses pruned to 2 examples to keep the orchestrator readable.

**Type consistency:** Store types (`AiPanelState`, `Message`, `PageContext`) used consistently across files. `useAiPanelStore`, `usePageContextStore`, `useConversationStore` naming consistent.

**Known deferred items (also documented in spec):**
- Mock Interview forced-Expanded behavior (AC8) — page doesn't exist yet
- Drag-to-resize on panel edge — spec marks as open question
- Inline AI suggestions on PDF resume sections — separate spec
- Real backend `/chat` integration — separate spec
- Other pages' `usePageContext` registration — done per-page when those pages are built/touched
