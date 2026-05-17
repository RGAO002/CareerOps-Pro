# Job Match Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Job Match page — a ranked job list revealed after resume upload via a choreographed full-screen transition overlay, frontend-only with mock data.

**Architecture:** Two Zustand stores own all state (transition phases + job list). Nine new components implement the handoff design pixel-for-pixel. Three existing files are wired up. The `/jobs` route uses a custom `JobsShell` (not `AppShell`) because it needs a full-width layout with its own top bar.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion, Zustand, lucide-react

---

### Task 1: CSS foundations — keyframes, tokens, JetBrains Mono font

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Add JetBrains Mono to `layout.tsx`**

Add after the existing `plusJakarta` font block:

```tsx
import { JetBrains_Mono } from "next/font/google";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});
```

Update the `<html>` className to include `${jetbrainsMono.variable}` alongside the others.

- [ ] **Add missing design tokens to `globals.css`**

Find the existing accent/token block (`:root` or light-theme block) and add any of these that are missing:

```css
--terracotta:      oklch(0.62 0.13 38);
--terracotta-deep: oklch(0.50 0.14 35);
--warm:            oklch(0.78 0.12 42);
--warn:            oklch(0.65 0.13 70);
--recruit:         oklch(0.62 0.14 32);
--hm:              oklch(0.55 0.14 150);
--coach:           oklch(0.55 0.12 260);
--p-base:          oklch(0.13 0.025 34);
--p-surface:       oklch(0.22 0.028 34 / 0.55);
--p-border:        oklch(0.70 0.018 40 / 0.22);
--p-text:          oklch(0.97 0.010 55);
--p-text-mute:     oklch(0.72 0.012 50);
```

- [ ] **Add CSS keyframes to bottom of `globals.css`**

```css
/* ── Job Match animations ── */
@keyframes arc-draw {
  from { stroke-dashoffset: 160; }
  to   { stroke-dashoffset: 0;   }
}
@keyframes pop-in {
  from { transform: scale(0.3); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
@keyframes card-in {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0);    }
}
@keyframes aurora {
  0%, 100% { transform: translate(0, 0);        }
  50%       { transform: translate(40px, -20px); }
}
@keyframes flow {
  0%   { transform: translate(0, 0) scale(1);       }
  50%  { transform: translate(10%, -5%) scale(1.05); }
  100% { transform: translate(-5%, 5%) scale(0.95);  }
}
@keyframes beacon {
  0%, 100% { opacity: 1;   box-shadow: 0 0 12px oklch(0.62 0.13 38); }
  50%       { opacity: 0.4; box-shadow: 0 0 4px  oklch(0.62 0.13 38); }
}
```

- [ ] **Verify TypeScript compiles**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors related to `layout.tsx`.

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/app/layout.tsx frontend/src/app/globals.css && git commit -m "feat: add JetBrains Mono, job match keyframes and design tokens"
```

---

### Task 2: Transition store

**Files:**
- Create: `frontend/src/stores/transition.ts`
- Create: `frontend/src/stores/__tests__/transition.test.ts`

- [ ] **Write failing test**

```ts
// frontend/src/stores/__tests__/transition.test.ts
import { useTransitionStore } from "../transition";

beforeEach(() => {
  useTransitionStore.setState({ phase: 0, resumeId: null });
});

describe("useTransitionStore", () => {
  it("starts at phase 0", () => {
    expect(useTransitionStore.getState().phase).toBe(0);
  });

  it("start() sets phase 1 and resumeId immediately", () => {
    useTransitionStore.getState().start("resume-123");
    expect(useTransitionStore.getState().phase).toBe(1);
    expect(useTransitionStore.getState().resumeId).toBe("resume-123");
  });

  it("finish() resets to phase 0", () => {
    useTransitionStore.getState().start("resume-123");
    useTransitionStore.getState().finish();
    expect(useTransitionStore.getState().phase).toBe(0);
    expect(useTransitionStore.getState().resumeId).toBeNull();
  });
});
```

- [ ] **Run test to verify it fails**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx jest stores/__tests__/transition.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../transition'`

- [ ] **Create `frontend/src/stores/transition.ts`**

```ts
import { create } from "zustand";

export type Phase = 0 | 1 | 2 | 3 | 4;

interface TransitionState {
  phase: Phase;
  resumeId: string | null;
  start: (resumeId: string) => void;
  finish: () => void;
}

export const useTransitionStore = create<TransitionState>((set) => ({
  phase: 0,
  resumeId: null,
  start: (resumeId) => {
    set({ phase: 1, resumeId });
    setTimeout(() => set({ phase: 2 }), 1000);
    setTimeout(() => set({ phase: 3 }), 2200);
    setTimeout(() => set({ phase: 4 }), 4200);
    setTimeout(() => set({ phase: 0, resumeId: null }), 4900);
  },
  finish: () => set({ phase: 0, resumeId: null }),
}));
```

- [ ] **Run test to verify it passes**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx jest stores/__tests__/transition.test.ts 2>&1 | tail -10
```

Expected: PASS — 3 tests passing

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/stores/transition.ts frontend/src/stores/__tests__/transition.test.ts && git commit -m "feat: add transition store with phase state machine"
```

---

### Task 3: Job match store with mock data

**Files:**
- Create: `frontend/src/stores/jobMatch.ts`
- Create: `frontend/src/stores/__tests__/jobMatch.test.ts`

- [ ] **Write failing test**

```ts
// frontend/src/stores/__tests__/jobMatch.test.ts
import { useJobMatchStore } from "../jobMatch";

beforeEach(() => {
  useJobMatchStore.setState({ resumeId: null, loading: false, matches: [], signature: [], filter: "all", sort: "match" });
});

describe("useJobMatchStore", () => {
  it("fetch() loads 10 mock jobs", async () => {
    await useJobMatchStore.getState().fetch("resume-123");
    expect(useJobMatchStore.getState().matches).toHaveLength(10);
  });

  it("setFilter updates filter", () => {
    useJobMatchStore.getState().setFilter("spons");
    expect(useJobMatchStore.getState().filter).toBe("spons");
  });

  it("setSort updates sort", () => {
    useJobMatchStore.getState().setSort("salary");
    expect(useJobMatchStore.getState().sort).toBe("salary");
  });

  it("all mock jobs have required fields with valid tier", async () => {
    await useJobMatchStore.getState().fetch("resume-123");
    for (const job of useJobMatchStore.getState().matches) {
      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("matchScore");
      expect(["A", "B", "C"]).toContain(job.tier);
    }
  });
});
```

- [ ] **Run test to verify it fails**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx jest stores/__tests__/jobMatch.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../jobMatch'`

- [ ] **Create `frontend/src/stores/jobMatch.ts`**

```ts
import { create } from "zustand";

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  workType: string;
  salary: string;
  matchScore: number;
  agentScores: { recruiter: number; hm: number; coach: number };
  matchReasons: string[];
  gap: string;
  tags: string[];
  tier: "A" | "B" | "C";
}

export type FilterType = "all" | "spons" | "remote" | "strong" | "recent";
export type SortType = "match" | "recent" | "salary";

export const MOCK_SIGNATURE = [
  "Product Design", "8y experience", "Motion · Systems", "Consumer mobile", "iOS depth",
];

const MOCK_JOBS: Job[] = [
  { id: "j1",  title: "Senior PM, Payments",       company: "Stripe",    location: "San Francisco · Hybrid", workType: "hybrid", salary: "$210–260k", matchScore: 94, agentScores: { recruiter: 96, hm: 92, coach: 94 }, matchReasons: ["Payments infrastructure depth", "API ergonomics from Plaid", "Scale: 12k merchants × 4 yrs"], gap: "Settlement protocols not on resume",  tags: ["Sponsors H1B", "Strong fit"], tier: "A" },
  { id: "j2",  title: "Product Manager, Claude",   company: "Anthropic", location: "San Francisco · Hybrid", workType: "hybrid", salary: "$220–280k", matchScore: 91, agentScores: { recruiter: 88, hm: 94, coach: 91 }, matchReasons: ["LLM product experience", "Research adjacency", "Strong writing samples"],              gap: "No published research",              tags: ["Sponsors H1B", "Strong fit"], tier: "A" },
  { id: "j3",  title: "Product Designer, HI",      company: "Apple",     location: "Cupertino · On-site",    workType: "onsite", salary: "$165–215k", matchScore: 88, agentScores: { recruiter: 84, hm: 92, coach: 88 }, matchReasons: ["Motion design lead at Linear", "iOS depth from Folio", "RISD design background"],   gap: "Spatial / visionOS missing",         tags: ["Strong fit"],                 tier: "A" },
  { id: "j4",  title: "Founding Designer, Mobile", company: "Linear",    location: "Remote · Americas",      workType: "remote", salary: "$180–230k", matchScore: 85, agentScores: { recruiter: 80, hm: 88, coach: 87 }, matchReasons: ["Mobile craft signal", "Type & motion concentration", "Tooling fluency"],            gap: "No SwiftUI in resume",               tags: ["Remote OK", "Good fit"],      tier: "A" },
  { id: "j5",  title: "Senior PD, Editor",         company: "Notion",    location: "New York · Hybrid",      workType: "hybrid", salary: "$170–210k", matchScore: 82, agentScores: { recruiter: 78, hm: 84, coach: 84 }, matchReasons: ["Editor canvas at Folio", "Plugin ecosystem", "Editorial tools expertise"],          gap: "No collab/CRDT story",               tags: ["Sponsors H1B", "Good fit"],   tier: "B" },
  { id: "j6",  title: "PM, Frontend Infra",        company: "Vercel",    location: "San Francisco · Remote", workType: "remote", salary: "$200–260k", matchScore: 78, agentScores: { recruiter: 74, hm: 82, coach: 78 }, matchReasons: ["Developer tooling instinct", "React ecosystem", "0→1 launches"],                 gap: "No edge / CDN depth",                tags: ["Remote OK"],                  tier: "B" },
  { id: "j7",  title: "Product Designer, FigJam",  company: "Figma",     location: "New York · Hybrid",      workType: "hybrid", salary: "$160–200k", matchScore: 75, agentScores: { recruiter: 70, hm: 78, coach: 77 }, matchReasons: ["Design systems rebuild", "Cross-functional collab", "Plugin authoring"],         gap: "No collab UX research",              tags: ["Sponsors H1B"],               tier: "B" },
  { id: "j8",  title: "Senior PM, Acquiring",      company: "Block",     location: "San Francisco · Hybrid", workType: "hybrid", salary: "$190–240k", matchScore: 72, agentScores: { recruiter: 78, hm: 68, coach: 70 }, matchReasons: ["Payments operator at Plaid", "Acquiring rate optimization", "SQL fluency"],    gap: "Less consumer-facing recently",      tags: ["Sponsors H1B"],               tier: "B" },
  { id: "j9",  title: "PM, Bill Pay",              company: "Ramp",      location: "NYC · Hybrid",           workType: "hybrid", salary: "$180–220k", matchScore: 68, agentScores: { recruiter: 72, hm: 65, coach: 67 }, matchReasons: ["B2B SaaS background", "Roadmap discipline"],                                     gap: "No accounts payable domain",         tags: ["Worth exploring"],            tier: "C" },
  { id: "j10", title: "Sr. PM, Income",            company: "Plaid",     location: "San Francisco · Hybrid", workType: "hybrid", salary: "$190–235k", matchScore: 66, agentScores: { recruiter: 64, hm: 70, coach: 64 }, matchReasons: ["Alum signal", "Banks API fluency"],                                              gap: "Underwriting/credit unfamiliar",      tags: ["Stretch"],                    tier: "C" },
];

interface JobMatchState {
  resumeId: string | null;
  loading: boolean;
  matches: Job[];
  signature: string[];
  filter: FilterType;
  sort: SortType;
  fetch: (resumeId: string) => Promise<void>;
  setFilter: (f: FilterType) => void;
  setSort: (s: SortType) => void;
}

export const useJobMatchStore = create<JobMatchState>((set) => ({
  resumeId: null,
  loading: false,
  matches: MOCK_JOBS,
  signature: MOCK_SIGNATURE,
  filter: "all",
  sort: "match",
  fetch: async (resumeId) => {
    set({ resumeId, loading: false, matches: MOCK_JOBS, signature: MOCK_SIGNATURE });
  },
  setFilter: (filter) => set({ filter }),
  setSort: (sort) => set({ sort }),
}));
```

- [ ] **Run test to verify it passes**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx jest stores/__tests__/jobMatch.test.ts 2>&1 | tail -10
```

Expected: PASS — 4 tests passing

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/stores/jobMatch.ts frontend/src/stores/__tests__/jobMatch.test.ts && git commit -m "feat: add job match store with 10 mock jobs"
```

---

### Task 4: MatchRing component

**Files:**
- Create: `frontend/src/components/jobs/MatchRing.tsx`

- [ ] **Create component**

```tsx
// frontend/src/components/jobs/MatchRing.tsx
"use client";

interface Props {
  score: number;
  size?: number;
  dark?: boolean;
}

export function MatchRing({ score, size = 42, dark = false }: Props) {
  const R = (size - 6) / 2;
  const C = 2 * Math.PI * R;
  const dash = (score / 100) * C;
  const tone =
    score >= 85 ? "oklch(0.55 0.12 150)"
    : score >= 70 ? "oklch(0.65 0.13 70)"
    : "oklch(0.50 0.14 35)";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2} cy={size / 2} r={R}
          stroke={dark ? "rgba(255,255,255,0.10)" : "oklch(0.94 0.012 48)"}
          strokeWidth="2.5" fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={R}
          stroke={tone} strokeWidth="2.5" fill="none"
          strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          fontFamily: '"JetBrains Mono", var(--font-mono), monospace',
          fontSize: size * 0.34, fontWeight: 500,
          letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums",
          color: dark ? "oklch(0.97 0.010 55)" : "oklch(0.20 0.020 45)",
        }}
      >
        {score}
      </div>
    </div>
  );
}
```

- [ ] **Verify TypeScript**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | grep MatchRing
```

Expected: no output

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/components/jobs/MatchRing.tsx && git commit -m "feat: add MatchRing SVG component"
```

---

### Task 5: EmbeddingConstellation component

**Files:**
- Create: `frontend/src/components/jobs/EmbeddingConstellation.tsx`

- [ ] **Create component**

```tsx
// frontend/src/components/jobs/EmbeddingConstellation.tsx
"use client";

import { useMemo } from "react";

interface Cluster {
  x: number;
  y: number;
  label: string;
  score: number;
}

interface Props {
  phase: 0 | 1 | 2 | 3;
  dark?: boolean;
  compact?: boolean;
  userLabel?: string;
  clusters?: Cluster[];
}

const DEFAULT_CLUSTERS: Cluster[] = [
  { x:  72, y: -36, label: "Stripe",    score: 94 },
  { x: 110, y:  18, label: "Anthropic", score: 91 },
  { x: -68, y: -28, label: "Apple",     score: 88 },
  { x: -98, y:  22, label: "Linear",    score: 85 },
  { x:  46, y:  60, label: "Notion",    score: 82 },
];

export function EmbeddingConstellation({
  phase,
  dark = false,
  compact = false,
  userLabel = "You",
  clusters = DEFAULT_CLUSTERS,
}: Props) {
  const points = useMemo(() => {
    const ps: { x: number; y: number; sz: number; op: number }[] = [];
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * Math.PI * 2 + (i % 7) * 0.31;
      const r = 60 + (i % 11) * 14 + Math.sin(i * 0.7) * 18;
      ps.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r * 0.62,
        sz: 1 + (i % 5) * 0.3,
        op: 0.3 + (i % 7) * 0.08,
      });
    }
    return ps;
  }, []);

  const w = compact ? 800 : 880;
  const h = compact ? 140 : 360;
  const dotFill = dark ? "#fff" : "oklch(0.20 0.020 45)";
  const labelFill = dark ? "oklch(0.97 0.010 55)" : "oklch(0.20 0.020 45)";
  const scoreFill = dark ? "oklch(0.72 0.012 50)" : "oklch(0.48 0.012 50)";

  return (
    <div style={{ position: "relative", width: "100%", height: h, overflow: "hidden" }}>
      <svg
        width="100%" height={h}
        viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}
        style={{ display: "block" }}
      >
        <defs>
          <radialGradient id="ec-user-glow">
            <stop offset="0%"   stopColor="oklch(0.62 0.13 38)" stopOpacity={dark ? 0.9 : 0.6} />
            <stop offset="100%" stopColor="oklch(0.62 0.13 38)" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="ec-cluster-glow">
            <stop offset="0%"   stopColor="oklch(0.55 0.12 150)" stopOpacity={0.6} />
            <stop offset="100%" stopColor="oklch(0.55 0.12 150)" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="ec-arc-grad" x1="0" x2="1">
            <stop offset="0%"   stopColor="oklch(0.62 0.13 38)"  stopOpacity={0.5} />
            <stop offset="100%" stopColor="oklch(0.55 0.12 150)" stopOpacity={0.5} />
          </linearGradient>
        </defs>

        {/* Background dots */}
        {points.map((p, i) => (
          <circle
            key={i} cx={p.x} cy={p.y} r={p.sz} fill={dotFill}
            opacity={p.op * (phase >= 2 ? 1 : 0.3)}
            style={{ transition: "opacity 1s ease" }}
          />
        ))}

        {/* Arcs — phase 3 only */}
        {phase >= 3 && clusters.map((c, i) => {
          const mid = { x: c.x * 0.5, y: c.y * 0.5 - 18 };
          return (
            <path
              key={i}
              d={`M 0 0 Q ${mid.x} ${mid.y} ${c.x} ${c.y}`}
              stroke="url(#ec-arc-grad)" strokeWidth="1" fill="none"
              strokeDasharray="160" strokeDashoffset="160"
              style={{ animation: `arc-draw 0.9s ${i * 0.12}s cubic-bezier(.2,.8,.2,1) forwards` }}
            />
          );
        })}

        {/* User node */}
        <circle cx="0" cy="0" r="32" fill="url(#ec-user-glow)" />
        <circle cx="0" cy="0" r="6"  fill="oklch(0.62 0.13 38)" />
        <circle cx="0" cy="0" r="11" fill="none" stroke="oklch(0.62 0.13 38)" strokeOpacity="0.45" strokeWidth="1" />
        {phase >= 2 && (
          <text x="0" y="22" textAnchor="middle" fill={labelFill}
            style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {userLabel}
          </text>
        )}

        {/* Cluster nodes — phase 3 only */}
        {phase >= 3 && clusters.map((c, i) => (
          <g key={i} style={{ animation: `pop-in 0.5s ${0.3 + i * 0.12}s cubic-bezier(.2,1.4,.4,1) both` }}>
            <circle cx={c.x} cy={c.y} r="14" fill="url(#ec-cluster-glow)" />
            <circle cx={c.x} cy={c.y} r="3.5" fill="oklch(0.55 0.12 150)" />
            <text x={c.x} y={c.y - 14} textAnchor="middle" fill={labelFill}
              style={{ fontFamily: "Inter, sans-serif", fontSize: 9.5, letterSpacing: "-0.005em" }}>
              {c.label}
            </text>
            <text x={c.x} y={c.y + 22} textAnchor="middle" fill={scoreFill}
              style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8.5 }}>
              {c.score}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Verify TypeScript**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | grep EmbeddingConstellation
```

Expected: no output

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/components/jobs/EmbeddingConstellation.tsx && git commit -m "feat: add EmbeddingConstellation SVG component"
```

---

### Task 6: JobCard component

**Files:**
- Create: `frontend/src/components/jobs/JobCard.tsx`

- [ ] **Create component**

```tsx
// frontend/src/components/jobs/JobCard.tsx
"use client";

import { useState } from "react";
import { type Job } from "@/stores/jobMatch";
import { MatchRing } from "./MatchRing";

function Sparkle({ size = 10, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2 L13.6 9.4 L21 11 L13.6 12.6 L12 20 L10.4 12.6 L3 11 L10.4 9.4 Z" fill={color} />
    </svg>
  );
}

function CompanyLogo({ company, size = 36 }: { company: string; size?: number }) {
  if (company === "Apple") {
    return (
      <div style={{ width: size, height: size, borderRadius: 8, background: "#000", display: "grid", placeItems: "center", flexShrink: 0, border: "1px solid rgba(255,255,255,0.06)" }}>
        <svg width={size * 0.5} height={size * 0.6} viewBox="0 0 170 200" fill="#fff">
          <path d="M150.37 130.29c-2.34 5.4-5.1 10.36-8.3 14.92-4.36 6.22-7.92 10.52-10.67 12.9-4.27 3.92-8.84 5.93-13.74 6.05-3.52 0-7.76-1-12.7-3.04-4.96-2.02-9.51-3.03-13.67-3.03-4.36 0-9.04 1-14.04 3.03-5.01 2.04-9.05 3.1-12.13 3.21-4.69.2-9.37-1.87-14.04-6.21-2.97-2.59-6.69-7.04-11.16-13.36-4.79-6.74-8.73-14.55-11.81-23.45C5.81 111.7 4 102.27 4 93.13c0-10.48 2.27-19.51 6.81-27.07 3.57-6.07 8.32-10.86 14.27-14.39 5.95-3.52 12.38-5.32 19.32-5.43 3.74 0 8.65 1.16 14.74 3.44 6.08 2.29 9.97 3.45 11.69 3.45 1.28 0 5.62-1.36 13-4.07 6.97-2.51 12.85-3.55 17.66-3.14 13.04 1.05 22.83 6.2 29.34 15.46-11.66 7.07-17.42 16.97-17.31 29.7.1 9.91 3.66 18.16 10.69 24.74 3.18 3.02 6.74 5.36 10.7 7.03-.86 2.49-1.77 4.87-2.74 7.15zM119.27 7.05c0 7.83-2.86 15.14-8.55 21.92-6.87 8.06-15.18 12.72-24.19 12-.11-.94-.18-1.93-.18-2.97 0-7.51 3.27-15.57 9.08-22.16 2.9-3.34 6.6-6.11 11.07-8.32 4.46-2.18 8.68-3.38 12.66-3.59.11 1.04.11 2.08.11 3.12z" />
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: "oklch(0.96 0.010 50)", border: "1px solid oklch(0.90 0.008 50)", display: "grid", placeItems: "center", flexShrink: 0, fontFamily: "Inter, sans-serif", fontSize: size * 0.4, fontWeight: 500, color: "oklch(0.20 0.020 45)" }}>
      {company.charAt(0)}
    </div>
  );
}

const TIER_COLOR: Record<string, string> = {
  A: "oklch(0.55 0.12 150)",
  B: "oklch(0.65 0.13 70)",
  C: "oklch(0.48 0.012 50)",
};
const TIER_LABEL: Record<string, string> = { A: "Strong fit", B: "Good fit", C: "Stretch fit" };
const AGENT_COLOR = { recruiter: "oklch(0.62 0.14 32)", hm: "oklch(0.55 0.14 150)", coach: "oklch(0.55 0.12 260)" };

interface Props { job: Job; index: number; animateIn?: boolean; }

export function JobCard({ job, index, animateIn = false }: Props) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 12, padding: "18px 18px 16px", background: "#fff",
        border: `1px solid ${hover ? "oklch(0.85 0.010 50)" : "oklch(0.90 0.008 50)"}`,
        boxShadow: hover
          ? "0 8px 24px oklch(0.40 0.04 42 / 0.08), 0 1px 2px oklch(0.40 0.04 42 / 0.06)"
          : "0 1px 2px oklch(0.40 0.04 42 / 0.04)",
        transition: "all 0.2s ease",
        animation: animateIn ? `card-in 0.6s ${0.05 * index}s cubic-bezier(0.2,0.8,0.2,1) both` : "none",
        cursor: "pointer",
      }}
    >
      {/* Top row: logo + title + ring */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <CompanyLogo company={job.company} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 500, color: "oklch(0.20 0.020 45)", letterSpacing: "-0.01em" }}>{job.title}</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "oklch(0.48 0.012 50)", marginTop: 3, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ color: "oklch(0.20 0.020 45)", fontWeight: 500 }}>{job.company}</span>
            <span>·</span>
            <span>{job.location}</span>
          </div>
        </div>
        <MatchRing score={job.matchScore} size={42} />
      </div>

      {/* Tier + agent scores row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: TIER_COLOR[job.tier] }}>
          {TIER_LABEL[job.tier]}
        </span>
        <span style={{ width: 1, height: 10, background: "oklch(0.90 0.008 50)" }} />
        <div style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
          {(["recruiter", "hm", "coach"] as const).map((key) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: AGENT_COLOR[key] }} />
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: "oklch(0.48 0.012 50)" }}>{job.agentScores[key]}</span>
            </span>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "oklch(0.48 0.012 50)" }}>{job.salary}</span>
      </div>

      {/* Reasons + gap */}
      <ul style={{ margin: "0 0 10px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
        {job.matchReasons.slice(0, 2).map((reason, i) => (
          <li key={i} style={{ fontFamily: "Inter, sans-serif", fontSize: 12, lineHeight: 1.45, color: "oklch(0.20 0.020 45)", position: "relative", paddingLeft: 14 }}>
            <span style={{ position: "absolute", left: 0, top: 8, width: 6, height: 1, background: "oklch(0.55 0.12 150)" }} />
            {reason}
          </li>
        ))}
        <li style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, lineHeight: 1.45, color: "oklch(0.48 0.012 50)", position: "relative", paddingLeft: 14 }}>
          <span style={{ position: "absolute", left: 0, top: 7, width: 6, height: 1, background: "oklch(0.50 0.14 35)", opacity: 0.5 }} />
          <span style={{ color: "oklch(0.50 0.14 35)", fontWeight: 500 }}>Gap:</span> {job.gap}
        </li>
      </ul>

      {/* Footer: tags + tailor button */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid oklch(0.94 0.012 48)" }}>
        {job.tags.map((tag) => (
          <span key={tag} style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 500, padding: "4px 8px", borderRadius: 4, letterSpacing: "0.02em", background: tag.includes("H1B") ? "oklch(0.62 0.13 38 / 0.08)" : "oklch(0.96 0.010 50)", border: `1px solid ${tag.includes("H1B") ? "oklch(0.62 0.13 38 / 0.30)" : "oklch(0.90 0.008 50)"}`, color: tag.includes("H1B") ? "oklch(0.50 0.14 35)" : "oklch(0.48 0.012 50)" }}>
            {tag}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <button style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 6, background: hover ? "oklch(0.20 0.020 45)" : "transparent", color: hover ? "#fff" : "oklch(0.20 0.020 45)", border: hover ? "none" : "1px solid oklch(0.90 0.008 50)", fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.2s" }}>
          <Sparkle size={10} color={hover ? "#fff" : "oklch(0.62 0.13 38)"} />
          Tailor & open
          <span style={{ opacity: 0.5 }}>→</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Verify TypeScript**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | grep JobCard
```

Expected: no output

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/components/jobs/JobCard.tsx && git commit -m "feat: add JobCard component"
```

---

### Task 7: MatchFilterBar component

**Files:**
- Create: `frontend/src/components/jobs/MatchFilterBar.tsx`

- [ ] **Create component**

```tsx
// frontend/src/components/jobs/MatchFilterBar.tsx
"use client";

import { useJobMatchStore, type FilterType, type SortType } from "@/stores/jobMatch";

const FILTERS: { id: FilterType; label: string; count: number; accent?: boolean }[] = [
  { id: "all",    label: "All",          count: 247 },
  { id: "spons",  label: "Sponsors H1B", count: 38, accent: true },
  { id: "remote", label: "Remote OK",    count: 64 },
  { id: "strong", label: "Strong fit",   count: 12 },
  { id: "recent", label: "Posted 7d",    count: 89 },
];

export function MatchFilterBar() {
  const filter    = useJobMatchStore((s) => s.filter);
  const sort      = useJobMatchStore((s) => s.sort);
  const setFilter = useJobMatchStore((s) => s.setFilter);
  const setSort   = useJobMatchStore((s) => s.setSort);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {FILTERS.map((f) => {
        const active = filter === f.id;
        return (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "7px 12px", borderRadius: 999,
              background: active ? (f.accent ? "oklch(0.62 0.13 38 / 0.15)" : "oklch(0.20 0.020 45)") : "#fff",
              color:      active ? (f.accent ? "oklch(0.50 0.14 35)"         : "#fff")                 : "oklch(0.20 0.020 45)",
              border: `1px solid ${active ? (f.accent ? "oklch(0.62 0.13 38 / 0.40)" : "oklch(0.20 0.020 45)") : "oklch(0.90 0.008 50)"}`,
              fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {f.id === "spons" && <span>★</span>}
            {f.label}
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, opacity: active ? 0.7 : 0.5 }}>
              {f.count}
            </span>
          </button>
        );
      })}
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "oklch(0.48 0.012 50)" }}>Sort:</span>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SortType)}
        style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 500, color: "oklch(0.20 0.020 45)", padding: "5px 8px", borderRadius: 6, border: "1px solid oklch(0.90 0.008 50)", background: "#fff" }}
      >
        <option value="match">Match score</option>
        <option value="recent">Most recent</option>
        <option value="salary">Salary</option>
      </select>
    </div>
  );
}
```

- [ ] **Verify TypeScript**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | grep MatchFilterBar
```

Expected: no output

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/components/jobs/MatchFilterBar.tsx && git commit -m "feat: add MatchFilterBar component"
```

---

### Task 8: JobListPage component

**Files:**
- Create: `frontend/src/components/jobs/JobListPage.tsx`

- [ ] **Create component**

```tsx
// frontend/src/components/jobs/JobListPage.tsx
"use client";

import { useJobMatchStore } from "@/stores/jobMatch";
import { EmbeddingConstellation } from "./EmbeddingConstellation";
import { MatchFilterBar } from "./MatchFilterBar";
import { JobCard } from "./JobCard";

interface Props { animateIn?: boolean; }

export function JobListPage({ animateIn = false }: Props) {
  const matches = useJobMatchStore((s) => s.matches);
  const strongCount  = matches.filter((j) => j.tier === "A").length;
  const goodCount    = matches.filter((j) => j.tier === "B").length;
  const stretchCount = matches.filter((j) => j.tier === "C").length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "oklch(0.97 0.008 55)", fontFamily: "Inter, system-ui, sans-serif", color: "oklch(0.20 0.020 45)", overflow: "hidden" }}>

      {/* TOP BAR */}
      <div style={{ height: 60, flexShrink: 0, padding: "0 28px", display: "flex", alignItems: "center", gap: 16, background: "rgba(255,255,255,0.78)", borderBottom: "1px solid oklch(0.90 0.008 50)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, oklch(0.62 0.13 38), oklch(0.50 0.14 35))", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: "#fff" }}>C</span>
        </div>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em" }}>
          CareerOps{" "}
          <em style={{ fontFamily: '"Instrument Serif", var(--font-display), Georgia, serif', fontStyle: "italic", fontWeight: 400, fontSize: 14, color: "oklch(0.50 0.14 35)" }}>Pro</em>
        </span>
        <span style={{ width: 1, height: 18, background: "oklch(0.90 0.008 50)", marginLeft: 8 }} />
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "oklch(0.48 0.012 50)" }}>
          <span style={{ color: "oklch(0.20 0.020 45)" }}>Discover</span>
          <span style={{ color: "oklch(0.62 0.010 55)", margin: "0 6px" }}>›</span>
          Matched roles
        </span>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 8px", borderRadius: 999, border: "1px solid oklch(0.90 0.008 50)", background: "#fff", fontFamily: "Inter, sans-serif", fontSize: 11 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "oklch(0.55 0.12 150)", flexShrink: 0 }} />
          <span style={{ color: "oklch(0.48 0.012 50)" }}>Profile:</span>
          <span style={{ color: "oklch(0.20 0.020 45)" }}>Mei Rivera · PD · 8y</span>
          <span style={{ color: "oklch(0.62 0.010 55)", marginLeft: 4 }}>↻</span>
        </div>
        <button style={{ display: "inline-flex", alignItems: "center", borderRadius: 6, background: "rgb(23,23,23)", padding: "6px 12px", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: "#fff", border: 0, cursor: "pointer" }}>
          Open editor
        </button>
      </div>

      {/* PAGE HEADER + CONSTELLATION */}
      <div style={{ flexShrink: 0, padding: "24px 28px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h1 style={{ fontFamily: '"Instrument Serif", var(--font-display), Georgia, serif', fontSize: 36, lineHeight: 1.1, letterSpacing: "-0.02em", margin: 0, fontWeight: 400 }}>
              <em style={{ fontStyle: "italic", color: "oklch(0.58 0.12 32)" }}>{matches.length} roles</em> match your signature
            </h1>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, lineHeight: 1.5, color: "oklch(0.48 0.012 50)", margin: "8px 0 0", maxWidth: 520 }}>
              Sorted by vector similarity, weighted by Recruiter, Hiring Manager, and Career Coach.{" "}
              <span style={{ color: "oklch(0.20 0.020 45)", fontWeight: 500 }}>{strongCount} strong fits</span> stand out.
            </p>
          </div>
          <div style={{ display: "flex", gap: 14, paddingBottom: 4 }}>
            {[
              { label: "STRONG",  value: strongCount,  tone: "oklch(0.55 0.12 150)" },
              { label: "GOOD",    value: goodCount,    tone: "oklch(0.65 0.13 70)"  },
              { label: "STRETCH", value: stretchCount, tone: "oklch(0.48 0.012 50)" },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "right" }}>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, fontWeight: 500, letterSpacing: "0.20em", textTransform: "uppercase", color: "oklch(0.62 0.010 55)", marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 24, fontWeight: 300, color: s.tone, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Constellation strip */}
        <div style={{ position: "relative", height: 160, marginTop: 8, borderRadius: 12, overflow: "hidden", background: "linear-gradient(180deg, oklch(0.97 0.008 55) 0%, oklch(0.95 0.012 55) 100%)", border: "1px solid oklch(0.90 0.008 50)" }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.4, backgroundImage: "radial-gradient(oklch(0.85 0.010 50) 0.5px, transparent 0.5px)", backgroundSize: "14px 14px" }} />
          <div style={{ position: "absolute", left: "30%", top: "-40%", width: 380, height: 380, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle, oklch(0.82 0.14 35 / 0.18), transparent 70%)", animation: "aurora 16s ease-in-out infinite" }} />
          <EmbeddingConstellation phase={3} dark={false} compact />
          <div style={{ position: "absolute", right: 14, bottom: 10, display: "flex", gap: 14, fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.48 0.012 50)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 5, height: 5, borderRadius: 999, background: "oklch(0.62 0.13 38)" }} />You</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 5, height: 5, borderRadius: 999, background: "oklch(0.55 0.12 150)" }} />Strong cluster</span>
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ flexShrink: 0, padding: "18px 28px 12px" }}>
        <MatchFilterBar />
      </div>

      {/* JOB GRID */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 28px 100px" }}>
        {matches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "oklch(0.48 0.012 50)", fontFamily: "Inter, sans-serif", fontSize: 14 }}>
            No matches yet — try broadening your search.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {matches.map((job, i) => (
              <JobCard key={job.id} job={job} index={i} animateIn={animateIn} />
            ))}
          </div>
        )}
      </div>

      {/* FLOATING COMMAND PILL */}
      <div style={{ position: "absolute", left: "50%", bottom: 20, transform: "translateX(-50%)", display: "inline-flex", alignItems: "center", gap: 10, padding: "9px 14px 9px 12px", background: "oklch(0.10 0.018 34 / 0.92)", border: "1px solid oklch(0.55 0.015 40 / 0.30)", borderRadius: 999, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 8px 28px rgba(0,0,0,0.30)", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500, color: "#fff", zIndex: 10, whiteSpace: "nowrap" }}>
        <span style={{ display: "inline-flex", gap: 3 }}>
          {["oklch(0.62 0.14 32)", "oklch(0.55 0.14 150)", "oklch(0.55 0.12 260)"].map((c) => (
            <span key={c} style={{ width: 6, height: 6, borderRadius: 999, background: c }} />
          ))}
        </span>
        3 agents matched {matches.length} roles
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, opacity: 0.55, padding: "3px 6px", borderRadius: 4, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>⌘K</span>
      </div>
    </div>
  );
}
```

- [ ] **Verify TypeScript**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | grep JobListPage
```

Expected: no output

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/components/jobs/JobListPage.tsx && git commit -m "feat: add JobListPage component"
```

---

### Task 9: /jobs route — JobsShell + page.tsx

**Files:**
- Create: `frontend/src/components/jobs/JobsShell.tsx`
- Create: `frontend/src/app/jobs/page.tsx`

AppShell's inner `<main>` is constrained to `max-w-5xl` with padding — wrong for a full-width layout. Instead we create `JobsShell` that mirrors AppShell's sidebar margin logic without the TopBar or centered container.

- [ ] **Create `frontend/src/components/jobs/JobsShell.tsx`**

```tsx
// frontend/src/components/jobs/JobsShell.tsx
"use client";

import { useAppStore } from "@/stores/app";
import { Sidebar } from "@/components/layout/Sidebar";
import { Assistant } from "@/components/ai/assistant";
import { PreferencesDrawer } from "@/components/layout/PreferencesDrawer";
import { JobListPage } from "./JobListPage";

interface Props { animateIn: boolean; }

export function JobsShell({ animateIn }: Props) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);

  return (
    <div className="h-screen overflow-hidden">
      <Sidebar />
      <div
        className="h-full transition-[margin] duration-300"
        style={{
          marginLeft: collapsed ? 64 : 224,
          transitionTimingFunction: "var(--ease-out-expo)",
          position: "relative",
        }}
      >
        <JobListPage animateIn={animateIn} />
      </div>
      <Assistant />
      <PreferencesDrawer />
    </div>
  );
}
```

- [ ] **Create `frontend/src/app/jobs/page.tsx`**

```tsx
// frontend/src/app/jobs/page.tsx
import { JobsShell } from "@/components/jobs/JobsShell";

interface Props {
  searchParams: Promise<{ from_upload?: string }>;
}

export default async function JobsPage({ searchParams }: Props) {
  const params = await searchParams;
  return <JobsShell animateIn={params.from_upload === "1"} />;
}
```

- [ ] **Verify TypeScript**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | grep -E "JobsShell|jobs/page"
```

Expected: no output

- [ ] **Start dev server and verify /jobs renders correctly**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && bash dev.sh
```

Open `http://localhost:3000/jobs`. Verify:
- Left sidebar visible with nav items
- Job list page fills remaining width
- 10 job cards in 2-column grid
- Constellation strip with arcs and cluster nodes (phase=3)
- Filter pills interactive
- Hover on a card: border strengthens, "Tailor & open" button inverts
- Floating command pill centered at bottom

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/components/jobs/JobsShell.tsx frontend/src/app/jobs/page.tsx && git commit -m "feat: add /jobs route with JobsShell"
```

---

### Task 10: MatchTransitionOverlay component

**Files:**
- Create: `frontend/src/components/transitions/MatchTransitionOverlay.tsx`

- [ ] **Create component**

```tsx
// frontend/src/components/transitions/MatchTransitionOverlay.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTransitionStore } from "@/stores/transition";
import { useJobMatchStore } from "@/stores/jobMatch";
import { EmbeddingConstellation } from "@/components/jobs/EmbeddingConstellation";

const STATUS: Record<number, string> = {
  1: "Vectorizing your résumé…",
  2: "Scanning 1,247 open roles",
  3: "Matching against your signature",
};
const COUNTER: Record<number, string> = { 1: "1,247", 2: "247", 3: "12" };
const COUNTER_LABEL: Record<number, string> = { 1: "in scope", 2: "shortlisted", 3: "strong fits" };

export function MatchTransitionOverlay() {
  const phase     = useTransitionStore((s) => s.phase);
  const resumeId  = useTransitionStore((s) => s.resumeId);
  const signature = useJobMatchStore((s) => s.signature);
  const router    = useRouter();

  // Push to /jobs between phase 2→3
  useEffect(() => {
    if (phase === 3 && resumeId) {
      router.push(`/jobs?from_upload=1&resume=${resumeId}`);
    }
  }, [phase, resumeId, router]);

  const constellationPhase = (Math.min(phase, 3)) as 0 | 1 | 2 | 3;

  return (
    <AnimatePresence>
      {phase >= 1 && phase <= 3 && (
        <motion.div
          key="match-overlay"
          initial={{ opacity: 0, clipPath: "circle(0% at 62% 50%)" }}
          animate={{ opacity: 1, clipPath: "circle(150% at 62% 50%)" }}
          exit={{ opacity: 0, transition: { duration: 0.7 } }}
          transition={{ duration: 0.6, ease: [0.7, 0, 0.3, 1] }}
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "oklch(0.13 0.025 34)", overflow: "hidden" }}
        >
          {/* Fluid background */}
          <div style={{ position: "absolute", inset: "-30%", background: `radial-gradient(ellipse 42% 52% at 24% 28%, oklch(0.62 0.17 38 / 0.55), transparent 62%), radial-gradient(ellipse 42% 52% at 76% 72%, oklch(0.55 0.14 152 / 0.42), transparent 62%), radial-gradient(ellipse 40% 50% at 50% 50%, oklch(0.55 0.15 268 / 0.40), transparent 62%)`, filter: "blur(44px) saturate(1.25)", animation: "flow 16s ease-in-out infinite alternate" }} />
          {/* Scrim */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, oklch(0.10 0.020 34 / 0.55) 0%, oklch(0.08 0.015 34 / 0.75) 100%)" }} />

          {/* Status pill — top left */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{ position: "absolute", left: 32, top: 32, display: "flex", alignItems: "center", gap: 10 }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "oklch(0.62 0.13 38)", boxShadow: "0 0 12px oklch(0.62 0.13 38)", animation: "beacon 1.2s ease-in-out infinite", flexShrink: 0 }} />
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
              {STATUS[phase] ?? ""}
            </span>
          </motion.div>

          {/* Counter — top right */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            style={{ position: "absolute", right: 32, top: 32, textAlign: "right" }}
          >
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, fontWeight: 500, letterSpacing: "0.20em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", marginBottom: 6 }}>Candidates</div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 36, fontWeight: 300, color: "#fff", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>{COUNTER[phase] ?? ""}</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{COUNTER_LABEL[phase] ?? ""}</div>
          </motion.div>

          {/* Center stage — tokens + constellation */}
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <div style={{ position: "relative", width: "72%", maxWidth: 920 }}>
              {/* Signature tokens */}
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 30, flexWrap: "wrap" }}>
                {signature.map((token, i) => (
                  <motion.span
                    key={token}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 + i * 0.08 }}
                    style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 500, padding: "7px 12px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
                  >
                    {token}
                  </motion.span>
                ))}
              </div>
              <EmbeddingConstellation phase={constellationPhase} dark />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Verify TypeScript**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | grep MatchTransitionOverlay
```

Expected: no output

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/components/transitions/MatchTransitionOverlay.tsx && git commit -m "feat: add MatchTransitionOverlay component"
```

---

### Task 11: Mount overlay at app root

**Files:**
- Create: `frontend/src/components/transitions/TransitionProvider.tsx`
- Modify: `frontend/src/app/layout.tsx`

The overlay must survive route changes, so it lives in the root layout. Layout is a Server Component, so a thin `"use client"` wrapper is needed.

- [ ] **Create `frontend/src/components/transitions/TransitionProvider.tsx`**

```tsx
// frontend/src/components/transitions/TransitionProvider.tsx
"use client";

import { MatchTransitionOverlay } from "./MatchTransitionOverlay";

export function TransitionProvider() {
  return <MatchTransitionOverlay />;
}
```

- [ ] **Add TransitionProvider to `frontend/src/app/layout.tsx`**

Add import:
```tsx
import { TransitionProvider } from "@/components/transitions/TransitionProvider";
```

Inside the `<body>` element, add `<TransitionProvider />` after `{children}`:
```tsx
<body className="font-[family-name:var(--font-body)] antialiased">
  {children}
  <TransitionProvider />
</body>
```

- [ ] **Verify TypeScript**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | grep -E "TransitionProvider|layout"
```

Expected: no output

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/components/transitions/TransitionProvider.tsx frontend/src/app/layout.tsx && git commit -m "feat: mount MatchTransitionOverlay at app root"
```

---

### Task 12: Wire LandingHero to trigger transition

**Files:**
- Modify: `frontend/src/components/landing/LandingHero.tsx`

- [ ] **Add import**

In `LandingHero.tsx`, add to existing imports:
```tsx
import { useTransitionStore } from "@/stores/transition";
```

- [ ] **Update `onDrop` to trigger the overlay**

Find the existing `onDrop` callback (currently lines 78–88):
```tsx
const onDrop = useCallback(
  async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setParsing(true);
    await new Promise((r) => setTimeout(r, 2000));
    setResumeData({ name: "Demo" }, file.name);
    setParsing(false);
  },
  [setParsing, setResumeData],
);
```

Replace with:
```tsx
const onDrop = useCallback(
  async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setParsing(true);
    await new Promise((r) => setTimeout(r, 2000));
    setResumeData({ name: "Demo" }, file.name);
    setParsing(false);
    useTransitionStore.getState().start("demo-resume-id");
  },
  [setParsing, setResumeData],
);
```

`useTransitionStore.getState()` is the Zustand static API — it does not need to be in the dependency array.

- [ ] **Verify TypeScript**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | grep LandingHero
```

Expected: no output

- [ ] **Test the full upload → transition → jobs flow manually**

Ensure the dev server is running (`bash dev.sh`). Open `http://localhost:3000`. Drop any PDF (or click the dropzone area). Verify in order:

1. Parsing state activates (2s spinner)
2. Overlay reveals with `clipPath` circle expanding from right (~62% 50%)
3. Status: "Vectorizing your résumé…" with pulsing terracotta dot; counter "1,247 in scope"
4. At ~1s — signature tokens fade up, constellation dots reach full opacity; counter "247 shortlisted"
5. At ~2.2s — arcs draw to cluster nodes, counter "12 strong fits"; browser navigates to `/jobs`
6. At ~4.2s — overlay fades out over 0.7s, job list page visible beneath
7. At ~4.9s — overlay fully gone

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/components/landing/LandingHero.tsx && git commit -m "feat: trigger match transition on upload, route to /jobs"
```

---

### Task 13: Add Discover nav item to Sidebar

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Add `Compass` to the lucide-react import**

Find the import line at the top of `Sidebar.tsx`:
```tsx
import {
  Home,
  BarChart3,
  PenLine,
  ...
} from "lucide-react";
```

Add `Compass` to the list.

- [ ] **Add Discover entry to `navItems`**

Find the `navItems` array. Add the Discover entry between Home and Analysis:
```tsx
const navItems = [
  { href: "/",         icon: Home,     label: "Home"     },
  { href: "/jobs",     icon: Compass,  label: "Discover" },
  { href: "/analysis", icon: BarChart3, label: "Analysis", disabled: true },
  { href: "/upload",   icon: PenLine,  label: "Editor"   },
  // ... rest unchanged
] as const;
```

- [ ] **Verify TypeScript**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor/frontend && npx tsc --noEmit 2>&1 | grep Sidebar
```

Expected: no output

- [ ] **Verify Discover appears in sidebar**

Open any page with the sidebar (e.g. `http://localhost:3000/jobs`). Verify:
- "Discover" nav item appears between Home and Analysis with a Compass icon
- Clicking navigates to `/jobs`
- Active highlight shows when on `/jobs`

- [ ] **Commit**

```bash
cd /Users/xufan/Desktop/AppDev/CareerOps-Pro-resume-editor && git add frontend/src/components/layout/Sidebar.tsx && git commit -m "feat: add Discover nav item to Sidebar"
```
