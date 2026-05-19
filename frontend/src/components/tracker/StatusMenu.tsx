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
