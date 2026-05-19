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
