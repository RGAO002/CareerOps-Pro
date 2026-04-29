# AI Assistant Three-Poses (Bar / Sidebar / Orb) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current bottom `AIChatPanel` (collapsed/compact/expanded) and minimal right-side `AISidebar` with a single morphing assistant element that flies between **Bar** (default global), **Sidebar** (docked in `/editor`, content reflows to make room), and **Orb** (collapsed in `/editor`).

**Architecture:** One React component (`<Assistant>`) renders three CSS poses driven by a unified Zustand store (`useAssistantStore`). Sidebar pose hosts three tabs (Chat / Suggestions / History). The chat message stream is a discriminated union — narration text and inline diff cards interleave. SSE consumption is moved out of React component lifecycle into a store-level singleton so pose changes never sever a stream.

**Tech Stack:** Next.js 15 App Router, React 19, Zustand (persist middleware), Framer Motion (`layoutId` for shared-element morph), Tailwind v4 with CSS variables in `globals.css`, existing `<FluidCanvas>` (WebGL), existing SSE wrapper `runSSEStream`.

---

## Source of truth

- **Visual / interaction spec:** `frontend/design_handoff_ai_sidebar/README.md` + `ai-sidebar.html` (high-fidelity)
- **Non-regression mandate:** previous spec `docs/superpowers/specs/2026-04-28-resume-editor-ai-design.md` § 0.5 still binds
- **User decisions** (locked, see §0 of this plan)

---

## §0 Locked decisions

| # | Decision |
|---|---|
| D1 | `/editor` defaults to `pose='sidebar'`. No `bar` pose available there (Cmd+\ on /editor switches sidebar↔orb only). Other routes default to `pose='bar'`. |
| D2 | Sidebar reflows host content (`padding-right: 384px`) on viewports ≥ 1280px. On viewports < 1280px, sidebar overlays with a half-opacity backdrop. |
| D3 | Agent persona v0 = frontend chrome only. Store holds `targetAgent`. Backend receives the field and ignores it. AI message rows do **not** display per-agent dot tags yet (backend doesn't return agent persona). |
| D4 | Three tabs ship: Chat, Suggestions, History. History renders a "Coming soon" empty state with no backend. |
| D5 | Both ⋮⋮ double-click and a section-hover Ask AI pill open the sidebar. Both routes call the new store. |
| D6 | Chat tab shows inline diff cards (new `'ai-diff'` message kind referencing a suggestion id). |
| a | `Cmd+\` is the pose toggle. Existing `Cmd+J / Cmd+↑ / Cmd+↓` remain. |
| b | Quick chip click fills the input (does not auto-send). |
| c | Orb pose is only reachable in `/editor`. |
| d | Old `AIChatPanel/index.tsx` and `useAiPanelStore` are deleted. The bar pose is the only "small" form. |
| e | Ask AI pill renders at the section heading row (top-right), not at entry/bullet level. |
| f | No toast hint on pose change in v0. |
| g | SSE consumer lives in a module-level singleton (not React lifecycle). Pose change / route change does not sever the stream. |

## §0.5 Non-regression mandate (carried forward, unchanged)

These lines remain frozen:
1. `DragController.ts`, `LayoutEngine.ts`, `AtomContentLayer.tsx`, `atoms-projection.ts`, `move*.ts`, `header-order.ts` — no changes.
2. TipTap soft-lock continues to use `editor.setEditable(false)`. The `Editor` instance is never unmounted while a lock is active.
3. **Sidebar closed → host layout is byte-identical to today.** Only when the sidebar is open AND viewport ≥ 1280px does `padding-right: 384px` apply. Closed, the class is removed.
4. `Suggestion` discriminated union (`update / insert / delete / move`) shape is frozen. Only the conversation message union grows.
5. Existing store action signatures frozen. `useResumeStore` not touched in this plan.
6. v0 ships Anthropic only (`claude-sonnet-4-5`). `ANTHROPIC_API_KEY` already in `.env`.
7. Additive changes only:
   - **NEW** stores: `useAssistantStore` (replaces `useAiPanelStore` + `useAISidebarUIStore`).
   - **NEW** UI: `<Assistant>` (replaces `<AIChatPanel>` mount); diff card component; Ask AI pill in `InteractionLayer` for section blocks.
   - **EXTEND** `useConversationStore.Message` with discriminated kind.
   - **EXTEND** `RunRequest` (backend) with optional `targetAgent` field — read but ignored in v0.
   - **EXTEND** existing 4 callers of `useAISidebarUIStore.getState().open()` to call the new store action — straight swap.

## §0.6 Risk register

| ID | Risk | Mitigation |
|----|------|------------|
| R1 | Framer Motion `layoutId` morph may flicker when the inner content tree changes simultaneously (Bar `<input>` ↔ Sidebar `<header><tabs>...`) | Wrap each pose's interior in `motion.div` with `layout="position"` only on the outer shell; interior is plain DOM that fades out / in via `AnimatePresence`. |
| R2 | Stale references to `useAiPanelStore` after deletion break the build | Task 16 includes a final `grep -rn "useAiPanelStore\\|AIChatPanel"` check; the build itself catches the rest. |
| R3 | ⋮⋮ overlay migration to new store needs all 4 call sites updated atomically (else two parallel "open sidebar" actions) | Task 15 batches all 4 callers into one commit; old store deleted in same commit. |
| R4 | Reflow `padding-right` jitter when viewport crosses the 1280px breakpoint | A single `transition: padding 0.4s cubic-bezier(0.16, 1, 0.3, 1)` on the host wrapper smooths it; resize handler debounced 80ms. |
| R5 | This plan does not modify backend data flow or contracts. Existing AI run / SSE / suggestions API keeps its current shape. The previous spec needs no amendment. | — |
| R6 | Persisted `useConversationStore` (localStorage key `careerops-ai-conversation`) was holding flat `Message` shape. Adding a discriminated `kind` would deserialize old entries with `kind === undefined` | Migration: in the persist `migrate` callback, map any message lacking `kind` to either `'user'` (when `role === 'user'`) or `'ai-text'` (when `role === 'ai'`) and drop the old `role` field. |

---

## §1 File map

### New files
- `frontend/src/stores/assistant.ts` — unified state (pose, tab, scope, targetAgent, activeRunId)
- `frontend/src/components/ai/assistant/index.tsx` — `<Assistant>` root component, owns layoutId morph
- `frontend/src/components/ai/assistant/poses/BarPose.tsx`
- `frontend/src/components/ai/assistant/poses/SidebarPose.tsx`
- `frontend/src/components/ai/assistant/poses/OrbPose.tsx`
- `frontend/src/components/ai/assistant/tabs/ChatTab.tsx`
- `frontend/src/components/ai/assistant/tabs/SuggestionsTab.tsx`
- `frontend/src/components/ai/assistant/tabs/HistoryTab.tsx`
- `frontend/src/components/ai/assistant/parts/Mark.tsx`
- `frontend/src/components/ai/assistant/parts/DiffCard.tsx`
- `frontend/src/components/ai/assistant/parts/ScopePill.tsx`
- `frontend/src/components/ai/assistant/parts/AgentChips.tsx`
- `frontend/src/components/ai/assistant/parts/QuickChips.tsx`
- `frontend/src/components/ai/assistant/parts/MiniButton.tsx`
- `frontend/src/components/ai/assistant/AskAIPill.tsx` — section-hover pill inside InteractionLayer
- `frontend/src/components/ai/session.ts` — module-level SSE singleton (`startAssistantRun`, `cancelAssistantRun`)
- `frontend/src/components/ai/assistant/keyboard.ts` — Cmd+\ global shortcut hook
- `frontend/src/components/ai/assistant/route-pose.ts` — derive default pose from pathname
- `frontend/src/components/ai/assistant/__tests__/assistant.test.tsx`
- `frontend/src/components/ai/assistant/__tests__/poses.test.tsx`
- `frontend/src/components/ai/assistant/__tests__/DiffCard.test.tsx`
- `frontend/src/components/ai/assistant/__tests__/ChatTab.test.tsx`
- `frontend/src/components/ai/assistant/__tests__/SuggestionsTab.test.tsx`
- `frontend/src/components/ai/__tests__/session.test.ts`
- `frontend/src/stores/__tests__/assistant.test.ts`
- `frontend/src/components/ai/assistant/__tests__/AskAIPill.test.tsx`

### Modified files
- `frontend/src/app/globals.css` — append assistant token block
- `frontend/src/stores/conversation.ts` — extend `Message` to discriminated union with `kind`
- `frontend/src/stores/__tests__/conversation.test.ts` — extend (create if missing)
- `frontend/src/components/layout/AppShell.tsx` — swap `<AIChatPanel />` → `<Assistant />`
- `frontend/src/components/resume/v2/EditorPage.tsx` — wrap content with conditional reflow class; remove inline `<AISidebar />` mount (replaced by global `<Assistant>`)
- `frontend/src/components/resume/v2/atoms/EntryRowInteractionOverlay.tsx` — swap `useAISidebarUIStore` for `useAssistantStore`
- `frontend/src/components/resume/v2/atoms/HeaderRowInteractionOverlay.tsx` — same swap
- `frontend/src/components/resume/v2/atoms/BulletInteractionOverlay.tsx` — same swap
- `frontend/src/components/resume/v2/layers/InteractionLayer.tsx` — same swap + add Ask AI pill on section-block hover
- `api/routes/ai.py` — `RunRequest` adds optional `targetAgent: str | None = None` (ignored)

### Deleted files
- `frontend/src/components/layout/AIChatPanel/index.tsx`
- `frontend/src/components/layout/AIChatPanel/PanelCollapsed.tsx`
- `frontend/src/components/layout/AIChatPanel/PanelCompact.tsx`
- `frontend/src/components/layout/AIChatPanel/PanelExpanded.tsx`
- `frontend/src/components/layout/AIChatPanel/MessageList.tsx`
- `frontend/src/components/layout/AIChatPanel/MessageInput.tsx`
- `frontend/src/components/layout/AIChatPanel/ModeIndicator.tsx`
- `frontend/src/components/layout/AIChatPanel/colors.ts`
- `frontend/src/components/layout/AIChatPanel/platform.ts`
- `frontend/src/components/layout/AIChatPanel/` (directory)
- `frontend/src/components/ai/AISidebar.tsx` (replaced by `assistant/poses/SidebarPose.tsx`)
- `frontend/src/components/ai/AISidebarRow.tsx` (replaced by `assistant/parts/DiffCard.tsx`)
- `frontend/src/stores/aiPanel.ts`
- `frontend/src/stores/aiSidebarUI.ts`
- `frontend/src/components/ai/__tests__/AISidebar.test.tsx` (replaced by SidebarPose tests)

---

## Tasks

### Task 0: Path inventory + baseline + branch check

**Files:**
- Read-only verification

- [ ] **Step 0.1: Confirm working tree is clean and branch is correct**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
git status
git branch --show-current
```
Expected: branch `feature/resume-editor-v2`, clean tree (or only the design_handoff/ folder + already-discussed unstaged changes — if so, commit/stash them first per a separate decision).

- [ ] **Step 0.2: Verify each file in §1 either exists (modified/deleted) or doesn't exist (new). Abort and report if any mismatch.**

```bash
for f in \
  frontend/src/app/globals.css \
  frontend/src/stores/conversation.ts \
  frontend/src/stores/aiPanel.ts \
  frontend/src/stores/aiSidebarUI.ts \
  frontend/src/components/layout/AppShell.tsx \
  frontend/src/components/layout/AIChatPanel/index.tsx \
  frontend/src/components/ai/AISidebar.tsx \
  frontend/src/components/ai/AISidebarRow.tsx \
  frontend/src/components/ai/AISessionClient.ts \
  frontend/src/components/ai/applySuggestion.ts \
  frontend/src/components/ai/concurrencyCheck.ts \
  frontend/src/components/landing/FluidCanvas.tsx \
  frontend/src/components/resume/v2/EditorPage.tsx \
  frontend/src/components/resume/v2/atoms/EntryRowInteractionOverlay.tsx \
  frontend/src/components/resume/v2/atoms/HeaderRowInteractionOverlay.tsx \
  frontend/src/components/resume/v2/atoms/BulletInteractionOverlay.tsx \
  frontend/src/components/resume/v2/layers/InteractionLayer.tsx \
  api/routes/ai.py ; do
  test -f "$f" && echo "OK   $f" || echo "MISS $f"
done
```
Expected: every line `OK`. If any `MISS`, **abort** and report to controller.

- [ ] **Step 0.3: Capture baseline test counts**

```bash
cd frontend && npx vitest run src/components/resume/v2 2>&1 | tail -5
npx vitest run src/components/ai src/stores 2>&1 | tail -5
cd ..
pytest -x 2>&1 | tail -3
```
Record both numbers in your task report. The v2 number is the **non-regression floor** — every subsequent task must keep it equal or higher.

- [ ] **Step 0.4: Confirm `ANTHROPIC_API_KEY` is present (already verified in previous plan, sanity check)**

```bash
grep -c "^ANTHROPIC_API_KEY=sk-" .env
```
Expected: `1`. If `0`, abort.

- [ ] **Step 0.5: Read the design handoff in full (don't summarize, read it):**

```bash
wc -l frontend/design_handoff_ai_sidebar/README.md
```
Expected: ~344 lines. The implementer agent must `Read` the entire README before Task 1.

- [ ] **Step 0.6: No commit at task 0 — this is verification only.**

---

### Task 1: Design tokens in globals.css

**Files:**
- Modify: `frontend/src/app/globals.css` (append at end)

- [ ] **Step 1.1: Read the current globals.css head + tail**

```bash
head -5 frontend/src/app/globals.css
tail -10 frontend/src/app/globals.css
```
This confirms the Tailwind v4 + `@theme inline` pattern; tokens are appended in plain `:root { ... }`.

- [ ] **Step 1.2: Append the assistant token block at the end of `frontend/src/app/globals.css`**

```css
/* ─── AI Assistant tokens (per design_handoff_ai_sidebar/README.md §Design Tokens) ─── */
:root {
  /* Surface — assistant (translucent, sits on FluidCanvas) */
  --p-surface:      oklch(0.18 0.022 34 / 0.72);
  --p-surface-hi:   oklch(0.22 0.024 34 / 0.82);
  --p-border:       oklch(0.55 0.015 40 / 0.22);
  --p-border2:      oklch(0.60 0.018 40 / 0.30);

  /* Sidebar / Bar / Orb base colors */
  --p-sidebar-base: oklch(0.13 0.025 34);
  --p-bar-base:     oklch(0.10 0.018 34 / 0.92);

  /* Type — assistant */
  --p-text:         oklch(0.96 0.010 55);
  --p-text-body:    oklch(0.86 0.012 52);
  --p-text-mute:    oklch(0.66 0.010 50);
  --p-text-dim:     oklch(0.50 0.008 50);

  /* Accents */
  --p-accent:       oklch(0.72 0.13 38);
  --p-accent-warm:  oklch(0.78 0.12 42);
  --p-accent-muted: oklch(0.72 0.13 38 / 0.18);
  --p-accent-deep:  oklch(0.55 0.14 32);

  /* Three-agent palette (v0: tokens defined, only used in chip dots; AI message rows do NOT show per-agent dot yet) */
  --p-recruit:      oklch(0.70 0.12 35);
  --p-hm:           oklch(0.68 0.10 150);
  --p-coach:        oklch(0.66 0.11 260);

  /* Easing */
  --p-ease:         cubic-bezier(0.16, 1, 0.3, 1);
  --p-ease-soft:    cubic-bezier(0.25, 0.8, 0.25, 1);
}
```

- [ ] **Step 1.3: Verify the file still parses (build check, fast)**

```bash
cd frontend && npx next build --no-lint 2>&1 | tail -5
```
Expected: no CSS parse errors. (We accept `--no-lint` here for speed; full lint runs in Task 18.)

- [ ] **Step 1.4: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "ai-assist: add three-pose design tokens to globals.css"
```

---

### Task 2: useAssistantStore (unified pose / tab / scope / targetAgent / activeRunId)

**Files:**
- Create: `frontend/src/stores/assistant.ts`
- Create: `frontend/src/stores/__tests__/assistant.test.ts`

- [ ] **Step 2.1: Write the failing test**

`frontend/src/stores/__tests__/assistant.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAssistantStore } from '../assistant';

beforeEach(() => {
  // Reset to factory defaults between tests.
  useAssistantStore.setState({
    pose: 'bar',
    tab: 'chat',
    scope: null,
    targetAgent: 'all',
    activeRunId: null,
  });
});

describe('useAssistantStore', () => {
  it('defaults: pose=bar, tab=chat, scope=null, targetAgent=all, activeRunId=null', () => {
    const s = useAssistantStore.getState();
    expect(s.pose).toBe('bar');
    expect(s.tab).toBe('chat');
    expect(s.scope).toBeNull();
    expect(s.targetAgent).toBe('all');
    expect(s.activeRunId).toBeNull();
  });

  it('openSidebarWithScope sets pose=sidebar and scope object', () => {
    useAssistantStore.getState().openSidebarWithScope({ blockId: 'b1', label: 'Experience · Linear' });
    const s = useAssistantStore.getState();
    expect(s.pose).toBe('sidebar');
    expect(s.scope).toEqual({ blockId: 'b1', label: 'Experience · Linear' });
  });

  it('clearScope nulls scope but keeps pose', () => {
    useAssistantStore.setState({ pose: 'sidebar', scope: { blockId: 'x', label: 'X' } });
    useAssistantStore.getState().clearScope();
    const s = useAssistantStore.getState();
    expect(s.pose).toBe('sidebar');
    expect(s.scope).toBeNull();
  });

  it('setPose flips pose', () => {
    useAssistantStore.getState().setPose('orb');
    expect(useAssistantStore.getState().pose).toBe('orb');
  });

  it('setTab flips tab', () => {
    useAssistantStore.getState().setTab('suggestions');
    expect(useAssistantStore.getState().tab).toBe('suggestions');
  });

  it('setTargetAgent flips agent', () => {
    useAssistantStore.getState().setTargetAgent('hm');
    expect(useAssistantStore.getState().targetAgent).toBe('hm');
  });

  it('setActiveRunId tracks SSE-connected run', () => {
    useAssistantStore.getState().setActiveRunId('run_42');
    expect(useAssistantStore.getState().activeRunId).toBe('run_42');
    useAssistantStore.getState().setActiveRunId(null);
    expect(useAssistantStore.getState().activeRunId).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run the test to verify failure**

```bash
cd frontend && npx vitest run src/stores/__tests__/assistant.test.ts 2>&1 | tail -10
```
Expected: FAIL — `Cannot find module '../assistant'`.

- [ ] **Step 2.3: Implement `frontend/src/stores/assistant.ts`**

```ts
// frontend/src/stores/assistant.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AssistantPose = 'bar' | 'sidebar' | 'orb';
export type AssistantTab  = 'chat' | 'suggestions' | 'history';
export type AssistantTargetAgent = 'all' | 'recruit' | 'hm' | 'coach';

export interface AssistantScope {
  /** Block id (section / entry / bullet / header) the assistant is focused on. */
  blockId: string;
  /** Human label shown in the scope pill, e.g. "Experience · Linear Labs". */
  label: string;
}

interface AssistantState {
  pose: AssistantPose;
  tab: AssistantTab;
  scope: AssistantScope | null;
  targetAgent: AssistantTargetAgent;
  /** Run id of the currently-streaming SSE connection, if any. Used by
   *  the session singleton to dedupe + by the UI to show a typing indicator. */
  activeRunId: string | null;

  setPose: (p: AssistantPose) => void;
  setTab: (t: AssistantTab) => void;
  openSidebarWithScope: (scope: AssistantScope) => void;
  clearScope: () => void;
  setTargetAgent: (a: AssistantTargetAgent) => void;
  setActiveRunId: (id: string | null) => void;
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set) => ({
      pose: 'bar',
      tab: 'chat',
      scope: null,
      targetAgent: 'all',
      activeRunId: null,

      setPose: (pose) => set({ pose }),
      setTab: (tab) => set({ tab }),
      openSidebarWithScope: (scope) => set({ pose: 'sidebar', scope }),
      clearScope: () => set({ scope: null }),
      setTargetAgent: (targetAgent) => set({ targetAgent }),
      setActiveRunId: (activeRunId) => set({ activeRunId }),
    }),
    {
      name: 'careerops-assistant',
      // Only persist user-controlled prefs. Scope and activeRunId are runtime-only.
      partialize: (s) => ({ pose: s.pose, tab: s.tab, targetAgent: s.targetAgent }),
    },
  ),
);
```

- [ ] **Step 2.4: Run the test to verify success**

```bash
cd frontend && npx vitest run src/stores/__tests__/assistant.test.ts 2>&1 | tail -10
```
Expected: 7 passed.

- [ ] **Step 2.5: Commit**

```bash
git add frontend/src/stores/assistant.ts frontend/src/stores/__tests__/assistant.test.ts
git commit -m "ai-assist: add useAssistantStore (pose/tab/scope/targetAgent/activeRunId)"
```

---

### Task 3: Extend useConversationStore message union (add 'ai-diff' kind)

**Files:**
- Modify: `frontend/src/stores/conversation.ts`
- Create: `frontend/src/stores/__tests__/conversation.test.ts`

- [ ] **Step 3.1: Write the failing test**

`frontend/src/stores/__tests__/conversation.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useConversationStore, type Message } from '../conversation';

beforeEach(() => {
  useConversationStore.setState({ messages: [] });
});

describe('useConversationStore', () => {
  it('appends a user message with kind=user', () => {
    useConversationStore.getState().appendMessage({ kind: 'user', content: 'hi' });
    const m = useConversationStore.getState().messages[0];
    expect(m.kind).toBe('user');
    if (m.kind === 'user') expect(m.content).toBe('hi');
    expect(m.id).toBeTruthy();
    expect(m.createdAt).toBeGreaterThan(0);
  });

  it('appends an ai-text message with optional agentId', () => {
    useConversationStore.getState().appendMessage({
      kind: 'ai-text',
      content: 'Reviewing your bullet…',
      agentId: 'PolishAgent',
    });
    const m = useConversationStore.getState().messages[0];
    expect(m.kind).toBe('ai-text');
    if (m.kind === 'ai-text') {
      expect(m.content).toBe('Reviewing your bullet…');
      expect(m.agentId).toBe('PolishAgent');
    }
  });

  it('appends an ai-diff message referencing a suggestionId', () => {
    useConversationStore.getState().appendMessage({
      kind: 'ai-diff',
      suggestionId: 'sug_abc',
      agentId: 'PolishAgent',
    });
    const m = useConversationStore.getState().messages[0];
    expect(m.kind).toBe('ai-diff');
    if (m.kind === 'ai-diff') {
      expect(m.suggestionId).toBe('sug_abc');
      expect(m.agentId).toBe('PolishAgent');
    }
  });

  it('clearConversation empties the array', () => {
    useConversationStore.getState().appendMessage({ kind: 'user', content: 'x' });
    useConversationStore.getState().clearConversation();
    expect(useConversationStore.getState().messages).toEqual([]);
  });
});
```

- [ ] **Step 3.2: Run the test to verify failure**

```bash
cd frontend && npx vitest run src/stores/__tests__/conversation.test.ts 2>&1 | tail -10
```
Expected: FAIL — old `Message` shape doesn't have `kind`, types won't compile.

- [ ] **Step 3.3: Rewrite `frontend/src/stores/conversation.ts` with the discriminated union and a persist `migrate` for old entries**

```ts
// frontend/src/stores/conversation.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Base {
  id: string;
  createdAt: number;
}

export type Message =
  | (Base & { kind: 'user'; content: string })
  | (Base & { kind: 'ai-text'; content: string; agentId?: string })
  | (Base & { kind: 'ai-diff'; suggestionId: string; agentId?: string });

export type NewMessage =
  | { kind: 'user'; content: string }
  | { kind: 'ai-text'; content: string; agentId?: string }
  | { kind: 'ai-diff'; suggestionId: string; agentId?: string };

interface ConversationStore {
  messages: Message[];
  appendMessage: (msg: NewMessage) => void;
  clearConversation: () => void;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set) => ({
      messages: [],

      appendMessage: (msg) =>
        set((s) => {
          const prefix = msg.kind === 'user' ? 'u' : msg.kind === 'ai-text' ? 'a' : 'd';
          const full: Message = {
            ...msg,
            id: nextId(prefix),
            createdAt: Date.now(),
          } as Message;
          return { messages: [...s.messages, full] };
        }),

      clearConversation: () => set({ messages: [] }),
    }),
    {
      name: 'careerops-ai-conversation',
      version: 2,
      migrate: (persisted: unknown, fromVersion: number): ConversationStore => {
        // v0 / v1 had `{ role: 'user'|'ai', content, action? }`. Map to the new union;
        // drop the unserialisable `action` field.
        const p = persisted as { messages?: Array<{ role?: 'user' | 'ai'; content?: string; id?: string; createdAt?: number }>; } | null;
        if (!p?.messages) return { messages: [], appendMessage: () => {}, clearConversation: () => {} } as unknown as ConversationStore;
        if (fromVersion >= 2) return p as unknown as ConversationStore;
        const upgraded: Message[] = p.messages
          .map((m) => {
            const base = { id: m.id ?? nextId('m'), createdAt: m.createdAt ?? Date.now() };
            if (m.role === 'user') return { ...base, kind: 'user', content: m.content ?? '' } satisfies Message;
            if (m.role === 'ai')   return { ...base, kind: 'ai-text', content: m.content ?? '' } satisfies Message;
            return null;
          })
          .filter((x): x is Message => x !== null);
        return { messages: upgraded, appendMessage: () => {}, clearConversation: () => {} } as unknown as ConversationStore;
      },
    },
  ),
);
```

- [ ] **Step 3.4: Run the test to verify success**

```bash
cd frontend && npx vitest run src/stores/__tests__/conversation.test.ts 2>&1 | tail -10
```
Expected: 4 passed.

- [ ] **Step 3.5: Run all v2 + ai + stores tests to ensure nothing else regressed**

```bash
cd frontend && npx vitest run src/stores src/components/ai src/components/resume/v2 2>&1 | tail -10
```
Expected: counts ≥ baseline (Task 0.3). Existing AIChatPanel test will still pass against the old shape — fine because Task 16 deletes it.

- [ ] **Step 3.6: Commit**

```bash
git add frontend/src/stores/conversation.ts frontend/src/stores/__tests__/conversation.test.ts
git commit -m "ai-assist: extend conversation Message to discriminated union (user/ai-text/ai-diff)"
```

---

### Task 4: SSE pipeline extraction — module-level singleton

**Files:**
- Create: `frontend/src/components/ai/session.ts`
- Create: `frontend/src/components/ai/__tests__/session.test.ts`

- [ ] **Step 4.1: Write the failing test**

`frontend/src/components/ai/__tests__/session.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAssistantStore } from '@/stores/assistant';
import { useConversationStore } from '@/stores/conversation';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { startAssistantRun, _resetSessionForTests } from '../session';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  useAssistantStore.setState({ pose: 'bar', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
  useConversationStore.setState({ messages: [] });
  useSuggestionStore.setState({ byId: {}, byRun: {} });
  _resetSessionForTests();
});

describe('startAssistantRun', () => {
  it('POSTs /api/ai/run with userInput, resumeId, selection, chatHistory, targetAgent and stashes activeRunId', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ runId: 'run_x' }) });
    // EventSource cannot be invoked in unit tests — stub it.
    class FakeES {
      addEventListener() {}
      close() {}
    }
    (global as unknown as { EventSource: typeof EventSource }).EventSource = FakeES as unknown as typeof EventSource;

    await startAssistantRun({
      resumeId: 'r1',
      userInput: 'tighten this bullet',
      selection: [],
      chatHistory: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/ai/run'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"targetAgent":"all"'),
      }),
    );
    expect(useAssistantStore.getState().activeRunId).toBe('run_x');
  });

  it('on a suggestion event, double-writes: useSuggestionStore.upsert + useConversationStore.appendMessage(kind=ai-diff)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ runId: 'run_y' }) });

    let suggestionListener: ((e: MessageEvent) => void) | null = null;
    let completedListener: ((e: MessageEvent) => void) | null = null;
    class FakeES {
      addEventListener(type: string, fn: (e: MessageEvent) => void) {
        if (type === 'suggestion.streamed') suggestionListener = fn;
        if (type === 'run.completed') completedListener = fn;
      }
      close() {}
    }
    (global as unknown as { EventSource: typeof EventSource }).EventSource = FakeES as unknown as typeof EventSource;

    await startAssistantRun({ resumeId: 'r1', userInput: 'x', selection: [], chatHistory: [] });

    const sug: Suggestion = {
      id: 'sug_1', runId: 'run_y', agentId: 'PolishAgent', resumeId: 'r1',
      status: 'pending', createdAt: 1,
      source: { kind: 'agent', agentId: 'PolishAgent', runId: 'run_y' },
      op: 'update',
      field: { kind: 'entry.title', id: 'e1' },
      before: 'old', after: 'new',
    };
    suggestionListener?.(new MessageEvent('m', { data: JSON.stringify({ suggestion: sug }) }));

    expect(useSuggestionStore.getState().byId['sug_1']).toEqual(sug);
    const msgs = useConversationStore.getState().messages;
    expect(msgs.length).toBe(1);
    expect(msgs[0].kind).toBe('ai-diff');
    if (msgs[0].kind === 'ai-diff') expect(msgs[0].suggestionId).toBe('sug_1');

    // run.completed clears activeRunId
    completedListener?.(new MessageEvent('m', { data: JSON.stringify({ runId: 'run_y', suggestionIds: ['sug_1'], status: 'done' }) }));
    expect(useAssistantStore.getState().activeRunId).toBeNull();
  });
});
```

- [ ] **Step 4.2: Run the test to verify failure**

```bash
cd frontend && npx vitest run src/components/ai/__tests__/session.test.ts 2>&1 | tail -10
```
Expected: FAIL — `Cannot find module '../session'`.

- [ ] **Step 4.3: Implement `frontend/src/components/ai/session.ts`**

```ts
// frontend/src/components/ai/session.ts
//
// Module-level SSE singleton. Holds the cleanup ref for the current /api/ai/run
// stream so pose changes / route changes do not sever an in-flight run.
//
// Why a module-level singleton instead of a hook: the previous implementation
// inlined runSSEStream inside AIChatPanel.send(). When the panel unmounted
// (pose change, route change, hot reload) the EventSource was garbage-collected
// and narrations stopped arriving. Lifting the connection out of the React
// tree means the only thing that closes it is a `run.completed` event or an
// explicit `cancelAssistantRun()`.
//
// Per spec § 0.5 rule #7 this is an additive surface; existing API contracts
// (`runSSEStream`, `useSuggestionStore`, `useConversationStore`) are unchanged.

import { runSSEStream } from './AISessionClient';
import { useAssistantStore } from '@/stores/assistant';
import { useConversationStore } from '@/stores/conversation';

const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) ||
  'http://localhost:8000';

let activeCleanup: (() => void) | null = null;

export interface StartRunArgs {
  resumeId: string;
  userInput: string;
  selection: unknown[];
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Kick off an AI run. Returns when /api/ai/run resolves (run id assigned);
 * SSE narrations / suggestions / completion arrive asynchronously after that
 * and dispatch into the existing zustand stores.
 *
 * Concurrent runs are serialised: starting a new run cancels any previous one.
 */
export async function startAssistantRun(args: StartRunArgs): Promise<string> {
  // Cancel any in-flight run before starting a new one.
  cancelAssistantRun();

  const targetAgent = useAssistantStore.getState().targetAgent;
  const r = await fetch(`${API_BASE}/api/ai/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeId: args.resumeId,
      userInput: args.userInput,
      selection: args.selection,
      chatHistory: args.chatHistory,
      targetAgent,  // v0: forwarded but ignored by backend
    }),
  });
  if (!r.ok) throw new Error(`/api/ai/run returned ${r.status}`);
  const { runId } = (await r.json()) as { runId: string };

  useAssistantStore.getState().setActiveRunId(runId);

  activeCleanup = runSSEStream(runId, {
    onNarration: (text, agentId) => {
      // v0: persona-less; agentId here is a backend-internal label
      // (e.g. "PolishAgent"), not a persona. Render plain.
      useConversationStore.getState().appendMessage({
        kind: 'ai-text',
        content: text,
        agentId,
      });
    },
    onCompleted: (_rid, _suggestionIds, _status) => {
      useAssistantStore.getState().setActiveRunId(null);
      activeCleanup = null;
    },
    onError: (err) => {
      useConversationStore.getState().appendMessage({
        kind: 'ai-text',
        content: `SSE error: ${String(err)}`,
      });
      useAssistantStore.getState().setActiveRunId(null);
      activeCleanup = null;
    },
  });

  // Subscribe to suggestion.streamed via the SAME EventSource that runSSEStream
  // owns. Since runSSEStream already dispatches into useSuggestionStore.upsert
  // for us, we layer on a tiny extra: also append an 'ai-diff' message into
  // the conversation so the Chat tab renders an inline diff card.
  //
  // To avoid double-handling we patch the suggestion store after-write rather
  // than re-subscribing to the EventSource. We use the store's subscribe API.
  const unsub = (await import('@/stores/aiSuggestion')).useSuggestionStore.subscribe(
    (state, prev) => {
      const newKeys = Object.keys(state.byId).filter((k) => !(k in prev.byId));
      for (const id of newKeys) {
        const s = state.byId[id];
        if (s.runId !== runId) continue;
        useConversationStore.getState().appendMessage({
          kind: 'ai-diff',
          suggestionId: s.id,
          agentId: s.agentId,
        });
      }
    },
  );

  // Wrap the cleanup to also unsubscribe.
  const innerClose = activeCleanup;
  activeCleanup = () => {
    unsub();
    innerClose?.();
  };

  return runId;
}

export function cancelAssistantRun(): void {
  activeCleanup?.();
  activeCleanup = null;
  useAssistantStore.getState().setActiveRunId(null);
}

/** Test-only reset hook. Not exported in the public surface. */
export function _resetSessionForTests(): void {
  activeCleanup = null;
}
```

> **Note about the test stub:** The `useSuggestionStore.subscribe` form requires the store to be created with `subscribeWithSelector` middleware, OR plain `subscribe((state, prev) => …)` works on vanilla zustand from v4 onwards. Verify the store exposes plain subscribe; if not, also extend `frontend/src/stores/aiSuggestion.ts` with `subscribeWithSelector` middleware (additive).

- [ ] **Step 4.4: If the test reveals `subscribe(state, prev)` two-argument form is unsupported, add `subscribeWithSelector` middleware to `aiSuggestion.ts`**

Run the test first:

```bash
cd frontend && npx vitest run src/components/ai/__tests__/session.test.ts 2>&1 | tail -15
```

If failure mentions `prev` is undefined or `subscribe` signature mismatch, edit `frontend/src/stores/aiSuggestion.ts`:

Find:
```ts
export const useSuggestionStore = create<SuggestionStoreState>((set, get) => ({
```
Replace with:
```ts
import { subscribeWithSelector } from 'zustand/middleware';
export const useSuggestionStore = create<SuggestionStoreState>()(
  subscribeWithSelector((set, get) => ({
```
And close the extra paren at the bottom of the `create()` call.

Re-run the test.

- [ ] **Step 4.5: Verify the test passes**

```bash
cd frontend && npx vitest run src/components/ai/__tests__/session.test.ts 2>&1 | tail -10
```
Expected: 2 passed.

- [ ] **Step 4.6: Commit**

```bash
git add frontend/src/components/ai/session.ts frontend/src/components/ai/__tests__/session.test.ts frontend/src/stores/aiSuggestion.ts
git commit -m "ai-assist: extract SSE singleton (session.ts) — pose/route changes no longer sever stream"
```

---

### Task 5: Cmd+\ keyboard shortcut + route-driven default pose

**Files:**
- Create: `frontend/src/components/ai/assistant/keyboard.ts`
- Create: `frontend/src/components/ai/assistant/route-pose.ts`
- Create: `frontend/src/components/ai/assistant/__tests__/route-pose.test.ts`

- [ ] **Step 5.1: Write the failing test for route-pose**

`frontend/src/components/ai/assistant/__tests__/route-pose.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { defaultPoseForRoute, allowedPosesForRoute } from '../route-pose';

describe('defaultPoseForRoute', () => {
  it('returns sidebar for any /editor/... pathname', () => {
    expect(defaultPoseForRoute('/editor')).toBe('sidebar');
    expect(defaultPoseForRoute('/editor/abc-123')).toBe('sidebar');
  });
  it('returns bar everywhere else', () => {
    expect(defaultPoseForRoute('/')).toBe('bar');
    expect(defaultPoseForRoute('/tracker')).toBe('bar');
    expect(defaultPoseForRoute('/insights')).toBe('bar');
  });
});

describe('allowedPosesForRoute', () => {
  it('on /editor allows sidebar + orb only (no bar — D1)', () => {
    expect(allowedPosesForRoute('/editor')).toEqual(['sidebar', 'orb']);
    expect(allowedPosesForRoute('/editor/123')).toEqual(['sidebar', 'orb']);
  });
  it('on other routes allows bar only (no sidebar/orb — orb scoped to editor per c)', () => {
    expect(allowedPosesForRoute('/')).toEqual(['bar']);
    expect(allowedPosesForRoute('/tracker')).toEqual(['bar']);
  });
});
```

- [ ] **Step 5.2: Implement `frontend/src/components/ai/assistant/route-pose.ts`**

```ts
// frontend/src/components/ai/assistant/route-pose.ts
import type { AssistantPose } from '@/stores/assistant';

/** Default pose when entering a route. Per D1 / c. */
export function defaultPoseForRoute(pathname: string): AssistantPose {
  return pathname === '/editor' || pathname.startsWith('/editor/') ? 'sidebar' : 'bar';
}

/** Which poses the user is allowed to switch to from a given route.
 *  Per D1 (no bar inside /editor) and c (orb only in /editor). */
export function allowedPosesForRoute(pathname: string): AssistantPose[] {
  if (pathname === '/editor' || pathname.startsWith('/editor/')) {
    return ['sidebar', 'orb'];
  }
  return ['bar'];
}
```

- [ ] **Step 5.3: Verify the test passes**

```bash
cd frontend && npx vitest run src/components/ai/assistant/__tests__/route-pose.test.ts 2>&1 | tail -5
```
Expected: 4 passed.

- [ ] **Step 5.4: Implement `frontend/src/components/ai/assistant/keyboard.ts` (no test — pure DOM side effects, manually verified in Task 19)**

```ts
// frontend/src/components/ai/assistant/keyboard.ts
//
// Cmd+\ (or Ctrl+\) toggles the assistant pose between the two allowed poses
// for the current route.
//
// /editor → sidebar ↔ orb
// other   → bar ↔ orb is NOT allowed by §c, so on those routes Cmd+\ is a no-op
//          besides bar (already there).
//
// Existing shortcuts (Cmd+J, Cmd+↑, Cmd+↓) used to drive the legacy three-state
// AIChatPanel; those are no longer relevant once the panel is deleted in
// Task 16. They are removed alongside the panel; we do NOT register
// replacements here.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAssistantStore } from '@/stores/assistant';
import { allowedPosesForRoute } from './route-pose';

export function useAssistantKeyboard(): void {
  const pathname = usePathname();
  useEffect(() => {
    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.key !== '\\') return;
      e.preventDefault();
      const allowed = allowedPosesForRoute(pathname || '/');
      if (allowed.length < 2) return;  // only one pose → nothing to toggle
      const cur = useAssistantStore.getState().pose;
      const idx = allowed.indexOf(cur);
      const next = idx === -1 ? allowed[0] : allowed[(idx + 1) % allowed.length];
      useAssistantStore.getState().setPose(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname]);
}

/** Hook: sync pose to route default whenever the pathname changes. Skips if
 *  the user has explicitly chosen a pose this session (persisted via the
 *  store middleware). The semantic: route default is suggestive, not coercive,
 *  but /editor is special — it forces sidebar on entry. */
export function useRoutePoseSync(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    const allowed = allowedPosesForRoute(pathname);
    const cur = useAssistantStore.getState().pose;
    if (!allowed.includes(cur)) {
      // Current pose isn't allowed here — snap to the first allowed.
      useAssistantStore.getState().setPose(allowed[0]);
    }
  }, [pathname]);
}
```

- [ ] **Step 5.5: Commit**

```bash
git add frontend/src/components/ai/assistant/keyboard.ts frontend/src/components/ai/assistant/route-pose.ts frontend/src/components/ai/assistant/__tests__/route-pose.test.ts
git commit -m "ai-assist: Cmd+\\ shortcut + route-driven default pose (sidebar in /editor, bar elsewhere)"
```

---

### Task 6: `<Assistant>` root component (mount-point + pose dispatch)

**Files:**
- Create: `frontend/src/components/ai/assistant/index.tsx`
- Create: `frontend/src/components/ai/assistant/__tests__/assistant.test.tsx`

- [ ] **Step 6.1: Write the failing test**

`frontend/src/components/ai/assistant/__tests__/assistant.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Assistant } from '../index';
import { useAssistantStore } from '@/stores/assistant';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('../poses/BarPose',     () => ({ BarPose:     () => <div data-testid="pose-bar" /> }));
vi.mock('../poses/SidebarPose', () => ({ SidebarPose: () => <div data-testid="pose-sidebar" /> }));
vi.mock('../poses/OrbPose',     () => ({ OrbPose:     () => <div data-testid="pose-orb" /> }));

beforeEach(() => {
  useAssistantStore.setState({ pose: 'bar', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
});

describe('<Assistant>', () => {
  it('renders BarPose when pose=bar', () => {
    useAssistantStore.setState({ pose: 'bar' });
    render(<Assistant />);
    expect(screen.getByTestId('pose-bar')).toBeInTheDocument();
  });
  it('renders SidebarPose when pose=sidebar', () => {
    useAssistantStore.setState({ pose: 'sidebar' });
    render(<Assistant />);
    expect(screen.getByTestId('pose-sidebar')).toBeInTheDocument();
  });
  it('renders OrbPose when pose=orb', () => {
    useAssistantStore.setState({ pose: 'orb' });
    render(<Assistant />);
    expect(screen.getByTestId('pose-orb')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6.2: Verify failure**

```bash
cd frontend && npx vitest run src/components/ai/assistant/__tests__/assistant.test.tsx 2>&1 | tail -8
```
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement `frontend/src/components/ai/assistant/index.tsx`**

```tsx
// frontend/src/components/ai/assistant/index.tsx
'use client';
import { useAssistantStore } from '@/stores/assistant';
import { useAssistantKeyboard, useRoutePoseSync } from './keyboard';
import { BarPose } from './poses/BarPose';
import { SidebarPose } from './poses/SidebarPose';
import { OrbPose } from './poses/OrbPose';

/**
 * Single mount-point for the AI assistant. Registers global shortcuts +
 * route-pose sync, then dispatches to the correct pose component.
 *
 * The "same identity" feeling is achieved by:
 *   1. A single, persistent <Assistant /> mount in <AppShell>.
 *   2. Each pose component uses Framer Motion's `layoutId="ai-assistant-shell"`
 *      on its outer wrapper so morph between poses animates the geometry.
 *
 * NB: the SSE session is owned by `frontend/src/components/ai/session.ts`
 * (module singleton). The Assistant tree never carries the EventSource —
 * unmounting any pose does NOT sever a run.
 */
export function Assistant() {
  useAssistantKeyboard();
  useRoutePoseSync();
  const pose = useAssistantStore((s) => s.pose);

  if (pose === 'bar')     return <BarPose />;
  if (pose === 'sidebar') return <SidebarPose />;
  return <OrbPose />;
}
```

- [ ] **Step 6.4: Verify the test passes**

```bash
cd frontend && npx vitest run src/components/ai/assistant/__tests__/assistant.test.tsx 2>&1 | tail -8
```
Expected: 3 passed. (Note: poses don't exist yet — the mock supplies stubs.)

- [ ] **Step 6.5: Commit**

```bash
git add frontend/src/components/ai/assistant/index.tsx frontend/src/components/ai/assistant/__tests__/assistant.test.tsx
git commit -m "ai-assist: <Assistant> root component (pose dispatch + global hooks)"
```

---

### Task 7: BarPose

**Files:**
- Create: `frontend/src/components/ai/assistant/parts/Mark.tsx`
- Create: `frontend/src/components/ai/assistant/parts/MiniButton.tsx` (partial — only the icon-button primitive used by Bar's send button)
- Create: `frontend/src/components/ai/assistant/poses/BarPose.tsx`
- Create: `frontend/src/components/ai/assistant/__tests__/BarPose.test.tsx`

- [ ] **Step 7.1: Implement `Mark` (24×24 sparkle in accent-muted square)**

`frontend/src/components/ai/assistant/parts/Mark.tsx`:
```tsx
// frontend/src/components/ai/assistant/parts/Mark.tsx
'use client';
/**
 * The assistant mark — a 24×24 rounded square with the accent-warm sparkle SVG.
 * Per design_handoff_ai_sidebar/README.md §A and §B.
 */
export function Mark({ size = 24 }: { size?: number }) {
  const inner = Math.round((size * 13) / 24);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        background: 'var(--p-accent-muted)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 24 24" width={inner} height={inner} fill="none" stroke="var(--p-accent-warm)" strokeWidth={1.5}>
        <polygon points="12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5" />
      </svg>
    </span>
  );
}
```

- [ ] **Step 7.2: Implement `frontend/src/components/ai/assistant/parts/MiniButton.tsx`**

```tsx
// frontend/src/components/ai/assistant/parts/MiniButton.tsx
'use client';
import type { ReactNode, MouseEventHandler } from 'react';
/**
 * 28×28 rounded-square ghost icon button. Used in the sidebar header
 * (+ / dock / minimize) and as the BarPose / SidebarPose send button.
 * Variants:
 *   - 'ghost' (default): transparent → surface on hover
 *   - 'solid': filled with accent (the send buttons)
 */
export function MiniButton({
  ariaLabel, onClick, children, variant = 'ghost',
}: {
  ariaLabel: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  variant?: 'ghost' | 'solid';
}) {
  const isSolid = variant === 'solid';
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        display: 'grid',
        placeItems: 'center',
        background: isSolid ? 'var(--p-accent)' : 'transparent',
        color: isSolid ? 'oklch(0.99 0.003 70)' : 'var(--p-text-mute)',
        border: 0,
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s, filter 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (isSolid) (e.currentTarget.style.filter = 'brightness(1.08)');
        else { e.currentTarget.style.background = 'var(--p-surface)'; e.currentTarget.style.color = 'var(--p-text-body)'; }
      }}
      onMouseLeave={(e) => {
        if (isSolid) (e.currentTarget.style.filter = '');
        else { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--p-text-mute)'; }
      }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 7.3: Write the failing BarPose test**

`frontend/src/components/ai/assistant/__tests__/BarPose.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BarPose } from '../poses/BarPose';
import { useAssistantStore } from '@/stores/assistant';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { startAssistantRun } from '@/components/ai/session';

vi.mock('@/components/ai/session', () => ({ startAssistantRun: vi.fn(async () => 'run_x') }));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

beforeEach(() => {
  useAssistantStore.setState({ pose: 'bar', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
  vi.clearAllMocks();
});

describe('<BarPose>', () => {
  it('renders the placeholder, ⌘K hint, and send button', () => {
    render(<BarPose />);
    expect(screen.getByPlaceholderText(/ask anything/i)).toBeInTheDocument();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
    expect(screen.getByLabelText('Send')).toBeInTheDocument();
  });

  it('Enter in input triggers startAssistantRun when a resume is loaded', async () => {
    useResumeStore.setState({
      resume: { id: 'r1', title: 't', alignments: {}, header: { name: 'n', contactLines: [] }, sections: [] } as never,
    } as never);
    render(<BarPose />);
    const input = screen.getByPlaceholderText(/ask anything/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tighten this' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(startAssistantRun).toHaveBeenCalledWith(
      expect.objectContaining({ resumeId: 'r1', userInput: 'tighten this' }),
    );
  });
});
```

- [ ] **Step 7.4: Implement `frontend/src/components/ai/assistant/poses/BarPose.tsx`**

```tsx
// frontend/src/components/ai/assistant/poses/BarPose.tsx
'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { useConversationStore } from '@/stores/conversation';
import { useAssistantStore } from '@/stores/assistant';
import { startAssistantRun } from '@/components/ai/session';
import { Mark } from '../parts/Mark';
import { MiniButton } from '../parts/MiniButton';

/**
 * Bar pose — 520×48 quiet command bar at bottom-center.
 * Per design_handoff_ai_sidebar/README.md §A.
 *
 * No FluidCanvas in this pose — the bar is intentionally a flat dark surface.
 */
export function BarPose() {
  const [input, setInput] = useState('');
  const isStreaming = useAssistantStore((s) => s.activeRunId !== null);

  const onSubmit = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    const resume = useResumeStore.getState().resume;
    if (!resume) {
      useConversationStore.getState().appendMessage({ kind: 'ai-text', content: 'AI 仅在加载简历后可用。' });
      return;
    }
    useConversationStore.getState().appendMessage({ kind: 'user', content: text });
    setInput('');
    try {
      await startAssistantRun({ resumeId: resume.id, userInput: text, selection: [], chatHistory: [] });
    } catch (e) {
      useConversationStore.getState().appendMessage({ kind: 'ai-text', content: `AI 调用失败：${String(e)}` });
    }
  };

  return (
    <motion.div
      layoutId="ai-assistant-shell"
      role="complementary"
      aria-label="AI assistant"
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 520,
        height: 48,
        borderRadius: 12,
        background: 'var(--p-bar-base)',
        border: '1px solid var(--p-border)',
        backdropFilter: 'blur(20px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.35), 0 1px 0 oklch(1 0 0 / 0.04) inset',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 10px 0 12px',
        zIndex: 40,
      }}
    >
      <Mark />
      <span
        style={{
          display: 'inline-flex', gap: 6, alignItems: 'center',
          font: '500 10.5px/1 Inter, sans-serif',
          color: 'var(--p-text-mute)',
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid var(--p-border)',
        }}
      >
        <i style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--p-accent)' }} />
        Editor · v0
      </span>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
        placeholder="Ask anything about your job search…"
        style={{
          flex: 1, border: 0, outline: 'none', background: 'transparent',
          font: '400 13px/1.4 Inter, sans-serif',
          color: 'var(--p-text)',
          minWidth: 0,
        }}
      />
      <span
        style={{
          font: '500 9.5px/1 "JetBrains Mono", monospace',
          letterSpacing: '0.04em',
          color: 'var(--p-text-mute)',
          padding: '3px 5px',
          borderRadius: 5,
          background: 'oklch(0.18 0.025 34 / 0.55)',
          border: '1px solid var(--p-border)',
        }}
      >⌘K</span>
      <MiniButton ariaLabel="Send" onClick={onSubmit} variant="solid">
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
        </svg>
      </MiniButton>
    </motion.div>
  );
}
```

- [ ] **Step 7.5: Verify the test passes**

```bash
cd frontend && npx vitest run src/components/ai/assistant/__tests__/BarPose.test.tsx 2>&1 | tail -10
```
Expected: 2 passed.

- [ ] **Step 7.6: Commit**

```bash
git add frontend/src/components/ai/assistant/parts/Mark.tsx frontend/src/components/ai/assistant/parts/MiniButton.tsx frontend/src/components/ai/assistant/poses/BarPose.tsx frontend/src/components/ai/assistant/__tests__/BarPose.test.tsx
git commit -m "ai-assist: BarPose (Mark + input + ⌘K hint + solid send button)"
```

---

### Task 8: OrbPose

**Files:**
- Create: `frontend/src/components/ai/assistant/poses/OrbPose.tsx`
- Create: `frontend/src/components/ai/assistant/__tests__/OrbPose.test.tsx`

- [ ] **Step 8.1: Write the failing test**

`frontend/src/components/ai/assistant/__tests__/OrbPose.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrbPose } from '../poses/OrbPose';
import { useAssistantStore } from '@/stores/assistant';

beforeEach(() => {
  useAssistantStore.setState({ pose: 'orb', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
});

describe('<OrbPose>', () => {
  it('renders a button labelled "Open assistant" containing a sparkle SVG', () => {
    render(<OrbPose />);
    const btn = screen.getByLabelText('Open assistant');
    expect(btn).toBeInTheDocument();
    expect(btn.querySelector('svg')).toBeTruthy();
  });

  it('clicking the orb sets pose to sidebar', () => {
    render(<OrbPose />);
    fireEvent.click(screen.getByLabelText('Open assistant'));
    expect(useAssistantStore.getState().pose).toBe('sidebar');
  });
});
```

- [ ] **Step 8.2: Implement `frontend/src/components/ai/assistant/poses/OrbPose.tsx`**

```tsx
// frontend/src/components/ai/assistant/poses/OrbPose.tsx
'use client';
import { motion } from 'framer-motion';
import { useAssistantStore } from '@/stores/assistant';

/**
 * Orb pose — 44×44 collapsed pill at bottom-right. Click → sidebar.
 * Per design_handoff_ai_sidebar/README.md §C. No spinning halo (v0 simplification).
 */
export function OrbPose() {
  return (
    <motion.button
      layoutId="ai-assistant-shell"
      type="button"
      aria-label="Open assistant"
      onClick={() => useAssistantStore.getState().setPose('sidebar')}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 44,
        height: 44,
        borderRadius: 999,
        background: 'var(--p-bar-base)',
        border: '1px solid var(--p-border)',
        backdropFilter: 'blur(20px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.30)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        zIndex: 40,
      }}
    >
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="var(--p-accent-warm)" strokeWidth={1.5} aria-hidden>
        <polygon points="12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5" />
      </svg>
    </motion.button>
  );
}
```

- [ ] **Step 8.3: Verify the test passes**

```bash
cd frontend && npx vitest run src/components/ai/assistant/__tests__/OrbPose.test.tsx 2>&1 | tail -8
```
Expected: 2 passed.

- [ ] **Step 8.4: Commit**

```bash
git add frontend/src/components/ai/assistant/poses/OrbPose.tsx frontend/src/components/ai/assistant/__tests__/OrbPose.test.tsx
git commit -m "ai-assist: OrbPose (44px collapsed pill, click → sidebar)"
```

---

### Task 9: SidebarPose shell (header + tabs + scope pill + footer; tab body left for Tasks 10–12)

**Files:**
- Create: `frontend/src/components/ai/assistant/parts/ScopePill.tsx`
- Create: `frontend/src/components/ai/assistant/parts/AgentChips.tsx`
- Create: `frontend/src/components/ai/assistant/parts/QuickChips.tsx`
- Create: `frontend/src/components/ai/assistant/poses/SidebarPose.tsx`
- Create: `frontend/src/components/ai/assistant/__tests__/SidebarPose.test.tsx`

- [ ] **Step 9.1: Implement `ScopePill`**

`frontend/src/components/ai/assistant/parts/ScopePill.tsx`:
```tsx
// frontend/src/components/ai/assistant/parts/ScopePill.tsx
'use client';
import { useAssistantStore } from '@/stores/assistant';

/** Renders nothing if scope is null. Click pill → emit scroll-to-section
 *  custom event (resume editor listens). Click ✕ → clear scope. */
export function ScopePill() {
  const scope = useAssistantStore((s) => s.scope);
  const clearScope = useAssistantStore((s) => s.clearScope);
  if (!scope) return null;
  return (
    <div
      onClick={() => {
        // The resume editor listens for this and scrolls + flashes.
        window.dispatchEvent(new CustomEvent('assistant:scroll-to-block', { detail: { blockId: scope.blockId } }));
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '5px 6px 5px 10px',
        borderRadius: 7,
        background: 'transparent',
        border: '1px solid var(--p-border)',
        font: '500 11px/1.2 Inter, sans-serif',
        color: 'var(--p-text-body)',
        maxWidth: 'fit-content',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--p-surface)'; e.currentTarget.style.borderColor = 'var(--p-border2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--p-border)'; }}
    >
      <span style={{
        font: '500 9px/1 Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.13em',
        color: 'var(--p-text-dim)',
      }}>Scope</span>
      <span>{scope.label}</span>
      <button
        type="button" aria-label="Clear scope"
        onClick={(e) => { e.stopPropagation(); clearScope(); }}
        style={{
          marginLeft: 2, width: 18, height: 18, borderRadius: 5,
          background: 'transparent', border: 0, display: 'grid', placeItems: 'center',
          cursor: 'pointer', color: 'var(--p-text-mute)',
        }}
      >×</button>
    </div>
  );
}
```

- [ ] **Step 9.2: Implement `AgentChips`** (4 chips, active state, no v0 backend wiring beyond store)

`frontend/src/components/ai/assistant/parts/AgentChips.tsx`:
```tsx
// frontend/src/components/ai/assistant/parts/AgentChips.tsx
'use client';
import { useAssistantStore, type AssistantTargetAgent } from '@/stores/assistant';

const CHIPS: Array<{ key: AssistantTargetAgent; label: string; dotVar: string | null }> = [
  { key: 'all',     label: 'All agents',  dotVar: null },
  { key: 'recruit', label: 'Recruiter',   dotVar: 'var(--p-recruit)' },
  { key: 'hm',      label: 'HM',          dotVar: 'var(--p-hm)' },
  { key: 'coach',   label: 'Coach',       dotVar: 'var(--p-coach)' },
];

export function AgentChips() {
  const target = useAssistantStore((s) => s.targetAgent);
  const setTargetAgent = useAssistantStore((s) => s.setTargetAgent);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', font: '500 10.5px/1 Inter, sans-serif' }}>
      <span style={{ color: 'var(--p-text-mute)', marginRight: 2 }}>Ask:</span>
      {CHIPS.map((c) => {
        const active = target === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => setTargetAgent(c.key)}
            aria-pressed={active}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 8px',
              borderRadius: 999,
              border: '1px solid var(--p-border)',
              background: active ? 'var(--p-surface-hi)' : 'transparent',
              color: active ? 'var(--p-text)' : 'var(--p-text-mute)',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {c.dotVar && <i style={{ width: 5, height: 5, borderRadius: 999, background: c.dotVar }} />}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 9.3: Implement `QuickChips`** (clicking a chip fills the input — per b)

`frontend/src/components/ai/assistant/parts/QuickChips.tsx`:
```tsx
// frontend/src/components/ai/assistant/parts/QuickChips.tsx
'use client';
const CHIPS = ['Add metrics', 'Tighten', 'For Stripe APM', 'More technical'];

export function QuickChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {CHIPS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          style={{
            padding: '4px 8px', borderRadius: 999,
            border: '1px solid var(--p-border)', background: 'transparent',
            color: 'var(--p-text-mute)',
            font: '500 10.5px/1 Inter, sans-serif',
            cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--p-surface)'; e.currentTarget.style.color = 'var(--p-text-body)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--p-text-mute)'; }}
        >{c}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 9.4: Write the failing SidebarPose shell test**

`frontend/src/components/ai/assistant/__tests__/SidebarPose.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarPose } from '../poses/SidebarPose';
import { useAssistantStore } from '@/stores/assistant';

vi.mock('next/navigation', () => ({ usePathname: () => '/editor' }));
vi.mock('@/components/landing/FluidCanvas', () => ({ FluidCanvas: () => <div data-testid="fluid" /> }));
vi.mock('../tabs/ChatTab',        () => ({ ChatTab:        () => <div data-testid="tab-chat" /> }));
vi.mock('../tabs/SuggestionsTab', () => ({ SuggestionsTab: () => <div data-testid="tab-sug" /> }));
vi.mock('../tabs/HistoryTab',     () => ({ HistoryTab:     () => <div data-testid="tab-hist" /> }));

beforeEach(() => {
  useAssistantStore.setState({ pose: 'sidebar', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
});

describe('<SidebarPose>', () => {
  it('renders the FluidCanvas, AI assistant header, three tabs, and the input', () => {
    render(<SidebarPose />);
    expect(screen.getByTestId('fluid')).toBeInTheDocument();
    expect(screen.getByText('AI assistant')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /chat/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /suggestions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/reply or @ an agent/i)).toBeInTheDocument();
  });

  it('clicking the dock mini-button switches pose to bar (when allowed)', () => {
    // /editor disallows bar — but the dock button should still call setPose.
    // We don't enforce route restrictions inside this component.
    render(<SidebarPose />);
    fireEvent.click(screen.getByLabelText('Dock to bar'));
    expect(useAssistantStore.getState().pose).toBe('bar');
  });

  it('clicking the minimize mini-button switches pose to orb', () => {
    render(<SidebarPose />);
    fireEvent.click(screen.getByLabelText('Minimize to orb'));
    expect(useAssistantStore.getState().pose).toBe('orb');
  });

  it('switching tabs hides the footer on history', () => {
    render(<SidebarPose />);
    expect(screen.getByPlaceholderText(/reply or @ an agent/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    expect(screen.queryByPlaceholderText(/reply or @ an agent/i)).toBeNull();
  });

  it('quick chip click fills the input but does not send', () => {
    render(<SidebarPose />);
    fireEvent.click(screen.getByText('Tighten'));
    const input = screen.getByPlaceholderText(/reply or @ an agent/i) as HTMLInputElement;
    expect(input.value).toBe('Tighten');
  });
});
```

- [ ] **Step 9.5: Implement `frontend/src/components/ai/assistant/poses/SidebarPose.tsx`**

```tsx
// frontend/src/components/ai/assistant/poses/SidebarPose.tsx
'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { FluidCanvas } from '@/components/landing/FluidCanvas';
import { useAssistantStore, type AssistantTab } from '@/stores/assistant';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { useConversationStore } from '@/stores/conversation';
import { startAssistantRun } from '@/components/ai/session';
import { Mark } from '../parts/Mark';
import { MiniButton } from '../parts/MiniButton';
import { ScopePill } from '../parts/ScopePill';
import { AgentChips } from '../parts/AgentChips';
import { QuickChips } from '../parts/QuickChips';
import { ChatTab } from '../tabs/ChatTab';
import { SuggestionsTab } from '../tabs/SuggestionsTab';
import { HistoryTab } from '../tabs/HistoryTab';

const TABS: AssistantTab[] = ['chat', 'suggestions', 'history'];
const TAB_LABEL: Record<AssistantTab, string> = { chat: 'Chat', suggestions: 'Suggestions', history: 'History' };

/**
 * Sidebar pose — 368px wide, pinned to the right edge from top:56 to bottom:0.
 * Per design_handoff_ai_sidebar/README.md §B.
 */
export function SidebarPose() {
  const tab = useAssistantStore((s) => s.tab);
  const setTab = useAssistantStore((s) => s.setTab);
  const setPose = useAssistantStore((s) => s.setPose);
  const isStreaming = useAssistantStore((s) => s.activeRunId !== null);
  const [input, setInput] = useState('');

  const onSubmit = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    const resume = useResumeStore.getState().resume;
    if (!resume) return;
    useConversationStore.getState().appendMessage({ kind: 'user', content: text });
    setInput('');
    try {
      await startAssistantRun({ resumeId: resume.id, userInput: text, selection: [], chatHistory: [] });
    } catch (e) {
      useConversationStore.getState().appendMessage({ kind: 'ai-text', content: `AI 调用失败：${String(e)}` });
    }
  };

  return (
    <motion.aside
      layoutId="ai-assistant-shell"
      role="complementary" aria-label="AI assistant sidebar"
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'fixed', top: 56, right: 0, bottom: 0,
        width: 368, borderRadius: 0,
        background: 'var(--p-sidebar-base)',
        borderLeft: '1px solid var(--p-border)',
        zIndex: 40,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <FluidCanvas className="absolute inset-0 z-0" forceAnimate speed={1} brightness={1.0} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'oklch(0.08 0.015 34 / 0.55)', zIndex: 1, pointerEvents: 'none' }} />

      {/* Header row */}
      <div style={{ position: 'relative', zIndex: 3, padding: '14px 18px 0', borderBottom: '1px solid var(--p-border)', paddingBottom: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Mark size={24} />
            <span style={{ font: '600 13px/1 Inter, sans-serif', color: 'var(--p-text)' }}>AI assistant</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <MiniButton ariaLabel="New thread" onClick={() => useConversationStore.getState().clearConversation()}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12 5v14M5 12h14" /></svg>
            </MiniButton>
            <MiniButton ariaLabel="Dock to bar" onClick={() => setPose('bar')}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M6 9l6 6 6-6" /></svg>
            </MiniButton>
            <MiniButton ariaLabel="Minimize to orb" onClick={() => setPose('orb')}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M5 12h14" /></svg>
            </MiniButton>
          </div>
        </div>

        {/* Tabs (underline style) */}
        <div role="tablist" style={{ display: 'flex', position: 'relative' }}>
          {TABS.map((t) => {
            const active = t === tab;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t)}
                style={{
                  position: 'relative',
                  padding: '6px 0', marginRight: 18,
                  border: 0, background: 'transparent',
                  font: '500 12px/1 Inter, sans-serif',
                  color: active ? 'var(--p-text)' : 'var(--p-text-mute)',
                  cursor: 'pointer',
                }}
              >
                {TAB_LABEL[t]}
                {active && <i style={{ position: 'absolute', left: 0, right: 0, bottom: -14, height: 1, background: 'var(--p-accent)' }} />}
              </button>
            );
          })}
        </div>

        {/* Scope pill */}
        <div style={{ marginTop: 12 }}><ScopePill /></div>
      </div>

      {/* Body (scrollable) */}
      <div style={{ position: 'relative', zIndex: 3, flex: 1, overflowY: 'auto', padding: '18px 18px 8px' }}>
        {tab === 'chat' && <ChatTab />}
        {tab === 'suggestions' && <SuggestionsTab />}
        {tab === 'history' && <HistoryTab />}
      </div>

      {/* Footer (hidden on history) */}
      {tab !== 'history' && (
        <div style={{ position: 'relative', zIndex: 3, padding: '10px 14px 14px', borderTop: '1px solid var(--p-border)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <AgentChips />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 6px 6px 12px', borderRadius: 10, background: 'var(--p-surface)', border: '1px solid var(--p-border)' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              placeholder="Reply or @ an agent…"
              style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', font: '400 13px/1.4 Inter, sans-serif', color: 'var(--p-text)', minWidth: 0 }}
            />
            <MiniButton ariaLabel="Send" onClick={onSubmit} variant="solid">
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
              </svg>
            </MiniButton>
          </div>
          <QuickChips onPick={(c) => setInput((cur) => cur ? `${cur} ${c}` : c)} />
        </div>
      )}
    </motion.aside>
  );
}
```

- [ ] **Step 9.6: Verify the test passes**

```bash
cd frontend && npx vitest run src/components/ai/assistant/__tests__/SidebarPose.test.tsx 2>&1 | tail -10
```
Expected: 5 passed.

- [ ] **Step 9.7: Commit**

```bash
git add frontend/src/components/ai/assistant/parts/ScopePill.tsx frontend/src/components/ai/assistant/parts/AgentChips.tsx frontend/src/components/ai/assistant/parts/QuickChips.tsx frontend/src/components/ai/assistant/poses/SidebarPose.tsx frontend/src/components/ai/assistant/__tests__/SidebarPose.test.tsx
git commit -m "ai-assist: SidebarPose shell + ScopePill + AgentChips + QuickChips"
```

---

### Task 10: ChatTab + DiffCard

**Files:**
- Create: `frontend/src/components/ai/assistant/parts/DiffCard.tsx`
- Create: `frontend/src/components/ai/assistant/__tests__/DiffCard.test.tsx`
- Create: `frontend/src/components/ai/assistant/tabs/ChatTab.tsx`
- Create: `frontend/src/components/ai/assistant/__tests__/ChatTab.test.tsx`

- [ ] **Step 10.1: Write the failing DiffCard test**

`frontend/src/components/ai/assistant/__tests__/DiffCard.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DiffCard } from '../parts/DiffCard';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';

const sug: Suggestion = {
  id: 'sug_1', runId: 'run_1', agentId: 'PolishAgent', resumeId: 'r1',
  status: 'pending', createdAt: 1,
  source: { kind: 'agent', agentId: 'PolishAgent', runId: 'run_1' },
  op: 'update',
  field: { kind: 'entry.title', id: 'e1' },
  before: 'old title', after: 'new title',
};

beforeEach(() => {
  useSuggestionStore.setState({ byId: { sug_1: sug }, byRun: { run_1: ['sug_1'] } });
});

describe('<DiffCard>', () => {
  it('renders before strikethrough + after plain for an update suggestion', () => {
    render(<DiffCard suggestionId="sug_1" />);
    const beforeEl = screen.getByText('old title');
    const afterEl = screen.getByText('new title');
    expect(beforeEl).toBeInTheDocument();
    expect(afterEl).toBeInTheDocument();
    expect(window.getComputedStyle(beforeEl).textDecorationLine || '').toContain('line-through');
  });

  it('renders Accept / Tweak / Reject buttons for pending suggestions', () => {
    render(<DiffCard suggestionId="sug_1" />);
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tweak' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('Reject calls markStatusLocally + postStatusToBackend', async () => {
    const post = vi.spyOn(useSuggestionStore.getState(), 'postStatusToBackend').mockResolvedValue({ ok: true });
    render(<DiffCard suggestionId="sug_1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('sug_1', 'rejected');
    });
  });

  it('renders nothing if the suggestion id no longer exists', () => {
    useSuggestionStore.setState({ byId: {}, byRun: {} });
    const { container } = render(<DiffCard suggestionId="missing" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 10.2: Implement `frontend/src/components/ai/assistant/parts/DiffCard.tsx`**

```tsx
// frontend/src/components/ai/assistant/parts/DiffCard.tsx
'use client';
import { useState } from 'react';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { applySuggestions } from '@/components/ai/applySuggestion';

interface Props { suggestionId: string }

/**
 * Single shared card used by both Chat (inline diff) and Suggestions tab.
 * Renders an op-aware before/after summary for `update` (others get a one-liner
 * scope summary, no strikethrough — v0).
 */
export function DiffCard({ suggestionId }: Props) {
  const sug = useSuggestionStore((s) => s.byId[suggestionId]) as Suggestion | undefined;
  const [working, setWorking] = useState(false);
  if (!sug) return null;

  const isPending = sug.status === 'pending' || sug.status === 'streaming';

  const onAccept = async () => {
    setWorking(true);
    try { await applySuggestions([sug.id]); } finally { setWorking(false); }
  };
  const onReject = async () => {
    setWorking(true);
    try {
      useSuggestionStore.getState().markStatusLocally(sug.id, 'rejected');
      await useSuggestionStore.getState().postStatusToBackend(sug.id, 'rejected');
    } finally { setWorking(false); }
  };

  const scopeLabel = labelForSuggestion(sug);

  return (
    <div style={{
      background: 'var(--p-surface)', border: '1px solid var(--p-border)',
      borderRadius: 10, overflow: 'hidden', marginTop: 6,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--p-border)' }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', font: '500 11px/1 Inter, sans-serif', color: 'var(--p-text-body)' }}>
          <i style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--p-accent)' }} />
          <span>AI</span>
          <small style={{ color: 'var(--p-text-mute)', fontWeight: 400 }}>· {scopeLabel}</small>
        </div>
        <span style={{
          font: '500 9.5px/1 Inter, sans-serif',
          padding: '3px 7px', borderRadius: 999,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          background: 'var(--p-accent-muted)', color: 'var(--p-accent-warm)',
        }}>{labelForOp(sug)}</span>
      </div>

      {/* Body */}
      <div style={{ padding: '11px 12px', font: '400 12.5px/1.6 Inter, sans-serif', color: 'var(--p-text-body)' }}>
        {sug.op === 'update' && (
          <>
            <span style={{
              display: 'block', color: 'var(--p-text-dim)',
              textDecoration: 'line-through', textDecorationColor: 'var(--p-text-dim)',
              textDecorationThickness: 1, marginBottom: 6,
            }}>{stringify(sug.before)}</span>
            <span style={{ display: 'block', color: 'var(--p-text)' }}>{stringify(sug.after)}</span>
          </>
        )}
        {sug.op === 'insert' && <span>Insert a new {sug.insertedBlock.kind}.</span>}
        {sug.op === 'delete' && <span>Delete the {sug.deletedBlock.kind}.</span>}
        {sug.op === 'move'   && <span>Move block.</span>}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '8px 12px', borderTop: '1px solid var(--p-border)' }}>
        {isPending ? (
          <>
            <button type="button" onClick={onAccept} disabled={working}
              style={{ background: 'var(--p-accent)', color: 'oklch(0.99 0.003 70)', border: 0, padding: '5px 12px', borderRadius: 6, font: '500 11.5px/1 Inter, sans-serif', cursor: 'pointer' }}>
              Accept
            </button>
            <button type="button" onClick={() => { /* v0: noop, hook in tweak flow later */ }} disabled
              style={{ background: 'transparent', color: 'var(--p-text-mute)', border: '1px solid var(--p-border)', padding: '5px 12px', borderRadius: 6, font: '500 11.5px/1 Inter, sans-serif', cursor: 'not-allowed', opacity: 0.6 }}>
              Tweak
            </button>
            <button type="button" onClick={onReject} disabled={working}
              style={{ background: 'transparent', color: 'var(--p-text-mute)', border: 0, padding: '5px 8px', borderRadius: 6, font: '500 11.5px/1 Inter, sans-serif', cursor: 'pointer' }}>
              Reject
            </button>
          </>
        ) : (
          <span style={{ color: 'var(--p-text-mute)', font: '500 11px/1 Inter, sans-serif' }}>{sug.status}</span>
        )}
      </div>
    </div>
  );
}

function labelForOp(s: Suggestion): string {
  switch (s.op) { case 'update': return 'Rewrite'; case 'insert': return 'Insert'; case 'delete': return 'Delete'; case 'move': return 'Move'; }
}
function labelForSuggestion(s: Suggestion): string {
  if (s.op === 'update' && 'kind' in s.field) return `${s.field.kind}`;
  if (s.op === 'insert') return `into ${s.parentId.slice(0, 6)}…`;
  if (s.op === 'delete') return `${s.deletedBlock.kind}`;
  if (s.op === 'move')   return `block ${s.blockId.slice(0, 6)}…`;
  return '';
}
function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
```

- [ ] **Step 10.3: Verify DiffCard test passes**

```bash
cd frontend && npx vitest run src/components/ai/assistant/__tests__/DiffCard.test.tsx 2>&1 | tail -10
```
Expected: 4 passed.

- [ ] **Step 10.4: Write the failing ChatTab test**

`frontend/src/components/ai/assistant/__tests__/ChatTab.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatTab } from '../tabs/ChatTab';
import { useConversationStore } from '@/stores/conversation';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';

const sug: Suggestion = {
  id: 's1', runId: 'r', agentId: 'PolishAgent', resumeId: 'rr',
  status: 'pending', createdAt: 1,
  source: { kind: 'agent', agentId: 'PolishAgent', runId: 'r' },
  op: 'update', field: { kind: 'entry.title', id: 'e1' },
  before: 'a', after: 'b',
};

beforeEach(() => {
  useConversationStore.setState({ messages: [] });
  useSuggestionStore.setState({ byId: { s1: sug }, byRun: { r: ['s1'] } });
});

describe('<ChatTab>', () => {
  it('shows an empty hint when the conversation is empty', () => {
    render(<ChatTab />);
    expect(screen.getByText(/no conversation yet/i)).toBeInTheDocument();
  });
  it('renders user bubbles, ai-text rows, and ai-diff cards in order', () => {
    useConversationStore.getState().appendMessage({ kind: 'user', content: 'tighten' });
    useConversationStore.getState().appendMessage({ kind: 'ai-text', content: 'on it' });
    useConversationStore.getState().appendMessage({ kind: 'ai-diff', suggestionId: 's1' });
    render(<ChatTab />);
    expect(screen.getByText('tighten')).toBeInTheDocument();
    expect(screen.getByText('on it')).toBeInTheDocument();
    // The diff card body shows the before & after of the suggestion
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10.5: Implement `frontend/src/components/ai/assistant/tabs/ChatTab.tsx`**

```tsx
// frontend/src/components/ai/assistant/tabs/ChatTab.tsx
'use client';
import { useConversationStore, type Message } from '@/stores/conversation';
import { DiffCard } from '../parts/DiffCard';

export function ChatTab() {
  const messages = useConversationStore((s) => s.messages);
  if (messages.length === 0) {
    return (
      <p style={{ color: 'var(--p-text-mute)', font: '400 12px/1.5 Inter, sans-serif' }}>
        No conversation yet. Type a request below or click <em>Ask AI</em> on a resume section.
      </p>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {messages.map((m) => <MessageRow key={m.id} m={m} />)}
    </div>
  );
}

function MessageRow({ m }: { m: Message }) {
  if (m.kind === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '82%',
          padding: '9px 14px',
          borderRadius: '14px 14px 4px 14px',
          background: 'var(--p-surface-hi)',
          border: '1px solid var(--p-border2)',
          color: 'oklch(0.82 0.012 52)',
          font: '400 13px/1.55 Inter, sans-serif',
          whiteSpace: 'pre-wrap',
        }}>{m.content}</div>
      </div>
    );
  }
  if (m.kind === 'ai-text') {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <i style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 999, background: 'var(--p-accent)', marginTop: 7 }} />
        <div style={{ font: '400 13px/1.65 Inter, sans-serif', color: 'var(--p-text-body)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
      </div>
    );
  }
  // ai-diff
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <i style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 999, background: 'var(--p-accent)', marginTop: 7 }} />
      <div style={{ flex: 1 }}><DiffCard suggestionId={m.suggestionId} /></div>
    </div>
  );
}
```

- [ ] **Step 10.6: Verify ChatTab test passes**

```bash
cd frontend && npx vitest run src/components/ai/assistant/__tests__/ChatTab.test.tsx 2>&1 | tail -10
```
Expected: 2 passed.

- [ ] **Step 10.7: Commit**

```bash
git add frontend/src/components/ai/assistant/parts/DiffCard.tsx frontend/src/components/ai/assistant/__tests__/DiffCard.test.tsx frontend/src/components/ai/assistant/tabs/ChatTab.tsx frontend/src/components/ai/assistant/__tests__/ChatTab.test.tsx
git commit -m "ai-assist: ChatTab + DiffCard (inline diff card, before strikethrough + after plain)"
```

---

### Task 11: SuggestionsTab

**Files:**
- Create: `frontend/src/components/ai/assistant/tabs/SuggestionsTab.tsx`
- Create: `frontend/src/components/ai/assistant/__tests__/SuggestionsTab.test.tsx`

- [ ] **Step 11.1: Write the failing test**

`frontend/src/components/ai/assistant/__tests__/SuggestionsTab.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SuggestionsTab } from '../tabs/SuggestionsTab';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';

vi.mock('../parts/DiffCard', () => ({ DiffCard: ({ suggestionId }: { suggestionId: string }) => <div data-testid={`card-${suggestionId}`} /> }));

const mk = (id: string, status: Suggestion['status'] = 'pending'): Suggestion => ({
  id, runId: 'r', agentId: 'PolishAgent', resumeId: 'rr',
  status, createdAt: 1,
  source: { kind: 'agent', agentId: 'PolishAgent', runId: 'r' },
  op: 'update', field: { kind: 'entry.title', id: 'e1' },
  before: 'old', after: 'new',
});

beforeEach(() => {
  useSuggestionStore.setState({
    byId: {
      s1: mk('s1'),
      s2: mk('s2'),
      s3: mk('s3', 'rejected'),
    },
    byRun: { r: ['s1', 's2', 's3'] },
  });
});

describe('<SuggestionsTab>', () => {
  it('renders a summary line with the pending count and an Accept-all + Reject-all', () => {
    render(<SuggestionsTab />);
    expect(screen.getByText(/2 pending/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject all/i })).toBeInTheDocument();
  });

  it('renders one DiffCard per pending suggestion (rejected omitted)', () => {
    render(<SuggestionsTab />);
    expect(screen.getByTestId('card-s1')).toBeInTheDocument();
    expect(screen.getByTestId('card-s2')).toBeInTheDocument();
    expect(screen.queryByTestId('card-s3')).toBeNull();
  });

  it('shows an empty state when there are no pending suggestions', () => {
    useSuggestionStore.setState({ byId: { s3: mk('s3', 'rejected') }, byRun: { r: ['s3'] } });
    render(<SuggestionsTab />);
    expect(screen.getByText(/no pending changes/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 11.2: Implement `frontend/src/components/ai/assistant/tabs/SuggestionsTab.tsx`**

```tsx
// frontend/src/components/ai/assistant/tabs/SuggestionsTab.tsx
'use client';
import { useState } from 'react';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { applySuggestions } from '@/components/ai/applySuggestion';
import { DiffCard } from '../parts/DiffCard';

export function SuggestionsTab() {
  const byId = useSuggestionStore((s) => s.byId);
  const all = Object.values(byId) as Suggestion[];
  const pending = all.filter((s) => s.status === 'pending' || s.status === 'streaming');
  const [working, setWorking] = useState(false);

  const onAcceptAll = async () => {
    setWorking(true);
    try { await applySuggestions(pending.map((s) => s.id)); } finally { setWorking(false); }
  };
  const onRejectAll = async () => {
    setWorking(true);
    try {
      for (const s of pending) {
        useSuggestionStore.getState().markStatusLocally(s.id, 'rejected');
        await useSuggestionStore.getState().postStatusToBackend(s.id, 'rejected');
      }
    } finally { setWorking(false); }
  };

  if (pending.length === 0) {
    return (
      <p style={{ color: 'var(--p-text-mute)', font: '400 12px/1.5 Inter, sans-serif' }}>
        No pending changes.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderRadius: 10,
        background: 'var(--p-surface)', border: '1px solid var(--p-border)',
        font: '500 12px/1 Inter, sans-serif', color: 'var(--p-text-body)',
      }}>
        <span>{pending.length} pending</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={onAcceptAll} disabled={working}
            style={{ background: 'var(--p-accent)', color: 'oklch(0.99 0.003 70)', border: 0, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', font: '500 11px/1 Inter, sans-serif' }}>
            Accept all
          </button>
          <button type="button" onClick={onRejectAll} disabled={working}
            style={{ background: 'transparent', color: 'var(--p-text-mute)', border: '1px solid var(--p-border)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', font: '500 11px/1 Inter, sans-serif' }}>
            Reject all
          </button>
        </span>
      </div>

      {pending.map((s) => <DiffCard key={s.id} suggestionId={s.id} />)}
    </div>
  );
}
```

- [ ] **Step 11.3: Verify the test passes**

```bash
cd frontend && npx vitest run src/components/ai/assistant/__tests__/SuggestionsTab.test.tsx 2>&1 | tail -8
```
Expected: 3 passed.

- [ ] **Step 11.4: Commit**

```bash
git add frontend/src/components/ai/assistant/tabs/SuggestionsTab.tsx frontend/src/components/ai/assistant/__tests__/SuggestionsTab.test.tsx
git commit -m "ai-assist: SuggestionsTab (summary + Accept/Reject all + DiffCard list)"
```

---

### Task 12: HistoryTab — "Coming soon" empty state

**Files:**
- Create: `frontend/src/components/ai/assistant/tabs/HistoryTab.tsx`

- [ ] **Step 12.1: Implement (no test — single static block)**

```tsx
// frontend/src/components/ai/assistant/tabs/HistoryTab.tsx
'use client';
export function HistoryTab() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 200, gap: 14,
      color: 'var(--p-text-mute)', textAlign: 'center', padding: 24,
    }}>
      <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="var(--p-accent-muted)" strokeWidth={1.5} aria-hidden>
        <polygon points="12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5" />
      </svg>
      <span style={{ font: '500 13px/1.4 Inter, sans-serif', color: 'var(--p-text-body)' }}>History · Coming soon</span>
      <span style={{ font: '400 11.5px/1.5 Inter, sans-serif' }}>Past conversations will appear here once enabled.</span>
    </div>
  );
}
```

- [ ] **Step 12.2: Commit**

```bash
git add frontend/src/components/ai/assistant/tabs/HistoryTab.tsx
git commit -m "ai-assist: HistoryTab (Coming soon empty state — D4)"
```

---

### Task 13: EditorPage reflow + responsive breakpoint

**Files:**
- Modify: `frontend/src/components/resume/v2/EditorPage.tsx`
- Modify: `frontend/src/app/globals.css` (add the reflow CSS rule)

- [ ] **Step 13.1: Append the reflow CSS to `globals.css`**

```css
/* AI Assistant reflow — when sidebar pose is active AND viewport is wide enough,
   shift the editor canvas left by the sidebar width + gutter. Otherwise unchanged
   (sidebar overlays). Per spike conclusion, LayoutEngine is unaffected because
   the canvas is `width: 8.5in; margin: 0 auto` and just re-centers in the
   narrowed parent. */
.ai-host-reflow {
  transition: padding-right 0.4s var(--p-ease, cubic-bezier(0.16, 1, 0.3, 1));
}
@media (min-width: 1280px) {
  body.ai-sidebar-open .ai-host-reflow { padding-right: 384px; }
}
@media (max-width: 1279.98px) {
  body.ai-sidebar-open .ai-host-reflow { padding-right: 0; }
  /* Narrow viewport: sidebar overlays. A half-opacity backdrop hints "temporary mode". */
  body.ai-sidebar-open::after {
    content: '';
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.18);
    z-index: 39;
    pointer-events: none;
  }
}
```

- [ ] **Step 13.2: Modify `EditorPage.tsx` — add the reflow class + body class effect; remove the inline `<AISidebar />` mount (will be replaced by global `<Assistant />` mounted in AppShell after Task 16)**

Find lines 78–88 (the JSX returned):
```tsx
      <AppShell>
        <EditorTopBar resumeId={resume.id} pageCount={pageCount} />
        <div className="bg-neutral-100 py-6">
          <ResumeDocumentCanvas
            resume={resume}
            template={template}
            mode="edit"
            hideInteractionLayer={hideInteraction}
            onPageCountChange={setPageCount}
          />
        </div>
      </AppShell>
      <AISidebar />
```

Replace with:
```tsx
      <AppShell>
        <EditorTopBar resumeId={resume.id} pageCount={pageCount} />
        <div className="bg-neutral-100 py-6 ai-host-reflow">
          <ResumeDocumentCanvas
            resume={resume}
            template={template}
            mode="edit"
            hideInteractionLayer={hideInteraction}
            onPageCountChange={setPageCount}
          />
        </div>
      </AppShell>
      {/* <AISidebar /> moved to global <Assistant /> mount in AppShell. */}
```

Also remove the import:
```tsx
import { AISidebar } from '@/components/ai/AISidebar';
```

And **add** at the top of `EditorPage` body (right after the existing `useEffect` for hydrate, around line 47):

```tsx
  // Add a body class while sidebar pose is active so globals.css can reflow / overlay.
  useEffect(() => {
    const unsub = useAssistantStore.subscribe((s) => {
      const open = s.pose === 'sidebar';
      document.body.classList.toggle('ai-sidebar-open', open);
    });
    return () => { unsub(); document.body.classList.remove('ai-sidebar-open'); };
  }, []);
```

Add the import:
```tsx
import { useAssistantStore } from '@/stores/assistant';
```

- [ ] **Step 13.3: Verify v2 tests still pass**

```bash
cd frontend && npx vitest run src/components/resume/v2 2>&1 | tail -5
```
Expected: count ≥ baseline (Task 0.3). The `<AISidebar />` removal will make the existing AISidebar test moot but it's still in the suite and reads from `aiSidebarUI` — that store still exists at this point in the plan, so the test continues to pass against the legacy component file (which is still on disk). Task 16 deletes the file + test.

- [ ] **Step 13.4: Commit**

```bash
git add frontend/src/app/globals.css frontend/src/components/resume/v2/EditorPage.tsx
git commit -m "ai-assist: EditorPage reflow (padding-right 384px on ≥1280, overlay on narrow)"
```

---

### Task 14: Section Ask AI pill in InteractionLayer

**Files:**
- Create: `frontend/src/components/ai/assistant/AskAIPill.tsx`
- Create: `frontend/src/components/ai/assistant/__tests__/AskAIPill.test.tsx`
- Modify: `frontend/src/components/resume/v2/layers/InteractionLayer.tsx`

- [ ] **Step 14.1: Write the failing AskAIPill test**

`frontend/src/components/ai/assistant/__tests__/AskAIPill.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AskAIPill } from '../AskAIPill';
import { useAssistantStore } from '@/stores/assistant';

beforeEach(() => {
  useAssistantStore.setState({ pose: 'bar', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
});

describe('<AskAIPill>', () => {
  it('renders a button with "Ask AI"', () => {
    render(<AskAIPill blockId="b1" label="Experience" />);
    expect(screen.getByRole('button', { name: /ask ai/i })).toBeInTheDocument();
  });
  it('clicking → openSidebarWithScope', () => {
    render(<AskAIPill blockId="b1" label="Experience" />);
    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }));
    const s = useAssistantStore.getState();
    expect(s.pose).toBe('sidebar');
    expect(s.scope).toEqual({ blockId: 'b1', label: 'Experience' });
  });
});
```

- [ ] **Step 14.2: Implement `frontend/src/components/ai/assistant/AskAIPill.tsx`**

```tsx
// frontend/src/components/ai/assistant/AskAIPill.tsx
'use client';
import { useAssistantStore } from '@/stores/assistant';

interface Props { blockId: string; label: string }

/** Hover-revealed pill that lives inside the v2 InteractionLayer for section
 *  blocks (top-right). Clicking opens the sidebar with that section as scope. */
export function AskAIPill({ blockId, label }: Props) {
  return (
    <button
      type="button"
      aria-label={`Ask AI about ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        useAssistantStore.getState().openSidebarWithScope({ blockId, label });
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 8px', borderRadius: 999,
        border: '1px solid var(--p-border)',
        background: 'oklch(0.18 0.022 34 / 0.55)',
        color: 'var(--p-text-mute)',
        font: '500 10.5px/1 Inter, sans-serif',
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
        pointerEvents: 'auto',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--p-surface-hi)'; e.currentTarget.style.color = 'var(--p-text-body)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'oklch(0.18 0.022 34 / 0.55)'; e.currentTarget.style.color = 'var(--p-text-mute)'; }}
    >
      <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2}>
        <polygon points="12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5" />
      </svg>
      Ask AI
    </button>
  );
}
```

- [ ] **Step 14.3: Verify AskAIPill test passes**

```bash
cd frontend && npx vitest run src/components/ai/assistant/__tests__/AskAIPill.test.tsx 2>&1 | tail -8
```
Expected: 2 passed.

- [ ] **Step 14.4: Modify `frontend/src/components/resume/v2/layers/InteractionLayer.tsx` — add the pill on section blocks**

Open the file. Locate the existing per-atom hover wrapper (around lines 137–159). It currently renders `<DragHandle ... />` only. Extend it so when `block.kind === 'section'` we *also* render `<AskAIPill>` at the right edge of the section heading row.

The minimal-diff approach: add a sibling element, positioned to the right of the canvas-root (since the wrapper itself is positioned at `left: coord.left - 28`), so the pill sits at the section heading's right edge.

After the existing import block, add:
```tsx
import { AskAIPill } from '@/components/ai/assistant/AskAIPill';
```

Find:
```tsx
            <DragHandle
              block={block}
              onDropIndicator={setDropPayload}
              onDoubleClick={(e) => {
                e.stopPropagation();
                useAISidebarUIStore.getState().open(aiScopeForBlock(block));
              }}
            />
```

Wrap it in a fragment that also renders the section-only pill (only when `block.kind === 'section'`). The pill needs `coord.left + contentWidth - pillWidth` positioning, but since the wrapper is at `left: coord.left - 28`, we put the pill in a separate absolutely-positioned sibling computed off the canvas-root. Restructure as:

Replace the entire `atoms.map(...)` body (the inner `return` block) with:

```tsx
        return (
          <>
            <div
              key={atom.id}
              onMouseEnter={() => setHoveredAtomId(atom.id)}
              onMouseLeave={() => setHoveredAtomId(prev => (prev === atom.id ? null : prev))}
              style={{
                position: 'absolute',
                top: coord.top,
                left: coord.left - 28,
                opacity: isHovered ? 1 : 0,
                transition: 'opacity 0.15s',
                pointerEvents: isHovered ? 'auto' : 'none',
              }}
            >
              <DragHandle
                block={block}
                onDropIndicator={setDropPayload}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  useAISidebarUIStore.getState().open(aiScopeForBlock(block));
                }}
              />
            </div>
            {block.kind === 'section' && (
              <div
                key={`pill-${atom.id}`}
                onMouseEnter={() => setHoveredAtomId(atom.id)}
                onMouseLeave={() => setHoveredAtomId(prev => (prev === atom.id ? null : prev))}
                style={{
                  position: 'absolute',
                  top: coord.top - 4,
                  // Right edge of canvas content (assume 8.5in - margins is exposed via CSS var; fallback to template.page.contentWidthPx)
                  left: coord.left + (template.page.contentWidthPx ?? 720) - 70,
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.15s',
                  pointerEvents: isHovered ? 'auto' : 'none',
                }}
              >
                <AskAIPill blockId={block.id} label={`Section ${block.id.slice(0, 6)}`} />
              </div>
            )}
          </>
        );
```

> **Note:** the `template.page.contentWidthPx` access requires `template` to be in scope. It is — the loop is already inside the InteractionLayer body which destructures `template` from props. If the property name differs in the actual `NormalizedTemplate` type, the implementer must look at the existing `getAtomAbsoluteCoord(layout, 'edit', template)` call to find the correct width field and substitute.

- [ ] **Step 14.5: Verify v2 tests + new pill test still pass**

```bash
cd frontend && npx vitest run src/components/resume/v2 src/components/ai/assistant 2>&1 | tail -10
```
Expected: counts ≥ baseline; AskAIPill test 2 passed.

- [ ] **Step 14.6: Commit**

```bash
git add frontend/src/components/ai/assistant/AskAIPill.tsx frontend/src/components/ai/assistant/__tests__/AskAIPill.test.tsx frontend/src/components/resume/v2/layers/InteractionLayer.tsx
git commit -m "ai-assist: AskAIPill on section hover (additive overlay in InteractionLayer)"
```

---

### Task 15: ⋮⋮ overlay migration to useAssistantStore + remove old store + remove old AISidebar component

**Files:**
- Modify: `frontend/src/components/resume/v2/atoms/EntryRowInteractionOverlay.tsx`
- Modify: `frontend/src/components/resume/v2/atoms/HeaderRowInteractionOverlay.tsx`
- Modify: `frontend/src/components/resume/v2/atoms/BulletInteractionOverlay.tsx`
- Modify: `frontend/src/components/resume/v2/layers/InteractionLayer.tsx`
- Delete: `frontend/src/stores/aiSidebarUI.ts`
- Delete: `frontend/src/components/ai/AISidebar.tsx`
- Delete: `frontend/src/components/ai/AISidebarRow.tsx`
- Delete: `frontend/src/components/ai/__tests__/AISidebar.test.tsx`

- [ ] **Step 15.1: In each of the 3 row overlays + InteractionLayer, swap the call. Find:**

```tsx
useAISidebarUIStore.getState().open(<id>)
```
Replace with (compute a useful label):
```tsx
useAssistantStore.getState().openSidebarWithScope({ blockId: <id>, label: <id>.slice(0, 8) })
```

Update the import line in each file:
```tsx
import { useAISidebarUIStore } from '@/stores/aiSidebarUI';
```
becomes:
```tsx
import { useAssistantStore } from '@/stores/assistant';
```

- [ ] **Step 15.2: Run grep to confirm no caller of the old store remains**

```bash
grep -rn "useAISidebarUIStore" frontend/src 2>/dev/null
```
Expected: only matches inside `frontend/src/stores/aiSidebarUI.ts` itself (the file is about to be deleted) and possibly the legacy `frontend/src/components/layout/AIChatPanel/index.tsx` (which is deleted in Task 16).

If any other file matches, fix and re-run.

- [ ] **Step 15.3: Delete the legacy files**

```bash
rm frontend/src/stores/aiSidebarUI.ts
rm frontend/src/components/ai/AISidebar.tsx
rm frontend/src/components/ai/AISidebarRow.tsx
rm frontend/src/components/ai/__tests__/AISidebar.test.tsx
```

> If `AIChatPanel/index.tsx` still references `useAISidebarUIStore`, either revert this delete (keep store one more task) or jump ahead and execute Task 16 first. The implementer may merge Task 15 + 16 into one commit if they prefer; either ordering is fine as long as the final state is consistent.

- [ ] **Step 15.4: Run v2 + ai tests + build**

```bash
cd frontend && npx vitest run src/components/resume/v2 src/components/ai 2>&1 | tail -10
npx tsc --noEmit 2>&1 | tail -10
```
Expected: counts ≥ baseline, no TS errors.

- [ ] **Step 15.5: Commit**

```bash
git add -A frontend/src/components/resume/v2/atoms frontend/src/components/resume/v2/layers/InteractionLayer.tsx frontend/src/stores frontend/src/components/ai
git commit -m "ai-assist: migrate ⋮⋮ overlays to useAssistantStore + delete legacy AISidebar/aiSidebarUI"
```

---

### Task 16: Mount `<Assistant />` in AppShell, delete legacy AIChatPanel + useAiPanelStore

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Delete: entire `frontend/src/components/layout/AIChatPanel/` directory
- Delete: `frontend/src/stores/aiPanel.ts`

- [ ] **Step 16.1: Modify `AppShell.tsx`**

Find:
```tsx
import { AIChatPanel } from "./AIChatPanel";
```
Replace with:
```tsx
import { Assistant } from "@/components/ai/assistant";
```

Find:
```tsx
<AIChatPanel />
```
Replace with:
```tsx
<Assistant />
```

- [ ] **Step 16.2: Delete the legacy directory + store**

```bash
rm -rf frontend/src/components/layout/AIChatPanel
rm frontend/src/stores/aiPanel.ts
```

- [ ] **Step 16.3: Grep for any straggler reference**

```bash
grep -rn "useAiPanelStore\|AIChatPanel" frontend/src 2>/dev/null
```
Expected: zero matches.

- [ ] **Step 16.4: Build + tests**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -10
npx vitest run 2>&1 | tail -8
```
Expected: zero TS errors, all tests pass.

- [ ] **Step 16.5: Commit**

```bash
git add frontend/src/components/layout/AppShell.tsx
git add -A frontend/src/components/layout/AIChatPanel frontend/src/stores/aiPanel.ts
git commit -m "ai-assist: mount <Assistant /> in AppShell, delete legacy AIChatPanel + useAiPanelStore"
```

---

### Task 17: Backend `targetAgent` field — accept and ignore

**Files:**
- Modify: `api/routes/ai.py`

- [ ] **Step 17.1: Modify `RunRequest` (around line 29)**

Find:
```python
class RunRequest(BaseModel):
    resumeId: str
    userInput: str
```
Add a new field after `chatHistory`:
```python
class RunRequest(BaseModel):
    resumeId: str
    userInput: str
    selection: list = []
    chatHistory: list = []
    # v0: persona routing not implemented; field is accepted for forward
    # compatibility with the frontend agent target chips. Backend ignores it.
    targetAgent: str | None = None
```

(Keep the existing `selection` and `chatHistory` lines as-is; only add `targetAgent`.)

- [ ] **Step 17.2: Smoke test (manual)**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
curl -sS -X POST http://localhost:8000/api/ai/run \
  -H "Content-Type: application/json" \
  -d '{"resumeId":"nonexistent","userInput":"hi","selection":[],"chatHistory":[],"targetAgent":"hm"}' | head -200
```
Expected: 404 (resume not found) — confirms the field was accepted by the model (would 422 otherwise).

- [ ] **Step 17.3: Run existing pytest sanity**

```bash
pytest -x 2>&1 | tail -5
```
Expected: same pass count as Task 0.3 baseline. (No new tests written here — this is a single-line, ignored field.)

- [ ] **Step 17.4: Commit**

```bash
git add api/routes/ai.py
git commit -m "ai-assist: RunRequest accepts optional targetAgent (v0: ignored)"
```

---

### Task 18: Full regression sweep

**Files:** none

- [ ] **Step 18.1: v2 regression non-negotiable floor**

```bash
cd frontend && npx vitest run src/components/resume/v2 2>&1 | tail -5
```
Expected: count ≥ baseline (Task 0.3).

- [ ] **Step 18.2: AI surface tests**

```bash
cd frontend && npx vitest run src/components/ai src/stores 2>&1 | tail -5
```
Expected: all pass; new tests authored in Tasks 2,3,4,5,7,8,9,10,11,14 are included.

- [ ] **Step 18.3: TS + lint + build**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -5
npx next lint 2>&1 | tail -10
npx next build 2>&1 | tail -10
```
Expected: zero TS errors. Lint warnings allowed only if pre-existing (compare to git baseline). Build succeeds.

- [ ] **Step 18.4: Backend tests**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
pytest 2>&1 | tail -5
```
Expected: same pass count as baseline.

- [ ] **Step 18.5: No commit — this is verification only.**

---

### Task 19: AC walkthrough (manual smoke + scripted assertions)

**Files:** none (manual verification + ad-hoc tests as needed)

For each AC item below, run the action and confirm the observation. Report each as ✅ / ❌ in the task summary.

- [ ] **AC.a — `/editor` defaults to sidebar**
  Action: load `http://localhost:3000/editor/<some_resume_id>` in a fresh tab.
  Observation: assistant renders as sidebar pinned to the right edge, with FluidCanvas background. No bottom bar visible.

- [ ] **AC.b — Reflow on wide viewport, hit-region intact**
  Action: with viewport ≥ 1280px, sidebar open. Hover a bullet's ⋮⋮ handle.
  Observation: handle highlights at the *new* canvas position (canvas has shifted left). Drag a bullet to reorder — drop indicator appears at the correct row.

- [ ] **AC.c — Both ⋮⋮ double-click and section Ask AI pill open the sidebar**
  Action 1: double-click any ⋮⋮ handle. Sidebar opens with scope set to that block.
  Action 2: hover over a section heading row (e.g. "EXPERIENCE"). An "Ask AI" pill appears at the right. Click it. Sidebar opens with scope = that section.

- [ ] **AC.d — Cmd+\ toggles sidebar↔orb on /editor; bar↔(itself) elsewhere**
  Action 1: on `/editor`, press Cmd+\ → pose flips to orb. Press again → back to sidebar.
  Action 2: navigate to `/` (or other route). Sidebar collapses; bar appears. Cmd+\ does nothing visible (only one allowed pose).

- [ ] **AC.e — Chat input runs AI and shows narration + inline diff card; Suggestions tab mirrors; Accept syncs both surfaces**
  Action: in the sidebar input, type `tighten my first bullet` and press Enter.
  Observation 1: a user bubble appears.
  Observation 2: as backend runs, ai-text rows appear with narration.
  Observation 3: when a suggestion streams, an inline diff card appears in Chat tab (before strikethrough, after plain).
  Observation 4: switch to Suggestions tab — same card present.
  Observation 5: click Accept on either surface — card status flips on both, the resume canvas updates.

- [ ] **AC.f — Orb pose round-trip preserves conversation**
  Action: with sidebar open and conversation present, click the `−` button → pose=orb. Click the orb → pose=sidebar.
  Observation: same chat / scope / tab state, no draft loss.

- [ ] **AC.g — Pose change does not sever in-flight SSE**
  Action: send a long-running prompt. Mid-run, click `−` to collapse to orb. Wait. Click orb to re-open.
  Observation: any narrations / suggestions that arrived while collapsed are present in the chat thread. The `activeRunId` remains set during the collapsed period; clears on `run.completed`.

- [ ] **AC.h — Sidebar closed → host layout byte-identical to today** (§ 0.5 rule #3)
  Action: navigate to `/editor`, then press `−` twice (sidebar→orb), then click the orb to bring sidebar back.
  Observation: when in orb pose, `<body>` no longer carries the `ai-sidebar-open` class; the canvas re-centers without the right padding; existing v2 layout matches a pre-change screenshot.

- [ ] **AC.i — Narrow viewport (<1280px) overlays instead of reflowing**
  Action: resize the viewport to 1100px wide. Sidebar still opens; canvas does not shift; a half-opacity backdrop appears behind the sidebar.

- [ ] **AC.j — `useConversationStore` migrate path doesn't crash on legacy localStorage**
  Action: in DevTools, set `localStorage.setItem('careerops-ai-conversation', JSON.stringify({ state: { messages: [{ id: 'x', role: 'ai', content: 'hello', createdAt: 1 }] }, version: 1 }))`. Reload.
  Observation: chat tab shows "hello" rendered as an ai-text message; no console errors.

- [ ] **Step 19 outcome:** Report each AC as ✅ / ❌ and any followups. Do not commit (this is verification only).

---

### Task 20: Final code review

- [ ] **Step 20.1: Dispatch the code-reviewer subagent** with the diff of the entire feature branch since the start of this plan.

```bash
git log --oneline feature/resume-editor-v2 ^$(git merge-base feature/resume-editor-v2 main) | head -30
```

The subagent prompt should include:
- Path to this plan (`docs/superpowers/plans/2026-04-28-ai-assistant-three-poses.md`)
- Path to the design source of truth (`frontend/design_handoff_ai_sidebar/README.md`)
- Path to the original spec § 0.5 (`docs/superpowers/specs/2026-04-28-resume-editor-ai-design.md`)
- The instruction: confirm zero regression of § 0.5 mandate, confirm visual fidelity to design README, flag any silent behavior change in the chat / sidebar surface.

- [ ] **Step 20.2: Triage reviewer findings**

For each finding, classify: BLOCKER (must fix before declaring complete) / NIT (defer to followup task) / FALSE_POSITIVE (justify in reply).

- [ ] **Step 20.3: If BLOCKERs exist, fix in a new commit (not amend), retest, re-review.**

- [ ] **Step 20.4: Final summary report**

Report:
- Total commits added since branch divergence
- Final v2 test count vs baseline
- Final AI surface test count
- AC walkthrough pass/fail per item
- Followups (NITs deferred + spec § 0.5 monitoring items)
- Whether the plan is shippable as-is

---

## End-of-plan self-review

(Plan author's own review against spec — see writing-plans §Self-Review.)

**1. Spec coverage:**

Each handoff README requirement maps to a task:
- §A Bar pose → Task 7
- §B Sidebar layout (header / tabs / scope / body / footer) → Task 9 + Tasks 10–12
- §C Orb pose → Task 8
- Pose transitions (`layoutId`) → Task 6 (`<Assistant>`) + each pose component
- Contrail (decorative) → **NOT in this plan** (per design README L196: "if using layoutId, the contrail is decorative-only and can be skipped"). Acceptable v0 omission, follow-up.
- Triggers (Cmd+\, Ask AI pill, dock/minimize, orb click) → Task 5, Task 14, Task 9, Task 8
- Resume section hover affordance (drag handle + Ask AI pill) → drag handle exists pre-plan; Ask AI pill = Task 14
- Tab buttons + scope pill + diff cards → Task 9 + Task 10 + Task 11
- Toast hint → **explicitly skipped per decision f**
- State management interface → Task 2
- Design tokens → Task 1
- Three-agent palette dots in chips → Task 9 (parts/AgentChips.tsx). AI message rows do NOT show per-agent dot — explicitly per D3.

D-decisions:
- D1 (no bar in /editor) → Task 5 `allowedPosesForRoute`
- D2 (reflow ≥1280, overlay <1280) → Task 13
- D3 (persona = chrome only) → Task 9 chips + Task 17 backend ignore
- D4 (History "Coming soon") → Task 12
- D5 (⋮⋮ + Ask AI pill both work) → Task 14 + Task 15
- D6 (inline diff card) → Task 4 (SSE → ai-diff message) + Task 10 (DiffCard component)

§0.5 mandate:
- Rule 1 (DragController etc untouched) — confirmed by file map (none modified)
- Rule 2 (TipTap soft-lock) — untouched
- Rule 3 (sidebar closed = same layout) — verified by AC.h
- Rule 4 (Suggestion union frozen) — only conversation Message extended
- Rule 5 (store action signatures frozen) — useResumeStore not touched
- Rule 7 (additive only) — every new file is additive; deletes are of legacy stores being replaced
- Rule 6 (Anthropic only, .env) — not modified

**2. Placeholder scan:** no TODO / TBD / "fill in" / "appropriate handling" found in step bodies.

**3. Type consistency:**
- `AssistantPose`, `AssistantTab`, `AssistantTargetAgent`, `AssistantScope` — used identically across Task 2, 5, 6, 7, 8, 9, 14, 15.
- `Message` discriminated union — `kind: 'user' | 'ai-text' | 'ai-diff'` — consistent across Tasks 3, 4, 10.
- `startAssistantRun(args)` — same signature in Tasks 4 (definition), 7 (BarPose), 9 (SidebarPose).
- `openSidebarWithScope({ blockId, label })` — identical signature in Tasks 2, 14, 15.
