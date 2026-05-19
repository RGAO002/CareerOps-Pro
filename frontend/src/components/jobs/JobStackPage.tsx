"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useJobMatchStore, type Job } from "@/stores/jobMatch";
import { JobRow, type StackJob } from "./JobRow";
import type { TailoredData } from "./ResumeThumb";

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
  Apple:     { bg: "#000",     fg: "#fff"    },
  Stripe:    { bg: "#635BFF", fg: "#fff"    },
  Anthropic: { bg: "#181918", fg: "#D97757" },
  Linear:    { bg: "#5E6AD2", fg: "#fff"    },
  Notion:    { bg: "#fff",    fg: "#000"    },
  Vercel:    { bg: "#000",    fg: "#fff"    },
  Figma:     { bg: "#0ACF83", fg: "#fff"    },
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
              { n: 1, label: "Upload",        state: "done"     },
              { n: 2, label: "Choose role",   state: "current"  },
              { n: 3, label: "Refine & send", state: "upcoming" },
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
