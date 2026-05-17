"use client";

import { useEffect } from "react";
import { useJobMatchStore } from "@/stores/jobMatch";
import { EmbeddingConstellation } from "./EmbeddingConstellation";
import { MatchFilterBar } from "./MatchFilterBar";
import { JobCard } from "./JobCard";

interface Props { animateIn?: boolean; resumeId?: string | null; }

export function JobListPage({ animateIn = false, resumeId }: Props) {
  const fetch   = useJobMatchStore((s) => s.fetch);
  const matches = useJobMatchStore((s) => s.matches);
  const loading = useJobMatchStore((s) => s.loading);
  const filter  = useJobMatchStore((s) => s.filter);
  const sort    = useJobMatchStore((s) => s.sort);

  useEffect(() => {
    if (resumeId) fetch(resumeId);
  }, [resumeId, fetch]);
  const strongCount  = matches.filter((j) => j.tier === "A").length;
  const goodCount    = matches.filter((j) => j.tier === "B").length;
  const stretchCount = matches.filter((j) => j.tier === "C").length;

  const visible = matches
    .filter((j) => {
      if (filter === "spons")  return j.sponsorshipSignal === "friendly" || j.sponsorshipSignal === "company_history";
      if (filter === "remote") return j.workType === "remote";
      if (filter === "strong") return j.tier === "A";
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (sort === "match") return b.matchScore - a.matchScore;
      return 0;
    });

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
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "oklch(0.48 0.012 50)", fontFamily: "Inter, sans-serif", fontSize: 14 }}>
            Fetching your matches…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "oklch(0.48 0.012 50)", fontFamily: "Inter, sans-serif", fontSize: 14 }}>
            No matches yet — try broadening your search.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {visible.map((job, i) => (
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
        3 agents matched {visible.length} roles
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, opacity: 0.55, padding: "3px 6px", borderRadius: 4, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>⌘K</span>
      </div>
    </div>
  );
}
