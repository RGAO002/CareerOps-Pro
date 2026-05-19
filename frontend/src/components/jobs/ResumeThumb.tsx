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
