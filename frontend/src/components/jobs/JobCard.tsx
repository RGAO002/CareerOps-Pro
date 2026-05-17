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
        {job.gap && (
          <li style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, lineHeight: 1.45, color: "oklch(0.48 0.012 50)", position: "relative", paddingLeft: 14 }}>
            <span style={{ position: "absolute", left: 0, top: 7, width: 6, height: 1, background: "oklch(0.50 0.14 35)", opacity: 0.5 }} />
            <span style={{ color: "oklch(0.50 0.14 35)", fontWeight: 500 }}>Gap:</span> {job.gap}
          </li>
        )}
      </ul>

      {/* Footer: tags + tailor button */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid oklch(0.94 0.012 48)" }}>
        {job.tags.map((tag) => (
          <span key={tag} style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 500, padding: "4px 8px", borderRadius: 4, letterSpacing: "0.02em", background: tag.includes("H-1B") ? "oklch(0.62 0.13 38 / 0.08)" : "oklch(0.96 0.010 50)", border: `1px solid ${tag.includes("H-1B") ? "oklch(0.62 0.13 38 / 0.30)" : "oklch(0.90 0.008 50)"}`, color: tag.includes("H-1B") ? "oklch(0.50 0.14 35)" : "oklch(0.48 0.012 50)" }}>
            {tag}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => job.applyUrl && window.open(job.applyUrl, "_blank", "noopener")}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 6, background: hover ? "oklch(0.20 0.020 45)" : "transparent", color: hover ? "#fff" : "oklch(0.20 0.020 45)", border: hover ? "none" : "1px solid oklch(0.90 0.008 50)", fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.2s" }}
        >
          <Sparkle size={10} color={hover ? "#fff" : "oklch(0.62 0.13 38)"} />
          Tailor & open
          <span style={{ opacity: 0.5 }}>→</span>
        </button>
      </div>
    </div>
  );
}
