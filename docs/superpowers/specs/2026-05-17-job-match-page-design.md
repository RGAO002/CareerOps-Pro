# Job Match Page — Frontend Design Spec

**Date:** 2026-05-17  
**Branch:** feature/resume-editor-v3  
**Scope:** Frontend only; backend (`POST /api/jobs/match`) deferred.

---

## Overview

After uploading a resume, instead of going straight to the editor, users see a choreographed transition overlay revealing a **Job Match page** — a ranked list of roles that match their profile. They pick a target role, then enter the editor pre-tailored to that job.

### Flow (new)

```
Landing (/) → drop PDF → parse success
  → useTransitionStore.start(resumeId)  [triggers overlay]
  → router.push('/jobs?from_upload=1')  [between phase 2→3]
  → user clicks "Tailor & open"
  → router.push('/resume/:id?job=:jobId')
```

---

## Components

### Stores

**`frontend/src/stores/transition.ts`**  
Zustand slice driving the overlay state machine.

```ts
type Phase = 0 | 1 | 2 | 3 | 4;
interface TransitionState {
  phase: Phase;
  resumeId: string | null;
  start: (resumeId: string) => void;
  finish: () => void;
}
```

Timing from `start()`:
- t=0ms → phase 1 (overlay reveals, status: "Vectorizing…", counter: 1,247)
- t=1000ms → phase 2 (tokens + constellation fade in, counter: 247)
- t=2200ms → phase 3 (arcs + clusters pop in, counter: 12) + `router.push('/jobs?from_upload=1')`
- t=4200ms → phase 4 (overlay fades out, 0.7s)
- t=4900ms → phase 0 (done)

**`frontend/src/stores/jobMatch.ts`**  
Zustand slice for job list state. Initially hydrated from mock data (10 jobs from handoff prototype). `fetch()` is a no-op stub that resolves immediately — real API wired later.

```ts
interface JobMatchState {
  resumeId: string | null;
  loading: boolean;
  matches: Job[];
  signature: string[];
  filter: 'all' | 'spons' | 'remote' | 'strong' | 'recent';
  sort: 'match' | 'recent' | 'salary';
  fetch: (resumeId: string) => Promise<void>;
  setFilter: (f: ...) => void;
  setSort: (s: ...) => void;
}
```

### New components

**`MatchRing`** — 42×42 SVG ring. Props: `score`, `size`, `dark`. Color thresholds: ≥85 green, ≥70 warn, else terracotta-deep.

**`EmbeddingConstellation`** — SVG with 80 deterministic background dots, user node at center, 5 cluster anchors. Props: `phase (0-3)`, `dark`, `compact`. Phase controls opacity of dots and reveal of arcs + cluster nodes.

**`JobCard`** — White card (radius 12). Shows: company logo, role title, location, MatchRing, tier label, agent score breakdown (R/H/C dots), 2 reasons + 1 gap, tags (H1B tinted), "Tailor & open" button.

**`MatchFilterBar`** — Pill row: All / ★ Sponsors H1B / Remote OK / Strong fit / Posted 7d. Active H1B pill gets terracotta accent treatment. Sort select on right.

**`JobListPage`** — Full page layout inside AppShell:
1. Top bar (60px, frosted glass) — logo, breadcrumb "Discover › Matched roles", profile pill, "Open editor" button
2. Page header — serif italic h1 + stats (STRONG/GOOD/STRETCH)
3. Constellation strip (160px, compact light mode)
4. MatchFilterBar
5. 2-col job grid with card-in cascade animation
6. Floating command dock pill (bottom center)

**`MatchTransitionOverlay`** — Fixed full-viewport overlay (z-index: 100), mounted at app root in `layout.tsx` via `AnimatePresence`. Dark background + fluid canvas + scrim. Shows: status pill (top-left), candidate counter (top-right), signature tokens (center), EmbeddingConstellation (large, dark). Entry via `clipPath: circle()` expanding from 62% 50%.

### Route

**`frontend/src/app/jobs/page.tsx`** — Server component shell. Reads `?from_upload=1` to pass `animateIn` prop. Renders `<JobListPage animateIn={...} />` inside AppShell.

---

## Modified Files

**`layout.tsx`** — Add `<MatchTransitionOverlay />` + `AnimatePresence` after `{children}`. Needs `"use client"` wrapper component since overlay reads Zustand.

**`LandingHero.tsx`** — After parse success (currently a 2s fake delay + mock data), call `useTransitionStore.getState().start(parsedId)`. The store owns the route push; LandingHero doesn't navigate directly.

**`Sidebar.tsx`** — Add `{ href: '/jobs', icon: Compass, label: 'Discover' }` between Home and Editor in `navItems`.

---

## Design Tokens

All tokens already exist in `globals.css` or will be added:
- Dark overlay tokens: `--p-base`, `--p-surface`, `--p-border`, `--p-text`, `--p-text-mute`
- Agent tokens: `--recruit`, `--hm`, `--coach` (already exist as `--p-recruit` etc — map accordingly)
- Easing: `--ease-expo`, `--ease-overlay`, `--ease-pop` (add as CSS custom properties)

---

## CSS Animations (globals.css additions)

```css
@keyframes arc-draw { from { stroke-dashoffset: 160; } to { stroke-dashoffset: 0; } }
@keyframes pop-in   { from { transform: scale(0.3); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes card-in  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes overlay-in { from { opacity: 0; clip-path: circle(0% at 62% 50%); } to { opacity: 1; clip-path: circle(150% at 62% 50%); } }
@keyframes aurora   { 0%,100% { transform: translate(0,0); } 50% { transform: translate(40px,-20px); } }
```

---

## Implementation Order

1. Zustand stores (`transition.ts`, `jobMatch.ts` with mock data)
2. `MatchRing`, `EmbeddingConstellation`
3. `JobCard`, `MatchFilterBar`, `JobListPage`
4. `frontend/src/app/jobs/page.tsx`
5. `MatchTransitionOverlay`
6. Wire `layout.tsx` (mount overlay)
7. Wire `LandingHero.tsx` (trigger transition on parse)
8. Wire `Sidebar.tsx` (add Discover nav)
9. Add CSS keyframes to `globals.css`

---

## Out of Scope

- `POST /api/jobs/match` backend endpoint (deferred)
- Real resume parsing in LandingHero (currently mock; transition triggers with a hardcoded resumeId)
- `PdfUploader.tsx` changes (only LandingHero path for now)
