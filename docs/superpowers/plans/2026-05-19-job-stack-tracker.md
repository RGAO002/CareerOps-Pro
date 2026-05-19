# Job Stack + Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a focused 3-screen workflow — Job Stack (`/jobs`), Tracker (`/tracker`), connected by upload redirect and "Save to Tracker" CTA.

**Architecture:** Translate the Claude Design JSX prototypes into TypeScript React components, wired to the existing backend APIs (`/api/jobs/match`, `/api/tracker/board`, `/api/tracker/status`). All components use inline styles matching the existing `JobListPage.tsx` pattern. No new CSS classes. The upload flow in `LandingHero` and `PdfUploader` is modified to redirect to `/jobs` instead of Dashboard/editor.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zustand, Vitest + Testing Library, inline styles with CSS custom properties.

---

## File Map

**Create:**
- `frontend/src/components/jobs/CompanyLogo.tsx` — brand logo with fallback initial
- `frontend/src/components/jobs/ResumeThumb.tsx` — 148px tailored mini-doc
- `frontend/src/components/jobs/JobRow.tsx` — single job row
- `frontend/src/components/jobs/JobStackPage.tsx` — full Job Stack page
- `frontend/src/components/tracker/MiniDoc.tsx` — resume preview (50px small + 300px large)
- `frontend/src/components/tracker/StatusMenu.tsx` — editable status dropdown
- `frontend/src/components/tracker/TrackerRow.tsx` — single tracker row
- `frontend/src/components/tracker/TrackerPage.tsx` — full Tracker page
- `frontend/src/app/tracker/page.tsx` — Tracker route
- `frontend/src/lib/trackerApi.ts` — API calls for Tracker

**Modify:**
- `frontend/src/app/globals.css` — add missing tokens + new keyframes
- `frontend/src/components/jobs/JobsShell.tsx` — render `JobStackPage` without sidebar
- `frontend/src/components/landing/LandingHero.tsx` — redirect to `/jobs` after upload
- `frontend/src/components/upload/PdfUploader.tsx` — redirect to `/jobs` after upload

---

## Task 1: Add missing CSS tokens and keyframes to globals.css

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Check which tokens already exist**

```bash
grep -n "paper\|paper-pure\|border-strong\|subtle-fore\|row-in\|step-ring\|cta-pulse\|cta-shimmer\|thumb-pop\|pulse-dot" frontend/src/app/globals.css
```

Expected: no results (these are all new).

- [ ] **Step 2: Add missing tokens to the `:root` block (after existing token declarations)**

Open `frontend/src/app/globals.css`. Find the `:root` block (around line 66). After the existing `--terracotta-deep` line, add:

```css
    --paper:           oklch(0.99 0.005 55);
    --paper-pure:      #fefefe;
    --border-strong:   oklch(0.85 0.010 50);
    --subtle-foreground: oklch(0.62 0.010 55);
```

- [ ] **Step 3: Add new keyframes at the end of globals.css**

Append to the end of the file:

```css
/* ── Job Stack + Tracker animations ── */
@keyframes row-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: none; }
}
@keyframes step-ring {
  0%, 100% { transform: scale(1);    opacity: 0.35; }
  50%       { transform: scale(1.15); opacity: 0.18; }
}
@keyframes cta-pulse {
  0%, 100% {
    box-shadow: 0 8px 28px oklch(0.62 0.13 38 / 0.55),
                0 1px 0 oklch(1 0 0 / 0.20) inset;
  }
  50% {
    box-shadow: 0 12px 40px oklch(0.62 0.13 38 / 0.75),
                0 0 0 6px oklch(0.62 0.13 38 / 0.15),
                0 1px 0 oklch(1 0 0 / 0.20) inset;
  }
}
@keyframes cta-shimmer {
  0%   { left: -50%; }
  100% { left: 140%; }
}
@keyframes thumb-pop {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: none; }
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
```

- [ ] **Step 4: Verify the CSS builds**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no output (no TypeScript errors from CSS change).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "style: add job-stack/tracker tokens and keyframes"
```

---

## Task 2: CompanyLogo component

**Files:**
- Create: `frontend/src/components/jobs/CompanyLogo.tsx`
- Test: `frontend/src/components/jobs/__tests__/CompanyLogo.test.tsx`

Company logos: marquee brands (Apple, Stripe, Anthropic, Linear, Notion, Vercel, Figma) use brand colors; all others use initial letter on `--surface-1` bg.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/jobs/__tests__/CompanyLogo.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { CompanyLogo } from "../CompanyLogo";

describe("CompanyLogo", () => {
  it("renders Apple glyph SVG for Apple", () => {
    const { container } = render(<CompanyLogo company="Apple" logo="" logoBg="#000" logoFg="#fff" size={36} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders initial letter for unknown company", () => {
    render(<CompanyLogo company="Acme Corp" logo="A" logoBg="#abc" logoFg="#fff" size={36} />);
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("applies correct background for Stripe", () => {
    const { container } = render(<CompanyLogo company="Stripe" logo="S" logoBg="#635BFF" logoFg="#fff" size={36} />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.background).toBe("#635BFF");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/jobs/__tests__/CompanyLogo.test.tsx 2>&1 | tail -10
```

Expected: FAIL — "Cannot find module '../CompanyLogo'"

- [ ] **Step 3: Implement CompanyLogo**

Create `frontend/src/components/jobs/CompanyLogo.tsx`:

```tsx
"use client";

interface Props {
  company: string;
  logo: string;
  logoBg: string;
  logoFg: string;
  size?: number;
}

function AppleGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 170 200" fill={color}>
      <path d="M150.37 130.29c-2.34 5.4-5.1 10.36-8.3 14.92-4.36 6.22-7.92 10.52-10.67 12.9-4.27 3.92-8.84 5.93-13.74 6.05-3.52 0-7.76-1-12.7-3.04-4.96-2.02-9.51-3.03-13.67-3.03-4.36 0-9.04 1-14.04 3.03-5.01 2.04-9.05 3.1-12.13 3.21-4.69.2-9.37-1.87-14.04-6.21-2.97-2.59-6.69-7.04-11.16-13.36-4.79-6.74-8.73-14.55-11.81-23.45C5.81 111.7 4 102.27 4 93.13c0-10.48 2.27-19.51 6.81-27.07 3.57-6.07 8.32-10.86 14.27-14.39 5.95-3.52 12.38-5.32 19.32-5.43 3.74 0 8.65 1.16 14.74 3.44 6.08 2.29 9.97 3.45 11.69 3.45 1.28 0 5.62-1.36 13-4.07 6.97-2.51 12.85-3.55 17.66-3.14 13.04 1.05 22.83 6.2 29.34 15.46-11.66 7.07-17.42 16.97-17.31 29.7.1 9.91 3.66 18.16 10.69 24.74 3.18 3.02 6.74 5.36 10.7 7.03-.86 2.49-1.77 4.87-2.74 7.15zM119.27 7.05c0 7.83-2.86 15.14-8.55 21.92-6.87 8.06-15.18 12.72-24.19 12-.11-.94-.18-1.93-.18-2.97 0-7.51 3.27-15.57 9.08-22.16 2.9-3.34 6.6-6.11 11.07-8.32 4.46-2.18 8.68-3.38 12.66-3.59.11 1.04.11 2.08.11 3.12z" />
    </svg>
  );
}

export function CompanyLogo({ company, logo, logoBg, logoFg, size = 36 }: Props) {
  const radius = Math.round(size * 0.25);

  if (company === "Apple") {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: radius,
          background: "#000", display: "grid", placeItems: "center", flexShrink: 0,
        }}
      >
        <AppleGlyph size={size * 0.5} color="#fff" />
      </div>
    );
  }

  return (
    <div
      style={{
        width: size, height: size, borderRadius: radius,
        background: logoBg || "var(--surface-1)",
        border: logoBg === "#fff" ? "1px solid var(--border)" : "none",
        display: "grid", placeItems: "center", flexShrink: 0,
        font: `600 ${Math.round(size * 0.42)}px/1 Inter, system-ui, sans-serif`,
        color: logoFg || "var(--foreground)",
        letterSpacing: "-0.02em",
      }}
    >
      {logo}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/jobs/__tests__/CompanyLogo.test.tsx 2>&1 | tail -10
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/jobs/CompanyLogo.tsx frontend/src/components/jobs/__tests__/CompanyLogo.test.tsx
git commit -m "feat: add CompanyLogo component with brand color support"
```

---

## Task 3: ResumeThumb component

**Files:**
- Create: `frontend/src/components/jobs/ResumeThumb.tsx`

Renders a 148px wide miniature of a tailored resume PDF as actual HTML elements (not an icon).

- [ ] **Step 1: Create ResumeThumb**

Create `frontend/src/components/jobs/ResumeThumb.tsx`:

```tsx
"use client";

export interface TailoredData {
  changes: number;
  keywordsAdded: string[];
  headline: string;
  changedBullet: string;
}

interface Props {
  tailored: TailoredData;
  hover?: boolean;
}

function Sparkle({ size = 8, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L13.6 9.4L21 11L13.6 12.6L12 20L10.4 12.6L3 11L10.4 9.4Z" fill={color} />
    </svg>
  );
}

export function ResumeThumb({ tailored, hover = false }: Props) {
  return (
    <div
      style={{
        position: "relative", width: 148, flexShrink: 0,
        transform: hover ? "translateY(-2px)" : "none",
        transition: "transform 0.3s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      {/* Paper stack shadow */}
      <div
        style={{
          position: "absolute", inset: 0,
          transform: "translate(3px,3px)", borderRadius: 6,
          background: "var(--surface-2)", opacity: 0.5,
        }}
      />
      {/* Paper */}
      <div
        style={{
          position: "relative", width: "100%", aspectRatio: "8.5/11",
          borderRadius: 5, background: "var(--paper-pure)",
          border: "1px solid var(--border)",
          boxShadow: hover
            ? "0 10px 24px rgba(40,30,20,0.12), 0 2px 4px rgba(40,30,20,0.06)"
            : "0 1px 2px rgba(40,30,20,0.05), 0 3px 8px rgba(40,30,20,0.03)",
          padding: "10px 11px",
          fontFamily: '"Source Serif Pro", Georgia, serif',
          overflow: "hidden",
          transition: "box-shadow 0.3s ease",
        }}
      >
        {/* Tailored ribbon */}
        <div
          style={{
            position: "absolute", top: 0, right: 0,
            padding: "2px 5px", background: "var(--terracotta)", color: "#fff",
            font: '500 6.5px/1 "JetBrains Mono", monospace',
            letterSpacing: "0.12em", textTransform: "uppercase",
            borderRadius: "0 5px 0 5px",
          }}
        >
          tailored
        </div>

        {/* Name header */}
        <div
          style={{
            textAlign: "center", borderBottom: "0.5px solid var(--border)",
            paddingBottom: 4, marginBottom: 5,
          }}
        >
          <div style={{ font: "600 8px/1.15 Inter, sans-serif", color: "var(--foreground)", letterSpacing: "-0.01em" }}>
            Your Resume
          </div>
          <div style={{ font: "400 5px/1.4 Inter, sans-serif", color: "var(--muted-foreground)", marginTop: 1 }}>
            tailored version
          </div>
        </div>

        {/* Summary */}
        <div style={{ font: "600 5px/1 Inter, sans-serif", color: "var(--subtle-foreground)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>
          Summary
        </div>
        <p style={{ font: '400 5px/1.4 "Source Serif Pro", Georgia, serif', color: "var(--foreground)", margin: "0 0 5px" }}>
          {tailored.headline}.
        </p>

        {/* Experience */}
        <div style={{ font: "600 5px/1 Inter, sans-serif", color: "var(--subtle-foreground)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2, marginTop: 4 }}>
          Experience
        </div>
        {/* Tailored bullet highlight */}
        <div
          style={{
            position: "relative", padding: "3px 4px", borderRadius: 2,
            background: "color-mix(in oklch, var(--terracotta) 10%, transparent)",
            borderLeft: "1.5px solid var(--terracotta)",
          }}
        >
          <p
            style={{
              font: '400 5px/1.35 "Source Serif Pro", Georgia, serif',
              color: "var(--foreground)", margin: 0,
              display: "-webkit-box", WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {tailored.changedBullet}
          </p>
        </div>

        {/* Placeholder lines */}
        <div style={{ marginTop: 4 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 2.5, marginBottom: 2, borderRadius: 1,
                background: "var(--surface-2)",
                width: ["92%", "85%", "78%", "62%"][i],
                opacity: 0.55 - i * 0.10,
              }}
            />
          ))}
        </div>
      </div>

      {/* Caption */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7, padding: "0 2px" }}>
        <Sparkle size={8} color="var(--terracotta)" />
        <span style={{ font: "500 9.5px/1 Inter, sans-serif", color: "var(--muted-foreground)", letterSpacing: "-0.005em" }}>
          {tailored.changes} edits · {tailored.keywordsAdded.length} keywords
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "ResumeThumb"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/jobs/ResumeThumb.tsx
git commit -m "feat: add ResumeThumb mini-doc component"
```

---

## Task 4: JobRow component

**Files:**
- Create: `frontend/src/components/jobs/JobRow.tsx`

Single row: tier strip · logo · job info · Apply link · tier+match ring · ResumeThumb.

- [ ] **Step 1: Create JobRow**

Create `frontend/src/components/jobs/JobRow.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CompanyLogo } from "./CompanyLogo";
import { ResumeThumb, type TailoredData } from "./ResumeThumb";
import { MatchRing } from "./MatchRing";

export interface StackJob {
  id: string;
  co: string;
  logo: string;
  logoBg: string;
  logoFg: string;
  role: string;
  loc: string;
  salary: string;
  posted: string;
  applyHref: string;
  match: number;
  tier: "A" | "B" | "C";
  tags: string[];
  tailored: TailoredData;
}

interface Props {
  job: StackJob;
  index: number;
  animateIn: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  isLast: boolean;
}

const TIER_COLOR = {
  A: "var(--positive)",
  B: "var(--warn)",
  C: "var(--muted-foreground)",
} as const;

const TIER_LABEL = { A: "Strong", B: "Good", C: "Stretch" } as const;

export function JobRow({ job, index, animateIn, selected, onSelect, isLast }: Props) {
  const [hover, setHover] = useState(false);
  const tierColor = TIER_COLOR[job.tier];
  const tierLabel = TIER_LABEL[job.tier];
  const h1bTags = job.tags.filter((t) => t.includes("H1B") || t.includes("H-1B"));

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onSelect(job.id)}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 24,
        padding: "14px 24px",
        background: selected ? "color-mix(in oklch, var(--terracotta) 5%, transparent)" : "transparent",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        cursor: "pointer",
        animation: animateIn
          ? `row-in 0.6s ${0.08 + index * 0.06}s cubic-bezier(.2,.8,.2,1) both`
          : "none",
      }}
    >
      {/* Tier strip */}
      <div
        style={{
          position: "absolute", left: 0, top: 12, bottom: 12, width: 2,
          background: tierColor,
          opacity: hover || selected ? 1 : 0,
          transition: "opacity 0.25s ease",
          borderRadius: "0 2px 2px 0",
        }}
      />

      <CompanyLogo company={job.co} logo={job.logo} logoBg={job.logoBg} logoFg={job.logoFg} size={36} />

      {/* Job info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
          <span
            style={{
              font: "500 14.5px/1.2 Inter, sans-serif", color: "var(--foreground)",
              letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {job.role}
          </span>
          <span style={{ font: "400 12.5px/1 Inter, sans-serif", color: "var(--muted-foreground)", flexShrink: 0 }}>
            · {job.co}
          </span>
        </div>
        <div
          style={{
            display: "inline-flex", alignItems: "center",
            font: "400 11.5px/1.3 Inter, sans-serif", color: "var(--muted-foreground)", flexWrap: "wrap",
          }}
        >
          <span>{job.loc}</span>
          <span style={{ margin: "0 6px", color: "var(--subtle-foreground)" }}>·</span>
          <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{job.salary}</span>
          <span style={{ margin: "0 6px", color: "var(--subtle-foreground)" }}>·</span>
          <span>{job.posted}</span>
          {h1bTags.map((t) => (
            <span
              key={t}
              style={{
                marginLeft: 8, font: "500 9.5px/1 Inter, sans-serif",
                padding: "3px 7px", borderRadius: 3,
                background: "color-mix(in oklch, var(--terracotta) 10%, transparent)",
                border: "1px solid color-mix(in oklch, var(--terracotta) 30%, transparent)",
                color: "var(--terracotta-deep)", letterSpacing: "0.02em",
                display: "inline-flex", alignItems: "center", gap: 3,
              }}
            >
              ★ {t}
            </span>
          ))}
        </div>
      </div>

      {/* Apply */}
      <a
        href={job.applyHref || "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
          font: "500 11.5px/1 Inter, sans-serif", color: "var(--muted-foreground)",
          textDecoration: "none", padding: "5px 8px", borderRadius: 5,
          border: "1px solid var(--border)", background: "var(--paper)",
          transition: "color 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.color = "var(--foreground)";
          (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border-strong)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.color = "var(--muted-foreground)";
          (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)";
        }}
      >
        Apply
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </a>

      {/* Tier + match */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              font: '500 8.5px/1 "JetBrains Mono", monospace',
              letterSpacing: "0.18em", textTransform: "uppercase",
              color: tierColor, marginBottom: 3,
            }}
          >
            {tierLabel} fit
          </div>
          <div style={{ font: "400 10px/1 Inter, sans-serif", color: "var(--subtle-foreground)" }}>
            {job.match} match
          </div>
        </div>
        <MatchRing score={job.match} size={32} />
      </div>

      <ResumeThumb tailored={job.tailored} hover={hover} />
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "JobRow"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/jobs/JobRow.tsx
git commit -m "feat: add JobRow component"
```

---

## Task 5: JobStackPage component

**Files:**
- Create: `frontend/src/components/jobs/JobStackPage.tsx`

Assembles top bar, stepper, header, job list, and bottom CTA. Consumes `useJobMatchStore`. Maps existing `Job` type to `StackJob` shape (adding mock tailored data if not present).

- [ ] **Step 1: Create JobStackPage**

Create `frontend/src/components/jobs/JobStackPage.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useJobMatchStore, type Job } from "@/stores/jobMatch";
import { JobRow, type StackJob } from "./JobRow";
import type { TailoredData } from "./ResumeThumb";

// Fallback tailored data when real tailoring isn't available
function mockTailored(job: Job): TailoredData {
  return {
    changes: Math.floor(job.matchScore / 15),
    keywordsAdded: job.matchReasons.slice(0, 3),
    headline: `${job.title} · ${job.company}`,
    changedBullet: job.matchReasons[0] ?? "Strong alignment with role requirements.",
  };
}

function jobToStack(job: Job): StackJob {
  return {
    id: job.id,
    co: job.company,
    logo: job.company.charAt(0).toUpperCase(),
    logoBg: BRAND_COLORS[job.company]?.bg ?? "var(--surface-1)",
    logoFg: BRAND_COLORS[job.company]?.fg ?? "var(--foreground)",
    role: job.title,
    loc: job.location,
    salary: job.salary || "—",
    posted: "recently",
    applyHref: job.applyUrl,
    match: job.matchScore,
    tier: job.tier,
    tags: job.tags,
    tailored: mockTailored(job),
  };
}

const BRAND_COLORS: Record<string, { bg: string; fg: string }> = {
  Apple:     { bg: "#000",     fg: "#fff"     },
  Stripe:    { bg: "#635BFF", fg: "#fff"     },
  Anthropic: { bg: "#181918", fg: "#D97757"  },
  Linear:    { bg: "#5E6AD2", fg: "#fff"     },
  Notion:    { bg: "#fff",    fg: "#000"     },
  Vercel:    { bg: "#000",    fg: "#fff"     },
  Figma:     { bg: "#0ACF83", fg: "#fff"     },
};

interface Props {
  animateIn: boolean;
  resumeId: string | null;
}

export function JobStackPage({ animateIn, resumeId }: Props) {
  const router = useRouter();
  const fetch   = useJobMatchStore((s) => s.fetch);
  const matches = useJobMatchStore((s) => s.matches);
  const loading = useJobMatchStore((s) => s.loading);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (resumeId) fetch(resumeId);
  }, [resumeId, fetch]);

  const stackJobs = matches.map(jobToStack);

  function handleSaveToTracker() {
    router.push("/tracker");
  }

  return (
    <div
      style={{
        height: "100%", display: "flex", flexDirection: "column",
        background: "var(--background)", fontFamily: "Inter, system-ui, sans-serif",
        color: "var(--foreground)", overflow: "hidden",
      }}
    >
      {/* TOP BAR */}
      <div
        style={{
          height: 56, flexShrink: 0, padding: "0 24px",
          display: "flex", alignItems: "center", gap: 14,
          background: "rgba(252,250,247,0.78)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <div
          style={{
            width: 30, height: 30, borderRadius: 9,
            background: "linear-gradient(135deg, var(--terracotta), var(--terracotta-deep))",
            display: "grid", placeItems: "center",
            boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.22), 0 2px 8px oklch(0.50 0.12 32 / 0.25)",
          }}
        >
          <span style={{ font: "700 13px/1 Inter, sans-serif", color: "#fff" }}>C</span>
        </div>
        <span style={{ font: "500 14px/1 Inter, sans-serif", letterSpacing: "-0.01em" }}>
          CareerOps{" "}
          <em style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontStyle: "italic", fontWeight: 400, fontSize: 14, color: "var(--terracotta-deep)" }}>Pro</em>
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => router.push("/")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
            background: "transparent", font: "400 11.5px/1 Inter, sans-serif",
            color: "var(--muted-foreground)", cursor: "pointer",
          }}
        >
          Re-upload resume
        </button>
      </div>

      {/* STEPPER BAND */}
      <div style={{ flexShrink: 0, background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
        <div
          style={{
            maxWidth: 1100, margin: "0 auto", width: "100%",
            padding: "26px 28px",
            display: "flex", alignItems: "center", gap: 0,
          }}
        >
          {(
            [
              { n: 1, label: "Upload",       state: "done"     },
              { n: 2, label: "Choose role",  state: "current"  },
              { n: 3, label: "Refine & send",state: "upcoming" },
            ] as const
          ).map((s, i, arr) => (
            <StepperItem key={s.n} step={s} isLast={i === arr.length - 1} isDone={s.state === "done"} />
          ))}
        </div>
      </div>

      {/* SCROLLABLE AREA */}
      <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        {/* Page header */}
        <div
          style={{
            padding: "28px 28px 14px", maxWidth: 1100, margin: "0 auto", width: "100%",
            animation: animateIn ? "fade-up 0.7s 0.05s cubic-bezier(.2,.8,.2,1) both" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
            <div>
              {/* Status badge */}
              <div
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12,
                  padding: "5px 11px 5px 9px", borderRadius: 999,
                  background: "color-mix(in oklch, var(--positive) 12%, transparent)",
                  border: "1px solid color-mix(in oklch, var(--positive) 30%, transparent)",
                }}
              >
                <span
                  style={{
                    width: 6, height: 6, borderRadius: 999, background: "var(--positive)",
                    boxShadow: "0 0 8px var(--positive)",
                  }}
                />
                <span
                  style={{
                    font: '500 10.5px/1 "JetBrains Mono", monospace',
                    letterSpacing: "0.14em", color: "var(--positive)", textTransform: "uppercase",
                  }}
                >
                  Ready to apply
                </span>
              </div>

              <h1
                style={{
                  font: '400 38px/1.1 "Instrument Serif", Georgia, serif',
                  letterSpacing: "-0.02em", margin: 0, color: "var(--foreground)",
                }}
              >
                We found{" "}
                <em style={{ fontStyle: "italic", color: "var(--terracotta-deep)" }}>
                  {loading ? "…" : stackJobs.length} roles
                </em>{" "}
                for you,
                <br />
                and tailored your resume for each.
              </h1>
              <p
                style={{
                  font: "400 13.5px/1.55 Inter, sans-serif", color: "var(--muted-foreground)",
                  margin: "12px 0 0", maxWidth: 580,
                }}
              >
                Each version is keyword-aligned, role-specific, and ready to send.
                Click any row to refine before you ship.
              </p>
            </div>

            {/* Source file pill */}
            <div style={{ textAlign: "right", flexShrink: 0, paddingBottom: 6 }}>
              <div
                style={{
                  font: '500 9.5px/1 "JetBrains Mono", monospace',
                  letterSpacing: "0.18em", color: "var(--subtle-foreground)",
                  textTransform: "uppercase", marginBottom: 6,
                }}
              >
                Source resume
              </div>
              <div
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "7px 11px", borderRadius: 8,
                  background: "var(--paper)", border: "1px solid var(--border)",
                }}
              >
                <svg width="13" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ font: "500 12px/1 Inter, sans-serif", color: "var(--foreground)" }}>
                  resume.pdf
                </span>
                <span style={{ font: '400 10.5px/1 "JetBrains Mono", monospace', color: "var(--subtle-foreground)" }}>
                  v1
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Job list */}
        <div
          style={{
            maxWidth: 1100, margin: "0 auto 200px", width: "100%",
            background: "var(--paper)", border: "1px solid var(--border)",
            borderRadius: 14, overflow: "hidden",
            boxShadow: "0 1px 2px oklch(0.40 0.04 42 / 0.04), 0 8px 32px oklch(0.40 0.04 42 / 0.05)",
          }}
        >
          {loading ? (
            <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--muted-foreground)", font: "400 14px/1.5 Inter, sans-serif" }}>
              Fetching your matches…
            </div>
          ) : (
            stackJobs.map((job, i) => (
              <JobRow
                key={job.id}
                job={job}
                index={i}
                animateIn={animateIn}
                selected={selected === job.id}
                onSelect={setSelected}
                isLast={i === stackJobs.length - 1}
              />
            ))
          )}
        </div>
      </div>

      {/* BOTTOM CTA */}
      <div
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          padding: "20px 28px 26px",
          display: "flex", justifyContent: "center",
          pointerEvents: "none",
          background: "linear-gradient(180deg, transparent, color-mix(in oklch, var(--background) 85%, transparent) 40%, var(--background) 100%)",
          zIndex: 20,
          animation: animateIn ? "fade-up 0.7s 1.2s cubic-bezier(.2,.8,.2,1) both" : "none",
        }}
      >
        <button
          onClick={handleSaveToTracker}
          style={{
            pointerEvents: "auto",
            position: "relative", display: "inline-flex", alignItems: "center", gap: 12,
            padding: "18px 36px 18px 32px", borderRadius: 14, border: 0,
            background: "linear-gradient(180deg, var(--terracotta), var(--terracotta-deep))",
            color: "#fff",
            font: "600 16px/1 Inter, sans-serif",
            letterSpacing: "-0.005em",
            boxShadow: "0 8px 28px oklch(0.62 0.13 38 / 0.55), 0 1px 0 oklch(1 0 0 / 0.20) inset, 0 -1px 0 oklch(0 0 0 / 0.10) inset",
            cursor: "pointer",
            animation: "cta-pulse 2.4s ease-in-out infinite",
            overflow: "hidden",
          }}
        >
          {/* Shimmer overlay */}
          <span
            style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              overflow: "hidden", borderRadius: 14,
            }}
          >
            <span
              style={{
                position: "absolute", top: 0, bottom: 0, width: "40%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
                animation: "cta-shimmer 3.5s ease-in-out infinite",
              }}
            />
          </span>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative" }}>
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ position: "relative" }}>Save {stackJobs.length} to Tracker</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative", opacity: 0.85 }}>
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Stepper item — extracted for readability
function StepperItem({
  step, isLast, isDone,
}: {
  step: { n: number; label: string; state: "done" | "current" | "upcoming" };
  isLast: boolean;
  isDone: boolean;
}) {
  const isCurrent = step.state === "current";
  const isUpcoming = step.state === "upcoming";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <div style={{ position: "relative", width: 48, height: 48 }}>
          {isCurrent && (
            <span
              style={{
                position: "absolute", inset: -4, borderRadius: 999,
                border: "1.5px solid var(--terracotta)", opacity: 0.35,
                animation: "step-ring 2.2s ease-out infinite",
              }}
            />
          )}
          <div
            style={{
              width: 48, height: 48, borderRadius: 999,
              background: isDone ? "var(--positive)" : isCurrent ? "var(--terracotta)" : "#fff",
              border: isUpcoming ? "1.5px solid var(--border)" : "none",
              color: isUpcoming ? "var(--muted-foreground)" : "#fff",
              display: "grid", placeItems: "center",
              font: "600 18px/1 Inter, sans-serif",
              boxShadow: isCurrent
                ? "0 0 0 6px color-mix(in oklch, var(--terracotta) 12%, transparent), 0 6px 18px color-mix(in oklch, var(--terracotta) 40%, transparent)"
                : isDone
                ? "0 0 0 4px color-mix(in oklch, var(--positive) 10%, transparent)"
                : "none",
            }}
          >
            {isDone ? "✓" : step.n}
          </div>
        </div>
        <span
          style={{
            font: isCurrent ? "600 19px/1 Inter, sans-serif" : "500 18px/1 Inter, sans-serif",
            color: isUpcoming ? "var(--muted-foreground)" : "var(--foreground)",
            letterSpacing: "-0.015em",
          }}
        >
          {step.label}
        </span>
      </div>
      {!isLast && (
        <div
          style={{
            flex: 1, height: 2, margin: "0 24px",
            background: "var(--surface-2)", borderRadius: 999, position: "relative", overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: isDone ? "100%" : "0%",
              background: "var(--positive)",
              transition: "width 0.6s cubic-bezier(.2,.8,.2,1)",
            }}
          />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "JobStackPage"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/jobs/JobStackPage.tsx
git commit -m "feat: add JobStackPage component"
```

---

## Task 6: Swap JobsShell + modify upload redirects

**Files:**
- Modify: `frontend/src/components/jobs/JobsShell.tsx`
- Modify: `frontend/src/components/landing/LandingHero.tsx`
- Modify: `frontend/src/components/upload/PdfUploader.tsx`

- [ ] **Step 1: Swap JobsShell to render JobStackPage without sidebar**

Replace the entire content of `frontend/src/components/jobs/JobsShell.tsx` with:

```tsx
"use client";

import { JobStackPage } from "./JobStackPage";

interface Props { animateIn: boolean; resumeId: string | null; }

export function JobsShell({ animateIn, resumeId }: Props) {
  return (
    <div className="h-screen overflow-hidden">
      <JobStackPage animateIn={animateIn} resumeId={resumeId} />
    </div>
  );
}
```

- [ ] **Step 2: Modify LandingHero to redirect to /jobs after upload**

In `frontend/src/components/landing/LandingHero.tsx`, find the `onDrop` callback (around line 80):

```tsx
const onDrop = useCallback(
  async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setParsing(true);
    try {
      const v3 = await parseResumeFile(file);
      const resumeId = v3.id as string;
      setResumeData(v3, file.name);
      setParsing(false);
      useTransitionStore.getState().start(resumeId);   // ← REMOVE this line
    } catch {
      setParsing(false);
    }
  },
  [setParsing, setResumeData],
);
```

Replace with:

```tsx
const router = useRouter();

const onDrop = useCallback(
  async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setParsing(true);
    try {
      const v3 = await parseResumeFile(file);
      const resumeId = v3.id as string;
      setResumeData(v3, file.name);
      setParsing(false);
      router.push(`/jobs?from_upload=1&resume=${resumeId}`);
    } catch {
      setParsing(false);
    }
  },
  [setParsing, setResumeData, router],
);
```

Also add `useRouter` import from `"next/navigation"` at the top of the file.

- [ ] **Step 3: Modify PdfUploader redirect**

In `frontend/src/components/upload/PdfUploader.tsx`, find:

```tsx
router.push(`/resume/${r.id}?just_imported=1`);
```

Replace with:

```tsx
router.push(`/jobs?from_upload=1&resume=${r.id}`);
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/jobs/JobsShell.tsx frontend/src/components/landing/LandingHero.tsx frontend/src/components/upload/PdfUploader.tsx
git commit -m "feat: wire upload → /jobs workflow, remove sidebar from jobs page"
```

---

## Task 7: MiniDoc component (Tracker resume preview)

**Files:**
- Create: `frontend/src/components/tracker/MiniDoc.tsx`

Renders a resume preview at two sizes: `small` (50×65) and `large` (300×388).

- [ ] **Step 1: Create MiniDoc**

```bash
mkdir -p frontend/src/components/tracker
```

Create `frontend/src/components/tracker/MiniDoc.tsx`:

```tsx
"use client";

export interface TrackerRowData {
  id: string;
  co: string;
  logoBg: string;
  logoFg: string;
  logo: string;
  role: string;
  loc: string;
  salary: string;
  match: number;
  status: TrackerStatus;
  stage: string;
  updated: string;
  appliedAt: string;
  resumeVer: string;
  resumeName: string;
  tailored: { headline: string; changedBullet: string };
  nextAction: string | null;
  deadline: string | null;
  deadlineUrgent: boolean;
  source: string;
  stale?: boolean;
}

export type TrackerStatus = "saved" | "applied" | "interview" | "offer" | "rejected";

interface Props {
  row: TrackerRowData;
  variant: "small" | "large";
}

export function MiniDoc({ row, variant }: Props) {
  const large = variant === "large";
  const W = large ? 300 : 50;
  const H = large ? 388 : 65;
  const scale = large ? 1.32 : 0.219;
  const sz = (n: number) => Math.max(0.5, n * scale);
  const t = row.tailored;

  return (
    <div
      style={{
        width: W, height: H, position: "relative",
        borderRadius: large ? 6 : 3,
        background: "var(--paper-pure)",
        border: `1px solid ${large ? "var(--border-strong)" : "var(--border)"}`,
        boxShadow: large ? "0 1px 2px rgba(40,30,20,0.05)" : "0 1px 1px rgba(40,30,20,0.04)",
        padding: large ? "22px 26px" : "4px 5px",
        fontFamily: '"Source Serif Pro", Georgia, serif',
        overflow: "hidden",
      }}
    >
      {/* Tailored ribbon */}
      <div
        style={{
          position: "absolute", top: 0, right: 0,
          padding: large ? "3px 6px" : "1.5px 3px",
          background: "var(--terracotta)", color: "#fff",
          font: `500 ${sz(8)}px/1 "JetBrains Mono", monospace`,
          letterSpacing: "0.12em", textTransform: "uppercase",
          borderRadius: `0 ${large ? 6 : 3}px 0 ${large ? 6 : 3}px`,
        }}
      >
        {large ? "tailored" : "✦"}
      </div>

      {/* Header */}
      <div
        style={{
          textAlign: "center",
          borderBottom: "0.5px solid var(--border)",
          paddingBottom: large ? 5 : 1.5,
          marginBottom: large ? 6 : 2,
        }}
      >
        <div style={{ font: `600 ${sz(11)}px/1.15 Inter, sans-serif`, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
          Your Resume
        </div>
        {large && (
          <div style={{ font: "400 7px/1.4 Inter, sans-serif", color: "var(--muted-foreground)", marginTop: 2 }}>
            {row.resumeName}
          </div>
        )}
      </div>

      {/* Summary */}
      <div style={{ font: `600 ${sz(7)}px/1 Inter, sans-serif`, color: "var(--subtle-foreground)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: large ? 3 : 1 }}>
        Summary
      </div>
      <p style={{ font: `400 ${sz(8)}px/1.4 "Source Serif Pro", Georgia, serif`, color: "var(--foreground)", margin: `0 0 ${large ? 6 : 2}px` }}>
        {large ? `${t.headline}. Tailored for ${row.co}.` : t.headline}
      </p>

      {large && (
        <div style={{ font: "600 7px/1 Inter, sans-serif", color: "var(--subtle-foreground)", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 8, marginBottom: 3 }}>
          Experience
        </div>
      )}

      {/* Tailored bullet */}
      <div
        style={{
          position: "relative",
          padding: large ? "5px 7px" : "1.5px 3px",
          background: "color-mix(in oklch, var(--terracotta) 10%, transparent)",
          borderRadius: large ? 3 : 1.5,
          borderLeft: `${large ? 2 : 1}px solid var(--terracotta)`,
        }}
      >
        <p
          style={{
            font: `400 ${sz(7.5)}px/1.4 "Source Serif Pro", Georgia, serif`,
            color: "var(--foreground)", margin: 0,
            display: "-webkit-box", WebkitLineClamp: large ? 6 : 2,
            WebkitBoxOrient: "vertical", overflow: "hidden",
          }}
        >
          {large ? t.changedBullet : t.changedBullet.slice(0, 40) + "…"}
        </p>
      </div>

      {/* Faded lines */}
      <div style={{ marginTop: large ? 6 : 2 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: large ? 3 : 1, marginBottom: large ? 3 : 1, borderRadius: 1,
              background: "var(--surface-2)",
              width: ["92%", "85%", "78%", "62%"][i],
              opacity: 0.55 - i * 0.10,
            }}
          />
        ))}
      </div>

      {large && (
        <div
          style={{
            position: "absolute", left: 22, right: 22, bottom: 12,
            display: "flex", justifyContent: "space-between",
            font: '500 6.5px/1 "JetBrains Mono", monospace',
            color: "var(--subtle-foreground)", letterSpacing: "0.08em",
          }}
        >
          <span>{row.resumeName}</span>
          <span>{row.resumeVer} · 2pp</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "MiniDoc"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tracker/MiniDoc.tsx
git commit -m "feat: add MiniDoc resume preview component"
```

---

## Task 8: StatusMenu component

**Files:**
- Create: `frontend/src/components/tracker/StatusMenu.tsx`

Editable status chip + dropdown. Click chip → dropdown with 5 options. Click outside → closes.

- [ ] **Step 1: Create StatusMenu**

Create `frontend/src/components/tracker/StatusMenu.tsx`:

```tsx
"use client";

import type { TrackerStatus } from "./MiniDoc";

export const STATUSES: Record<TrackerStatus, { label: string; tone: string }> = {
  saved:     { label: "Saved",     tone: "var(--muted-foreground)" },
  applied:   { label: "Applied",   tone: "var(--coach)" },
  interview: { label: "Interview", tone: "var(--warn)" },
  offer:     { label: "Offer",     tone: "var(--positive)" },
  rejected:  { label: "Rejected",  tone: "var(--terracotta-deep)" },
};

interface StatusButtonProps {
  status: TrackerStatus;
  isOpen: boolean;
  onToggle: () => void;
}

export function StatusButton({ status, isOpen, onToggle }: StatusButtonProps) {
  const s = STATUSES[status];
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 7px", borderRadius: 5,
        background: `color-mix(in oklch, ${s.tone} 10%, transparent)`,
        border: `1px solid color-mix(in oklch, ${s.tone} ${isOpen ? "100%" : "25%"}, transparent)`,
        font: "500 11px/1 Inter, sans-serif", color: s.tone,
        cursor: "pointer", letterSpacing: "-0.005em",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.tone }} />
      {s.label}
      <svg
        width="8" height="8" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", opacity: 0.7 }}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

interface StatusMenuProps {
  currentStatus: TrackerStatus;
  onSelect: (status: TrackerStatus) => void;
  onClose: () => void;
}

export function StatusMenu({ currentStatus, onSelect, onClose }: StatusMenuProps) {
  return (
    <>
      {/* Click-outside catch */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100 }} />
      <div
        style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 110,
          minWidth: 170, background: "var(--paper)",
          border: "1px solid var(--border-strong)", borderRadius: 8,
          boxShadow: "0 16px 36px rgba(40,30,20,0.14), 0 2px 6px rgba(40,30,20,0.06)",
          padding: 4,
        }}
      >
        {(Object.entries(STATUSES) as [TrackerStatus, { label: string; tone: string }][]).map(([key, s]) => {
          const active = key === currentStatus;
          return (
            <button
              key={key}
              onClick={(e) => { e.stopPropagation(); onSelect(key); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "7px 10px", borderRadius: 5, border: 0,
                background: active ? "var(--surface-1)" : "transparent",
                font: `${active ? 500 : 400} 12px/1 Inter, sans-serif`,
                color: "var(--foreground)", cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-1)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = active ? "var(--surface-1)" : "transparent"; }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: s.tone }} />
              <span style={{ flex: 1 }}>{s.label}</span>
              {active && <span style={{ font: "400 10px/1 Inter, sans-serif", color: "var(--positive)" }}>✓</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "StatusMenu"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tracker/StatusMenu.tsx
git commit -m "feat: add StatusMenu editable status dropdown"
```

---

## Task 9: TrackerRow component

**Files:**
- Create: `frontend/src/components/tracker/TrackerRow.tsx`

Single row with: logo · role · editable status · next action · apply · editor → · resume thumbnail (rightmost, hover-to-enlarge popout).

- [ ] **Step 1: Create TrackerRow**

Create `frontend/src/components/tracker/TrackerRow.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { CompanyLogo } from "@/components/jobs/CompanyLogo";
import { MiniDoc, type TrackerRowData, type TrackerStatus } from "./MiniDoc";
import { StatusButton, StatusMenu } from "./StatusMenu";

interface Props {
  row: TrackerRowData;
  isLast: boolean;
  openStatusFor: string | null;
  setOpenStatusFor: (id: string | null) => void;
  updateStatus: (id: string, status: TrackerStatus) => void;
  onOpenEditor: (id: string) => void;
}

export function TrackerRow({ row, isLast, openStatusFor, setOpenStatusFor, updateStatus, onOpenEditor }: Props) {
  const [thumbHover, setThumbHover] = useState(false);
  const [popPos, setPopPos] = useState<{ left: number; top: number } | null>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!thumbHover || !thumbRef.current) { setPopPos(null); return; }
    const r = thumbRef.current.getBoundingClientRect();
    const W = 300, H = 388, GAP = 12;
    let left = r.left - W - GAP;
    if (left < 12) left = r.right + GAP;
    let top = r.top + r.height / 2 - H / 2;
    const vh = window.innerHeight || 900;
    top = Math.max(12, Math.min(top, vh - H - 12));
    setPopPos({ left, top });
  }, [thumbHover]);

  const isStatusOpen = openStatusFor === row.id;

  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "34px 1.4fr 0.95fr 1.0fr 70px 78px 64px",
        alignItems: "center", columnGap: 14,
        padding: "10px 18px",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        transition: "background 0.15s ease",
      }}
    >
      {/* Stale indicator */}
      {row.stale && (
        <span
          style={{
            position: "absolute", left: 0, top: 10, bottom: 10, width: 2,
            background: "var(--warn)", borderRadius: "0 2px 2px 0",
          }}
        />
      )}

      {/* Logo */}
      <CompanyLogo company={row.co} logo={row.logo} logoBg={row.logoBg} logoFg={row.logoFg} size={30} />

      {/* Company + role */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
          <span style={{ font: "500 13px/1.2 Inter, sans-serif", color: "var(--foreground)", letterSpacing: "-0.005em" }}>
            {row.co}
          </span>
          <span style={{ font: "400 11.5px/1 Inter, sans-serif", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            · {row.role}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, font: "400 10.5px/1.3 Inter, sans-serif", color: "var(--subtle-foreground)" }}>
          <span>{row.loc} · {row.salary}</span>
          <span style={{ font: '500 9px/1 "JetBrains Mono", monospace', letterSpacing: "0.10em", textTransform: "uppercase", padding: "2px 5px", borderRadius: 3, background: "var(--surface-2)", color: "var(--muted-foreground)" }}>
            {row.source}
          </span>
        </div>
      </div>

      {/* Status — editable */}
      <div style={{ position: "relative" }}>
        <StatusButton
          status={row.status}
          isOpen={isStatusOpen}
          onToggle={() => setOpenStatusFor(isStatusOpen ? null : row.id)}
        />
        <div style={{ font: "400 10px/1.3 Inter, sans-serif", color: "var(--muted-foreground)", marginTop: 3, paddingLeft: 2 }}>
          {row.stage}
        </div>
        {isStatusOpen && (
          <StatusMenu
            currentStatus={row.status}
            onSelect={(next) => { updateStatus(row.id, next); setOpenStatusFor(null); }}
            onClose={() => setOpenStatusFor(null)}
          />
        )}
      </div>

      {/* Next action + deadline */}
      <div>
        {row.nextAction ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 5, font: "500 11.5px/1.2 Inter, sans-serif", color: row.deadlineUrgent ? "var(--terracotta-deep)" : "var(--foreground)" }}>
              {row.deadlineUrgent && (
                <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--terracotta-deep)", animation: "pulse-dot 1.8s ease-in-out infinite" }} />
              )}
              {row.nextAction}
            </div>
            <div style={{ font: "400 10.5px/1.3 Inter, sans-serif", color: row.deadlineUrgent ? "var(--terracotta-deep)" : "var(--subtle-foreground)", marginTop: 3 }}>
              by {row.deadline}
              {row.stale && <span style={{ color: "var(--warn)", fontWeight: 500 }}> · stale</span>}
            </div>
          </>
        ) : (
          <span style={{ font: "400 11px/1 Inter, sans-serif", color: "var(--subtle-foreground)" }}>—</span>
        )}
      </div>

      {/* Apply */}
      <a
        href="#"
        onClick={(e) => e.stopPropagation()}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, background: "var(--paper)", border: "1px solid var(--border)", color: "var(--muted-foreground)", font: "500 11px/1 Inter, sans-serif", textDecoration: "none", letterSpacing: "-0.005em", justifySelf: "start", transition: "all 0.15s ease" }}
        onMouseEnter={(e) => { const a = e.currentTarget as HTMLAnchorElement; a.style.color = "var(--foreground)"; a.style.borderColor = "var(--border-strong)"; }}
        onMouseLeave={(e) => { const a = e.currentTarget as HTMLAnchorElement; a.style.color = "var(--muted-foreground)"; a.style.borderColor = "var(--border)"; }}
      >
        Apply
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </a>

      {/* Editor button */}
      <button
        onClick={() => onOpenEditor(row.id)}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 11px", borderRadius: 6, background: "var(--paper)", color: "var(--foreground)", border: "1px solid var(--border)", font: "500 11px/1 Inter, sans-serif", cursor: "pointer", letterSpacing: "-0.005em", whiteSpace: "nowrap", transition: "all 0.15s ease" }}
        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "var(--foreground)"; b.style.color = "#fff"; b.style.borderColor = "var(--foreground)"; }}
        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "var(--paper)"; b.style.color = "var(--foreground)"; b.style.borderColor = "var(--border)"; }}
      >
        Editor
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </button>

      {/* Resume thumbnail — rightmost, hover-to-enlarge */}
      <div
        ref={thumbRef}
        onMouseEnter={() => setThumbHover(true)}
        onMouseLeave={() => setThumbHover(false)}
        style={{ position: "relative", width: 50, height: 65, justifySelf: "end", cursor: "zoom-in" }}
      >
        <div style={{ position: "absolute", inset: 0, opacity: thumbHover ? 0.35 : 1, transition: "opacity 0.15s ease" }}>
          <MiniDoc row={row} variant="small" />
        </div>
      </div>

      {/* Fixed-position enlarged popout */}
      {thumbHover && popPos && (
        <div
          style={{
            position: "fixed", left: popPos.left, top: popPos.top,
            width: 300, height: 388, zIndex: 9999,
            animation: "thumb-pop 0.2s cubic-bezier(.2,.8,.2,1) both",
            filter: "drop-shadow(0 20px 44px rgba(40,30,20,0.22)) drop-shadow(0 4px 12px rgba(40,30,20,0.10))",
            pointerEvents: "none",
          }}
        >
          <MiniDoc row={row} variant="large" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "TrackerRow"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tracker/TrackerRow.tsx
git commit -m "feat: add TrackerRow with editable status and resume popout"
```

---

## Task 10: Tracker API and TrackerPage

**Files:**
- Create: `frontend/src/lib/trackerApi.ts`
- Create: `frontend/src/components/tracker/TrackerPage.tsx`

The Tracker API `GET /api/tracker/board` returns rows. Backend statuses (`applied`, `interviewing`, `offer`, `rejected`, `to_tailor`, `tailored`, `to_apply`) get mapped to UI statuses.

- [ ] **Step 1: Create trackerApi.ts**

Create `frontend/src/lib/trackerApi.ts`:

```ts
import type { TrackerStatus } from "@/components/tracker/MiniDoc";

export interface BoardRow {
  id: string;
  company: string;
  title: string;
  location: string | null;
  salary_range: string | null;
  status: string;
  apply_url: string | null;
  match_score: number | null;
  has_tailored_resume: boolean;
  created_at: string;
  updated_at: string;
  source?: string;
}

export interface BoardResponse {
  jobs: BoardRow[];
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchTrackerBoard(resumeId?: string): Promise<BoardResponse> {
  const url = resumeId
    ? `${BASE}/api/tracker/board?resume_id=${resumeId}`
    : `${BASE}/api/tracker/board`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tracker/board: ${res.status}`);
  return res.json();
}

export async function updateTrackerStatus(jobId: string, status: TrackerStatus): Promise<void> {
  const backendStatus = UI_TO_BACKEND[status];
  const res = await fetch(`${BASE}/api/tracker/status/${jobId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: backendStatus }),
  });
  if (!res.ok) throw new Error(`tracker/status: ${res.status}`);
}

const BACKEND_TO_UI: Record<string, TrackerStatus> = {
  to_tailor:    "saved",
  tailored:     "saved",
  to_apply:     "saved",
  applied:      "applied",
  interviewing: "interview",
  offer:        "offer",
  rejected:     "rejected",
};

const UI_TO_BACKEND: Record<TrackerStatus, string> = {
  saved:     "to_apply",
  applied:   "applied",
  interview: "interviewing",
  offer:     "offer",
  rejected:  "rejected",
};

export function backendStatusToUI(s: string): TrackerStatus {
  return (BACKEND_TO_UI[s] as TrackerStatus) ?? "saved";
}
```

- [ ] **Step 2: Create TrackerPage**

Create `frontend/src/components/tracker/TrackerPage.tsx`:

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TrackerRow } from "./TrackerRow";
import { type TrackerRowData, type TrackerStatus } from "./MiniDoc";
import { STATUSES } from "./StatusMenu";
import { fetchTrackerBoard, updateTrackerStatus, backendStatusToUI, type BoardRow } from "@/lib/trackerApi";

// Mock data for when API isn't available
const MOCK_ROWS: TrackerRowData[] = [
  { id: "r1", co: "Stripe", logoBg: "#635BFF", logoFg: "#fff", logo: "S", role: "Senior PM, Payments", loc: "San Francisco", salary: "$210–260k", match: 94, status: "interview", stage: "Onsite · Round 2", updated: "2h ago", appliedAt: "May 7", resumeVer: "v3", resumeName: "stripe-tailored.pdf", tailored: { headline: "Senior PM · Payments infrastructure", changedBullet: "Led auth-rate working group; lifted approval rates +1.4pp across NA card volume — equivalent to ~$340M GMV/yr." }, nextAction: "Prep system design", deadline: "May 21", deadlineUrgent: true, source: "Referral" },
  { id: "r2", co: "Anthropic", logoBg: "#181918", logoFg: "#D97757", logo: "A", role: "PM, Claude", loc: "San Francisco", salary: "$220–280k", match: 91, status: "applied", stage: "Awaiting reply", updated: "1d ago", appliedAt: "May 9", resumeVer: "v3", resumeName: "anthropic-tailored.pdf", tailored: { headline: "Senior PM · AI products", changedBullet: "Designed evaluation frameworks for LLM-driven features at scale; partnered with research to ship safety-vetted releases." }, nextAction: "Follow up", deadline: "May 23", deadlineUrgent: false, source: "LinkedIn" },
  { id: "r3", co: "Apple", logoBg: "#000", logoFg: "#fff", logo: "", role: "Product Designer, HI", loc: "Cupertino", salary: "$165–215k", match: 88, status: "offer", stage: "Verbal offer", updated: "3h ago", appliedAt: "Apr 22", resumeVer: "v3", resumeName: "apple-tailored.pdf", tailored: { headline: "Senior Product Designer · Motion & Systems", changedBullet: "Owned motion language for the v3 mobile app — shipped 40+ tuned curves and a documented latency budget for every interaction class." }, nextAction: "Respond to offer", deadline: "May 22", deadlineUrgent: true, source: "Direct" },
  { id: "r4", co: "Linear", logoBg: "#5E6AD2", logoFg: "#fff", logo: "L", role: "Founding Designer, Mobile", loc: "Remote", salary: "$180–230k", match: 85, status: "applied", stage: "Awaiting reply", updated: "2d ago", appliedAt: "May 6", resumeVer: "v3", resumeName: "linear-tailored.pdf", tailored: { headline: "Senior Product Designer · Mobile craft", changedBullet: "Wrote the type and spacing system used across mobile and web after a 3-month audit." }, nextAction: "Follow up", deadline: "May 20", deadlineUrgent: false, source: "Direct" },
  { id: "r5", co: "Notion", logoBg: "#fff", logoFg: "#000", logo: "N", role: "Senior PD, Editor", loc: "New York", salary: "$170–210k", match: 82, status: "rejected", stage: "No fit this round", updated: "5d ago", appliedAt: "Apr 28", resumeVer: "v3", resumeName: "notion-tailored.pdf", tailored: { headline: "Senior Product Designer · Editorial tools", changedBullet: "Designed the writing canvas used by 180k creators; selected as App Store editor's pick three quarters running." }, nextAction: null, deadline: null, deadlineUrgent: false, source: "LinkedIn" },
];

function boardRowToTrackerRow(r: BoardRow): TrackerRowData {
  return {
    id: String(r.id),
    co: r.company,
    logoBg: "var(--surface-1)", logoFg: "var(--foreground)", logo: r.company.charAt(0),
    role: r.title,
    loc: r.location ?? "—",
    salary: r.salary_range ?? "—",
    match: r.match_score ?? 0,
    status: backendStatusToUI(r.status),
    stage: r.status.replace(/_/g, " "),
    updated: new Date(r.updated_at).toLocaleDateString(),
    appliedAt: r.created_at ? new Date(r.created_at).toLocaleDateString() : "—",
    resumeVer: "v1",
    resumeName: `${r.company.toLowerCase()}-tailored.pdf`,
    tailored: { headline: r.title, changedBullet: "Tailored for this role." },
    nextAction: null, deadline: null, deadlineUrgent: false,
    source: r.source ?? "Direct",
  };
}

type FilterType = "all" | TrackerStatus;

export function TrackerPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TrackerRowData[]>(MOCK_ROWS);
  const [filter, setFilter] = useState<FilterType>("all");
  const [openStatusFor, setOpenStatusFor] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, TrackerStatus>>({});

  useEffect(() => {
    fetchTrackerBoard()
      .then((data) => {
        if (data.jobs?.length) setRows(data.jobs.map(boardRowToTrackerRow));
      })
      .catch(() => {/* keep mock data */});
  }, []);

  const liveRows = rows.map((r) => statusMap[r.id] ? { ...r, status: statusMap[r.id] } : r);
  const filtered = filter === "all" ? liveRows : liveRows.filter((r) => r.status === filter);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: liveRows.length };
    Object.keys(STATUSES).forEach((k) => { c[k] = liveRows.filter((r) => r.status === k).length; });
    return c;
  }, [liveRows]);

  const activeCount = (counts.applied ?? 0) + (counts.interview ?? 0);
  const offerCount = counts.offer ?? 0;
  const savedCount = counts.saved ?? 0;
  const respondedRate = Math.round(
    ((counts.applied ?? 0) + (counts.interview ?? 0) + offerCount) /
    Math.max(1, liveRows.length - savedCount) * 100
  );
  const topMatch = liveRows.find((r) => r.status === "interview" || r.status === "offer");

  function handleUpdateStatus(id: string, status: TrackerStatus) {
    setStatusMap((m) => ({ ...m, [id]: status }));
    updateTrackerStatus(id, status).catch(console.error);
  }

  function handleOpenEditor(id: string) {
    router.push(`/resume/${id}`);
  }

  return (
    <div
      style={{
        height: "100%", display: "flex", flexDirection: "column",
        background: "var(--background)", fontFamily: "Inter, system-ui, sans-serif",
        color: "var(--foreground)", overflow: "hidden",
      }}
    >
      {/* TOP BAR */}
      <div
        style={{
          height: 56, flexShrink: 0, padding: "0 24px",
          display: "flex", alignItems: "center", gap: 14,
          background: "rgba(252,250,247,0.80)", borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, var(--terracotta), var(--terracotta-deep))", display: "grid", placeItems: "center" }}>
          <span style={{ font: "700 13px/1 Inter, sans-serif", color: "#fff" }}>C</span>
        </div>
        <span style={{ font: "500 14px/1 Inter, sans-serif", letterSpacing: "-0.01em" }}>
          CareerOps{" "}
          <em style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontStyle: "italic", fontWeight: 400, fontSize: 14, color: "var(--terracotta-deep)" }}>Pro</em>
        </span>
        <span style={{ width: 1, height: 18, background: "var(--border)", marginLeft: 6 }} />
        <span style={{ font: "500 12.5px/1 Inter, sans-serif", color: "var(--muted-foreground)" }}>
          <span style={{ color: "var(--foreground)" }}>Tracker</span>
        </span>
        <span style={{ flex: 1 }} />
        <button style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 7, background: "var(--paper)", border: "1px solid var(--border)", font: "500 11.5px/1 Inter, sans-serif", color: "var(--foreground)", cursor: "pointer" }}>
          + Add application
        </button>
      </div>

      {/* HEADER + STATS */}
      <div style={{ maxWidth: 1180, width: "100%", margin: "0 auto", padding: "28px 28px 18px" }}>
        <h1 style={{ font: '400 36px/1.1 "Instrument Serif", Georgia, serif', letterSpacing: "-0.02em", margin: 0, color: "var(--foreground)" }}>
          Tracker
        </h1>
        <p style={{ font: "400 13px/1.5 Inter, sans-serif", color: "var(--muted-foreground)", margin: "8px 0 22px", maxWidth: 520 }}>
          Every job you&apos;ve saved, every application sent, every tailored version of your resume.
        </p>

        {/* Stat strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "1px solid var(--border)", borderRadius: 10, background: "var(--paper)", overflow: "hidden" }}>
          {[
            { label: "In play",   value: activeCount + offerCount,  tone: "var(--foreground)",      note: `${activeCount} active · ${offerCount} offer${offerCount === 1 ? "" : "s"}` },
            { label: "Response",  value: `${respondedRate}%`,        tone: "var(--foreground)",      note: "across applied roles" },
            { label: "Drafted",   value: savedCount,                 tone: "var(--foreground)",      note: "ready to send" },
            { label: "Top match", value: topMatch?.co ?? "—",        tone: "var(--terracotta-deep)", note: topMatch ? `${topMatch.stage}` : "No active matches" },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: "14px 18px", borderLeft: i === 0 ? "none" : "1px solid var(--border)" }}>
              <div style={{ font: '500 9.5px/1 "JetBrains Mono", monospace', letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--subtle-foreground)", marginBottom: 8 }}>
                {s.label}
              </div>
              <div style={{ font: `500 22px/1 ${typeof s.value === "number" || /^\d+%$/.test(String(s.value)) ? '"JetBrains Mono", monospace' : "Inter, sans-serif"}`, color: s.tone, letterSpacing: "-0.02em" }}>
                {s.value}
              </div>
              <div style={{ font: "400 11px/1.3 Inter, sans-serif", color: "var(--subtle-foreground)", marginTop: 5 }}>
                {s.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ maxWidth: 1180, width: "100%", margin: "0 auto", padding: "0 28px", display: "flex", alignItems: "center", gap: 6 }}>
        {([
          { id: "all",       label: "All" },
          { id: "saved",     label: "Saved" },
          { id: "applied",   label: "Applied" },
          { id: "interview", label: "Interview" },
          { id: "offer",     label: "Offer" },
          { id: "rejected",  label: "Rejected" },
        ] as { id: FilterType; label: string }[]).map((f) => {
          const on = filter === f.id;
          const tone = f.id === "all" ? "var(--foreground)" : (STATUSES[f.id as TrackerStatus]?.tone ?? "var(--foreground)");
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 7, background: on ? "var(--surface-2)" : "transparent", border: 0, font: `${on ? 500 : 400} 12px/1 Inter, sans-serif`, color: on ? "var(--foreground)" : "var(--muted-foreground)", cursor: "pointer", letterSpacing: "-0.005em" }}>
              {f.id !== "all" && <span style={{ width: 5, height: 5, borderRadius: 999, background: tone }} />}
              {f.label}
              <span style={{ font: '400 10.5px/1 "JetBrains Mono", monospace', color: "var(--subtle-foreground)", marginLeft: 1 }}>
                {counts[f.id] ?? 0}
              </span>
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <span style={{ font: "400 11px/1 Inter, sans-serif", color: "var(--muted-foreground)", marginRight: 6 }}>Sort:</span>
        <select style={{ font: "500 11.5px/1 Inter, sans-serif", color: "var(--foreground)", padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--paper)" }}>
          <option>Most recent</option>
          <option>Match score</option>
          <option>Status</option>
        </select>
      </div>

      {/* TABLE */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 28px 40px" }}>
        <div style={{ maxWidth: 1180, width: "100%", margin: "0 auto", background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 12, overflow: "visible", boxShadow: "0 1px 2px oklch(0.40 0.04 42 / 0.04), 0 8px 32px oklch(0.40 0.04 42 / 0.04)" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "34px 1.4fr 0.95fr 1.0fr 70px 78px 64px", alignItems: "center", columnGap: 14, padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-1)" }}>
            <span />
            {["Role", "Status", "Next action", "Apply", "", "Resume"].map((h, i) => (
              <span key={i} style={{ font: '500 9.5px/1 "JetBrains Mono", monospace', letterSpacing: "0.16em", color: "var(--subtle-foreground)", textTransform: "uppercase", textAlign: i === 5 ? "right" : "left" }}>
                {h}
              </span>
            ))}
          </div>

          {filtered.map((r, i) => (
            <TrackerRow
              key={r.id} row={r} isLast={i === filtered.length - 1}
              openStatusFor={openStatusFor} setOpenStatusFor={setOpenStatusFor}
              updateStatus={handleUpdateStatus} onOpenEditor={handleOpenEditor}
            />
          ))}

          {filtered.length === 0 && (
            <div style={{ padding: "48px 22px", textAlign: "center", color: "var(--muted-foreground)", font: "400 13px/1.5 Inter, sans-serif" }}>
              Nothing here yet — save jobs from the Job Stack to start tracking.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "TrackerPage|trackerApi" | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/trackerApi.ts frontend/src/components/tracker/TrackerPage.tsx
git commit -m "feat: add TrackerPage with API integration and filter tabs"
```

---

## Task 11: Tracker route

**Files:**
- Create: `frontend/src/app/tracker/page.tsx`

- [ ] **Step 1: Create tracker route**

```bash
mkdir -p frontend/src/app/tracker
```

Create `frontend/src/app/tracker/page.tsx`:

```tsx
import { TrackerPage } from "@/components/tracker/TrackerPage";

export default function TrackerRoute() {
  return (
    <div className="h-screen overflow-hidden">
      <TrackerPage />
    </div>
  );
}
```

- [ ] **Step 2: Full TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 4: Start dev server and verify pages load**

```bash
cd frontend && npm run dev &
sleep 5
curl -s http://localhost:3000/jobs | grep -c "html"
curl -s http://localhost:3000/tracker | grep -c "html"
```

Expected: both return `1` (HTML response).

- [ ] **Step 5: Final commit**

```bash
git add frontend/src/app/tracker/page.tsx
git commit -m "feat: add /tracker route — complete job-stack-tracker workflow"
```

---

## Post-implementation verification

- [ ] Navigate `/` → upload a PDF → should redirect to `/jobs?from_upload=1&resume=…`
- [ ] Job Stack page shows step 2 active in stepper
- [ ] Each row shows company logo, role info, match ring, and resume thumbnail
- [ ] Hover over resume thumbnail lifts it slightly
- [ ] "Save N to Tracker" button pulses with shimmer
- [ ] Click "Save N to Tracker" → navigates to `/tracker`
- [ ] Tracker shows stat strip, filter tabs, table rows
- [ ] Click Status chip on any row → dropdown opens with 5 options
- [ ] Click outside status dropdown → closes
- [ ] Hover over Resume thumbnail in Tracker → enlarged doc pops out to the left
- [ ] "Editor →" button → navigates to `/resume/{id}`
- [ ] `/upload` page upload → redirects to `/jobs`
