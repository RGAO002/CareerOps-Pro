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
