# Handoff: AI Assistant — Bar → Sidebar → Orb

## Overview

A single AI-assistant surface for a job-search / resume-editor product. The same assistant element morphs between three poses depending on context:

1. **Bar** — a Cmd+K-style command bar at the bottom-center of the screen. Default on most pages.
2. **Sidebar** — a tall, dockable panel pinned to the right edge of the viewport. Appears in the Resume Editor (e.g. when the user clicks an "Ask AI" pill on a resume section, or hits Cmd+\). Holds chat, suggestions queue, and history.
3. **Orb** — a 44px collapsed pill at the bottom-right corner. Lets the user hide the sidebar without losing the thread; clicking the orb brings the sidebar back.

The key idea: it is **one element with one identity**. It physically flies between positions (with a thin contrail) so the user understands the bar and the sidebar are the same assistant.

The assistant orchestrates **three agents** (Recruiter, Hiring Manager, Career Coach), color-coded as small dots throughout. The user can address all of them at once or @-mention one.

## About the Design Files

The files in this bundle are **design references created in HTML/CSS/JS** — prototypes showing intended look and behavior, not production code to copy directly.

Your task: **recreate these designs inside the target codebase** using whatever framework, component library, and design tokens are already established (the project uses Next.js + Tailwind + shadcn/ui + Framer Motion + Zustand). The codebase already ships a global `<AIChatPanel>` (see `src/components/layout/AIChatPanel.tsx`) — these mocks are the **expanded, sidebar-mode version** of that same component, plus the bar and orb poses.

In particular:
- The HTML uses raw CSS with `oklch()` colors. Translate into the codebase's existing `globals.css` token system.
- Animations are CSS transitions + a couple of keyframe animations. Reproduce with **Framer Motion** (the codebase already uses it heavily, including `layoutId` for shared-element transitions — perfect for the bar↔sidebar↔orb morph).
- Icons use Feather/Lucide-style inline SVG. Use the existing `lucide-react` icons.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, and motion. Recreate pixel-perfectly inside the existing design system.

## Visual relationship to the existing AIChatPanel

The mocks intentionally borrow the exact visual DNA of `src/components/layout/AIChatPanel.tsx`:

- Same `FluidCanvas` background (warm-orange / muted-green / soft-blue radial blobs animating slowly behind the content)
- Same `oklch(...)` surface scale and accent (`oklch(0.72 0.13 38)` terracotta)
- Same minimalist message style: small terracotta dot + plain text for AI replies; a subtle bordered bubble for user messages
- Same input chrome: rounded surface, terracotta caret + send button
- Same agent footnote ("Recruiter · Hiring Manager · Career Coach")

The new pieces this design adds on top of that base:
- **Bar pose** + **Orb pose** + the morph between all three
- **Tabs**: Chat / Suggestions / History
- **Scope pill** that ties messages to a resume section
- **Diff cards** (before/after with Accept · Tweak · Reject)
- **Suggestions queue** (a list of pending agent edits)
- **Per-agent dot tagging** on AI messages so it's clear which of the three agents spoke
- **Agent target chips** in the input footer to scope the next message to one agent

## Screens / Views

This is a single in-app overlay. The host is shown as a Resume Editor (left nav + canvas) for context, but the assistant is global.

### A. Bar pose (default)

- **Position**: `position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);`
- **Size**: `520 × 48`, `border-radius: 12px`
- **Background**: `oklch(0.10 0.018 34 / 0.92)` (mostly opaque, *no* fluid background — this pose is meant to be a quiet command bar, not a hero element)
- **Border**: `1px solid oklch(0.55 0.015 40 / 0.22)`
- **Backdrop filter**: `blur(20px) saturate(1.1)`
- **Shadow**: `0 8px 28px rgba(0,0,0,0.35), 0 1px 0 oklch(1 0 0 / 0.04) inset`

**Contents (left → right):**
1. **Mark** — 24×24 rounded-square `7px` filled with `--accent-muted` (`oklch(0.72 0.13 38 / 0.18)`), centered `13×13` sparkle SVG in `--accent-warm`.
2. **Context pill** — small label like `· Editor · Mei R · v3`. Transparent background, hairline border, 5×5 leading dot in `--accent`.
3. **Input** — placeholder `"Ask anything about your job search…"`. No inset chrome here; it sits flat in the bar.
4. **`⌘K` keyboard hint** — JetBrains Mono, 9.5px, in a small surface pill.
5. **Send button** — 28×28 rounded-square in solid `--accent`, white-paper plane icon.

### B. Sidebar pose

- **Position**: `position: fixed; top: 56px; bottom: 0; right: 0;`
- **Width**: `368px` (matches the production AIChatPanel)
- **Border-radius**: `0` (pinned to the edge)
- **Background base**: `oklch(0.13 0.025 34)` solid — the fluid layer paints over this
- **Border**: `1px solid oklch(0.55 0.015 40 / 0.22)` on the **left edge only**
- **No outer shadow** (it's pinned to the edge, not floating)

When the sidebar is pinned, the host's main content area (`.canvas-area`) animates `margin-right: 368px` so the resume content shifts left. **Do not** overlap content when docked — always reflow.

**Background composition** (z-index stack inside the sidebar):
1. Solid base color `oklch(0.13 0.025 34)`
2. **Fluid layer** (`a-shader`) — three radial gradients animating on a 16s loop:
   - Warm orange `oklch(0.62 0.17 38 / 0.55)` at varying `(x1, y1)`
   - Muted green `oklch(0.55 0.14 152 / 0.42)` at `(x2, y2)`
   - Soft blue `oklch(0.55 0.15 268 / 0.40)` at `(x3, y3)`
   - All blurred 44px, saturated 1.25
3. **Scrim** — `oklch(0.08 0.015 34 / 0.55)` flat overlay so the fluid is felt but text is legible
4. Content layer (z-index 3)

The codebase already has a `<FluidCanvas>` React component used by AIChatPanel — **reuse it directly** instead of recreating with CSS. Pass `forceAnimate` and overlay the same scrim.

**Sidebar layout (top → bottom):**

1. **Header row** (padding `14px 18px 0`):
   - Mark + label `"AI assistant"` (no caption — keep it minimal)
   - Right side: 3 mini-buttons (28×28, 8px radius) — `+` new thread, chevron-down "dock back to bar", `−` minimize to orb. Hover lightens text + adds a subtle surface fill.
2. **Tabs** — underline-style, not segmented:
   - `Chat` (default), `Suggestions` (with a soft pill badge `5`), `History`
   - Active tab: text in `--p-text` + a 1px terracotta underline 14px below
   - Inactive: `--p-text-mute`, hover lifts to `--p-text-body`
   - Inline at row spacing `margin-right: 18px` between tabs (no surrounding container)
3. **Scope pill** — shows what the assistant is scoped to, e.g. `Scope: Experience · Linear Labs`. Click to scroll the resume to that section and flash-highlight it. `×` clears scope. Hairline border + transparent base; lifts to surface on hover.
4. **Body** (scrollable, padding `18px 18px 8px`) — content depends on active tab. Hidden scrollbar.
5. **Footer** (Chat + Suggestions only, hidden on History):
   - **Agent target chips** — `[All agents] [Recruiter] [HM] [Coach]` — pill buttons with hairline borders. Active gets `--p-surface-hi`. Each colored dot uses the agent palette (5×5, no glow).
   - **Input** — placeholder `"Reply or @ an agent…"`, with a 28×28 terracotta send button. Caret is `--accent-warm`.
   - **Quick chips** — `Add metrics`, `Tighten`, `For Stripe APM`, `More technical`. Same pill style as the agent targets.

#### Sidebar → Chat tab

A standard chat thread (no day separators).

**AI messages**:
- Layout: 6×6 terracotta dot (`--accent`) at top-left + plain text body (`13px / 1.65 line-height`, `var(--p-text-body)` color)
- No avatar, no bubble background, no timestamp
- Optional **agent tag** above the bubble: a tiny row reading `● Hiring Manager` with a 5×5 colored dot — only when it's important to attribute (e.g. a diff)

**User messages**:
- Right-aligned, max-width `82%`
- Bubble: `padding: 9px 14px`, `border-radius: 14px 14px 4px 14px` (the asymmetric corner gives it a tail), `background: var(--p-surface-hi)`, `border: 1px solid var(--p-border2)`, text in `oklch(0.82 0.012 52)`

**Diff cards** (when AI proposes an edit):
- A bordered card with three bands: header / body / footer
- Header: `agent dot + name · scope` on the left (e.g. `Hiring Manager · bullet 1`), small `Rewrite` pill on the right (terracotta-muted bg, accent-warm text)
- Body: before-and-after, both in `Inter 12.5px`. Before line: `text-decoration: line-through` in `--p-text-dim`. After line: plain `--p-text` (no green highlight pad — the strike alone is enough)
- Footer: short rationale in muted text on the left, action row on the right: **Accept** (solid terracotta primary), **Tweak** (subtle, hairline border), **×** (ghost reject)

#### Sidebar → Suggestions tab

A queued list of pending changes.

Top of the tab has a summary card: `5 pending changes from ●●● [Accept all] [Reject all]` (the three dots are the agent palette).

Each item is a card (same surface as the diff cards):
- Header line: `● agent name · scope`
- Body: inline before-after — `<s>old</s> → <strong>new</strong>` (no highlight padding)
- Action row: `Accept` (solid terracotta), `Tweak`, `Reject`, plus right-aligned timestamp

#### Sidebar → History tab

A list of past conversations grouped by day labels (`Today`, `Yesterday`, `Last week` — left-aligned plain text, no uppercase, no dividers).

Each row:
- A simple 8×8 dot on the left — `--accent` for the active row, `--p-text-dim` otherwise
- Title (truncated) + caption (`5 changes · accepted 0`)
- Right-aligned timestamp; active row shows a `live` pill in `--accent-muted` bg with `--accent-warm` text

Active row gets `--p-surface-hi` background (no left accent strip).

Footer (input + targets) is **hidden** on the History tab — `display: none`. State for any in-progress draft should be **preserved** (don't unmount), so switching back to Chat doesn't lose it.

### C. Orb pose (collapsed)

- **Position**: `bottom: 24px; right: 24px;`
- **Size**: `44 × 44`, `border-radius: 999px`
- **Background**: `oklch(0.10 0.018 34 / 0.92)` (same as bar)
- **Border**: same `--p-border`
- **Backdrop filter**: `blur(20px) saturate(1.1)`
- **Shadow**: `0 6px 18px rgba(0,0,0,0.30)`
- **Contents**: only the sparkle SVG, 16×16, in `--accent-warm`. No spinning ring, no glow halo.

Clicking the orb returns to **sidebar**.

## Interactions & Behavior

### Pose transitions

The assistant is **one element**. Pose changes happen by toggling a class (`pose-bar` / `pose-sidebar` / `pose-collapsed`). All geometry transitions simultaneously:

```css
transition:
  left 0.55s var(--ease),
  right 0.55s var(--ease),
  top 0.55s var(--ease),
  bottom 0.55s var(--ease),
  width 0.55s var(--ease),
  height 0.55s var(--ease),
  border-radius 0.45s var(--ease),
  transform 0.55s var(--ease),
  border-color 0.35s var(--ease);

--ease: cubic-bezier(0.16, 1, 0.3, 1);
```

In the React port, **use Framer Motion's `layoutId`** on the assistant root with three position variants. It will handle the morph for free (and survives content swaps better than CSS transitions).

### Contrail

When pose changes, a thin terracotta line is drawn from the previous bounding-box center to the new one and fades over 0.55s. Single 1px gradient div, rotated to the angle:

```js
const dx = toX - fromX, dy = toY - fromY;
const ang = Math.atan2(dy, dx) * 180 / Math.PI;
contrail.style = `left:${fromX}px; top:${fromY}px; width:${Math.hypot(dx,dy)}px; transform:rotate(${ang}deg); transform-origin:0 50%`;
```

If using Framer Motion's `layoutId`, the contrail is decorative-only and can be skipped — the layout animation already conveys identity. Keep it as a subtle accent if it feels right.

### Triggers

- **Cmd+\\** toggles between Bar and Sidebar
- **Click "Ask AI" pill** on any resume section → Sidebar opens, scope set to that section
- **Click left-nav "Tracker" or "Home"** → Sidebar collapses back to Bar (those pages don't need it docked)
- **Mini-button "dock" (chevron)** in sidebar header → returns to Bar
- **Mini-button "minimize" (−)** → collapses to Orb
- **Click Orb** → expands back to Sidebar

### Hover / active states

- **Resume sections**: hover reveals a 6-dot drag handle on the left and the "Ask AI" pill on the right. Active section gets a warm tinted background plus a 2px terracotta accent strip on the left.
- **Tab buttons**: hover lightens text; active tab adds the underline.
- **Diff Accept**: terracotta solid, brightens 8% on hover.
- **Scope pill**: hover lifts to `--p-surface`. Clicking (anywhere except the `×`) scrolls the resume to that section and adds a 1.6s `flash` keyframe (warm orange wash → transparent).

### Toast hint

After every pose change, a small toast appears near the assistant for ~2.2s with a message like `"Brought your assistant over."` plus the keyboard shortcut pill `⌘\`. Use the codebase's existing toast system (sonner is already wired up) instead of recreating.

## State Management

```ts
type Pose = 'bar' | 'sidebar' | 'collapsed';
type Tab = 'chat' | 'suggestions' | 'history';
type Agent = 'all' | 'recruit' | 'hm' | 'coach';

interface AssistantState {
  pose: Pose;
  tab: Tab;
  scope: { sectionId: string; label: string } | null;
  targetAgent: Agent;
  threadId: string;
}
```

Add this slice to the existing Zustand store (`src/stores/app.ts` already has `aiPanelOpen`/`toggleAiPanel` — extend that). Pose should default from route — e.g. `/editor` → Sidebar; other routes → Bar. Persist user override in localStorage (the existing store already has the persist middleware) so collapsing to Orb sticks across reloads.

## Design Tokens

All colors are `oklch()`. Translate to the codebase's CSS-variable token format in `globals.css`.

### Surface — assistant (sits on the FluidCanvas, so all surfaces are translucent)

| Token | Value |
|---|---|
| `--p-surface` | `oklch(0.18 0.022 34 / 0.72)` — message bubbles, cards, input chrome |
| `--p-surface-hi` | `oklch(0.22 0.024 34 / 0.82)` — hovered card, user message bubble |
| `--p-border` | `oklch(0.55 0.015 40 / 0.22)` |
| `--p-border2` | `oklch(0.60 0.018 40 / 0.30)` |

Sidebar base color (under the fluid): `oklch(0.13 0.025 34)`
Bar / Orb base color (no fluid): `oklch(0.10 0.018 34 / 0.92)` over a `blur(20px)` backdrop filter

### Type — assistant

| Token | Value |
|---|---|
| `--p-text` | `oklch(0.96 0.010 55)` — primary, headers, sender names |
| `--p-text-body` | `oklch(0.86 0.012 52)` — body copy, AI messages |
| `--p-text-mute` | `oklch(0.66 0.010 50)` — captions, labels, inactive tabs |
| `--p-text-dim` | `oklch(0.50 0.008 50)` — timestamps, strike-through old text |

### Accents

| Token | Value | Usage |
|---|---|---|
| `--accent` | `oklch(0.72 0.13 38)` | Primary terracotta — buttons, active dot, tab underline |
| `--accent-warm` | `oklch(0.78 0.12 42)` | Lighter highlight — sparkle, send caret |
| `--accent-muted` | `oklch(0.72 0.13 38 / 0.18)` | Mark backdrop, badge bg, "live" pill |
| `--accent-deep` | `oklch(0.55 0.14 32)` | Reserved for emphasis (not used in this revision) |

### Three-agent palette

| Token | Value | Agent |
|---|---|---|
| `--recruit` | `oklch(0.70 0.12 35)` | Recruiter |
| `--hm` | `oklch(0.68 0.10 150)` | Hiring Manager |
| `--coach` | `oklch(0.66 0.11 260)` | Career Coach |

Each color appears as a 5×5 dot — **no glow**, no shadow. Always pair with the agent's name (a11y).

### Surface — host app (light)

| Token | Value |
|---|---|
| `--bg` | `oklch(0.985 0.004 70)` |
| `--paper` | `oklch(1 0 0)` — resume sheet |
| `--surface-1` | `oklch(0.97 0.005 65)` |
| `--surface-2` | `oklch(0.95 0.008 60)` |
| `--border` | `oklch(0.92 0.006 60)` |
| `--border-strong` | `oklch(0.86 0.008 55)` |
| `--fg` | `oklch(0.18 0.02 50)` |
| `--fg-muted` | `oklch(0.50 0.010 50)` |
| `--fg-subtle` | `oklch(0.65 0.008 55)` |

These should already exist in the codebase under the existing variable names — map onto them.

### Typography

| Family | Use |
|---|---|
| **Inter** (300/400/500/600/700) | UI everywhere |
| **Instrument Serif** (italic) | Wordmark accent only |
| **JetBrains Mono** (400/500) | Keyboard hints (`⌘K`, `⌘\`) |
| **Source Serif Pro** / system `Georgia` | Resume body |

The codebase already loads Inter + Instrument Serif — reuse those imports.

### Sizing

| Element | Value |
|---|---|
| Bar | `520 × 48`, radius `12` |
| Sidebar | `368 × auto` (top `56`, bottom `0`, right `0`), radius `0` |
| Orb | `44 × 44`, radius `999` |
| Mark (in bar) | `24 × 24`, radius `7` |
| Diff card | radius `10`, body padding `11px 12px` |
| Mini button | `28 × 28`, radius `8` |
| Send button | `28 × 28`, radius `8` |

### Easing

| Token | Value | Use |
|---|---|---|
| `--ease` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default — pose changes, contrail |
| `--ease-soft` | `cubic-bezier(0.25, 0.8, 0.25, 1)` | Background fluid flow |

## Assets

No external images. All visuals are CSS gradients + inline SVG icons (paper plane, sparkle, chevrons, plus, etc.). Replace with `lucide-react`.

## Files

- `ai-sidebar.html` — full prototype (single self-contained HTML)
- `README.md` — this file

## Implementation tips

1. **Build the assistant component with a single root element and one `pose` prop.** Don't render three different components — that breaks the "same identity" illusion. Use Framer Motion's `layoutId` for free morph animation.
2. **Reuse `<FluidCanvas>`** for the sidebar background — it's already in the codebase.
3. The footer (input + agent chips) should be **hidden, not unmounted**, on the History tab. Otherwise the user loses any in-progress draft.
4. Treat the **scope pill** as state owned by the assistant, not the resume. The resume just listens for "scroll-to-section" events.
5. The **Cmd+\\ shortcut** must work globally, not just when the assistant has focus.
6. Match the existing `AIChatPanel` patterns — 13px body text, 1.65 line-height for AI messages, 6×6 terracotta dot before AI replies, no avatars.
