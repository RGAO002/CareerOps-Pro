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
