# Global AI Panel — Design Spec

**Date:** 2026-04-19
**Status:** Approved direction, pending implementation
**Owner:** CareerOps Pro frontend
**Replaces:** `frontend/src/components/layout/AIChatPanel.tsx` (right-side drawer)

---

## Goal

Build a single global AI panel that:
1. Is **always pullable** from any page (no per-page AI variants)
2. Has **substantial display area** when active (not a tiny customer-service widget)
3. **Does not push or shrink page content** when opened (overlays instead of resizing)
4. Maintains **one continuous conversation thread** across pages
5. Adapts **behavior** (mode, system prompt) based on the current page via `pageContext`
6. Feels **native to the app**, not like a third-party chatbot widget

---

## Three Heights (one component, three states)

```
Collapsed (38px)     Compact (180px)        Expanded (88vh)
─────────────        ──────────────         ──────────────
[ Ask anything ⌘J ]  [ last message       ] [ full conversation ]
                     [ user reply         ] [                   ]
                     [ Ask anything ⌘J  ] [ ...               ]
                                            [                   ]
                                            [ Ask anything    ]
```

**Defaults:**
- First-time users land on **Compact** (180px)
- State persists across pages (Zustand store)
- Mock Interview page forces **Expanded** (the page IS the AI conversation)

---

## State Machine

| From | To | Trigger |
|------|------|---------|
| Collapsed | Compact | Click input bar / ⌘J / focus |
| Compact | Collapsed | Click ⌄ / ⌘↓ / Esc |
| Compact | Expanded | Click ⤢ / ⌘↑ / drag top edge up / ⌘↵ in input |
| Expanded | Compact | Click ⤡ / Esc / drag top edge down / click outside panel area |
| Compact | Expanded (forced) | Navigate to Mock Interview page |

---

## Layout Specs

### Collapsed (38px tall, full viewport width)

```
┌────────────────────────────────────────────────────────┐
│ ✦  Ask anything about your job search...    ⌘J  ⌃    │
└────────────────────────────────────────────────────────┘
```

- Full-width bar pinned to bottom of viewport
- Background: `oklch(0.13 0.025 34 / 0.94)` with `backdrop-filter: blur(10px)`
- Top border: `1px solid oklch(0.28 0.018 35 / 0.5)`
- Left content: small terracotta brand square + placeholder text
- Right content: `⌘J` keyboard hint badge + `⌃` expand chevron
- Click anywhere → expand to Compact

### Compact (180px tall, full viewport width)

```
┌────────────────────────────────────────────────────────┐
│ ✦ AI · Resume Editor mode              ⌘↑ expand  ⤢ ⌄│
├────────────────────────────────────────────────────────┤
│ • AI: 你的 Snapbrillia 经历只有 2 条 bullet…         │
│                                  [ user reply ]        │
├────────────────────────────────────────────────────────┤
│ Ask anything...                                  ⌘J   │
└────────────────────────────────────────────────────────┘
```

- 180px tall, full viewport width
- Three regions:
  - **Header (28px):** mode label + control buttons (collapse, expand)
  - **Message area (~110px):** scrollable, shows last 1-2 message exchanges
  - **Input (42px):** prominent text input with ⌘J hint
- Same background and border treatment as Collapsed
- Drag top edge up → smoothly grows to Expanded (springy)

### Expanded (88vh tall, full viewport width)

```
┌────────────────────────────────────────────────────────┐
│ Page content visible above (12vh strip)                │
├────────────────────────────────────────────────────────┤
│ ✦ AI · Resume Editor mode · Stripe Backend SWE  Esc ⤡│
├────────────────────────────────────────────────────────┤
│                                                        │
│  Full conversation history with proper formatting      │
│  Action chips: [ 帮我改 #1 ] [ 帮我改 #2 ]            │
│  Tool call indicators                                  │
│                                                        │
├────────────────────────────────────────────────────────┤
│ Ask anything...                                  ↵ Send│
└────────────────────────────────────────────────────────┘
```

- 88vh tall (12vh strip of page content visible above for orientation)
- Drop-shadow above panel: `0 -16px 40px rgba(0,0,0,0.2)`
- Background: same as Compact, no transparency change
- Input area gains "Send" button affordance
- Suggestion chips become tappable
- Tool call streaming events visible (e.g., "🔍 fetching applications…")

---

## Per-Page Behavior

| Page | Default state | Mode label | pageContext |
|------|--------------|------------|-------------|
| Dashboard | Compact | `AI · Dashboard mode` | "首页总览，最近 3 个动态" |
| Resume Editor | Compact | `AI · Resume Editor mode` | "正在编辑「{filename}」简历，目标 {jobTitle}" |
| Job Search | Compact | `AI · Job Search mode` | "正在浏览 {filterSummary}" |
| Applications | Compact | `AI · Applications mode` | "查看 {n} 条申请记录" |
| Mock Interview | **Expanded (forced)** | `AI · Interview mode` | "正在练习 {company} {round} 面试" |
| Insights | Compact | `AI · Insights mode` | "查看个性化情报" |

The mode label is built from `pageContext.page`. The system prompt receives `pageContext.summary` plus user prefs and is rebuilt each time `pageContext` changes.

---

## Interaction Details

### Keyboard
- `⌘J` (Cmd+J on Mac, Ctrl+J on Windows): Toggle to Compact (from Collapsed) or expand to Expanded (from Compact)
- `⌘↑`: Force expand
- `⌘↓` / `Esc`: Step down one level (Expanded → Compact, Compact → Collapsed)
- `⌘↵` while typing in input: Send message AND expand to Expanded (so you can see full reply)

### Mouse
- Click anywhere in Collapsed bar → Compact
- Click ⤢ in Compact header → Expanded
- Click ⤡ or click outside panel in Expanded → Compact
- Click ⌄ in Compact header → Collapsed
- Drag top edge: smooth resize between states (with snap points at 38 / 180 / Expanded)

### Animation
- Spring physics: `{ type: "spring", stiffness: 380, damping: 38 }`
- Reduced-motion: instant transition
- Backdrop dim only in Expanded mode (subtle, ~8% opacity over content above)

---

## Component Architecture

```
AIChatPanel.tsx (refactor existing)
├── stores/aiPanel.ts (new) — Zustand
│     state: 'collapsed' | 'compact' | 'expanded'
│     methods: toggle, expand, collapse, setState
│
├── stores/pageContext.ts (new) — Zustand
│     state: PageContext | null
│     methods: setPageContext, clearPageContext
│
├── stores/conversation.ts (new) — Zustand persisted to localStorage
│     state: messages[], currentMessageId
│     methods: addMessage, clearConversation
│
├── AIChatPanel/
│   ├── index.tsx — entry, reads aiPanel state, renders one of:
│   ├── PanelCollapsed.tsx (38px bar)
│   ├── PanelCompact.tsx (180px)
│   ├── PanelExpanded.tsx (88vh)
│   ├── MessageList.tsx — shared between Compact (last 2) and Expanded (full)
│   ├── MessageInput.tsx — shared input component
│   └── ModeIndicator.tsx — reads pageContext, renders mode label
│
└── hooks/usePageContext.ts (new) — page-level hook
      Each page calls usePageContext({ page, summary, data }) on mount
```

---

## Removed / Changed

- **Remove** `AppShell.tsx` `marginRight: 368` content shift logic — panel no longer pushes content
- **Remove** the right-edge fixed trigger tab — replaced by bottom Collapsed bar
- **Keep** the existing FluidCanvas as decoration option for Expanded mode (low opacity, behind messages)
- **Keep** `prefsToSystemPrompt()` from `stores/prefs.ts` — feeds into system prompt
- **Defer** real backend chat API integration to a separate spec (this spec is UI only with mock responses)

---

## What This Spec Does NOT Cover

- Backend `/chat` endpoint and tool-calling implementation
- LangGraph multi-agent orchestration
- Inline AI suggestions on PDF resume sections (Cursor-style ghost text) — separate spec
- Mock Interview's full-screen interview UI — separate spec
- Action chips' actual handlers (they will be visual placeholders for now)

---

## Acceptance Criteria

A user opens any page (e.g., Resume Editor) and:

1. Sees a Compact AI panel pinned to the bottom (180px tall) with a mode label
2. Can type a message in the input and send it
3. Sees a mock AI response appear in the message list within Compact view
4. Can click ⤢ to expand to Expanded mode (88vh) with smooth animation
5. Can collapse to Collapsed mode (38px bar) by clicking ⌄
6. Page content never shifts horizontally when toggling panel states
7. State persists when navigating between pages
8. Mock Interview page forces Expanded on mount, restores previous user state on unmount

---

## Open Questions (defer to writing-plans)

- Should Collapsed bar show unread indicator if AI generated a proactive nudge?
- Drag-to-resize: enable on first iteration or defer?
- How to handle very long pageContext summaries that don't fit in mode label?
