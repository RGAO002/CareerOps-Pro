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
