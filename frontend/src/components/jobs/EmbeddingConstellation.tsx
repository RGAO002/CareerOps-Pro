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
