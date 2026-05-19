"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TrackerRow } from "./TrackerRow";
import { type TrackerRowData, type TrackerStatus } from "./MiniDoc";
import { STATUSES } from "./StatusMenu";
import { fetchTrackerBoard, updateTrackerStatus, backendStatusToUI, type BoardRow } from "@/lib/trackerApi";

const MOCK_ROWS: TrackerRowData[] = [
  { id: "r1", co: "Stripe", logoBg: "#635BFF", logoFg: "#fff", logo: "S", role: "Senior PM, Payments", loc: "San Francisco", salary: "$210–260k", match: 94, status: "interview", stage: "Onsite · Round 2", updated: "2h ago", appliedAt: "May 7", resumeVer: "v3", resumeName: "stripe-tailored.pdf", tailored: { headline: "Senior PM · Payments infrastructure", changedBullet: "Led auth-rate working group; lifted approval rates +1.4pp across NA card volume — equivalent to ~$340M GMV/yr." }, nextAction: "Prep system design", deadline: "May 21", deadlineUrgent: true, source: "Referral" },
  { id: "r2", co: "Anthropic", logoBg: "#181918", logoFg: "#D97757", logo: "A", role: "PM, Claude", loc: "San Francisco", salary: "$220–280k", match: 91, status: "applied", stage: "Awaiting reply", updated: "1d ago", appliedAt: "May 9", resumeVer: "v3", resumeName: "anthropic-tailored.pdf", tailored: { headline: "Senior PM · AI products", changedBullet: "Designed evaluation frameworks for LLM-driven features at scale; partnered with research to ship safety-vetted releases." }, nextAction: "Follow up", deadline: "May 23", deadlineUrgent: false, source: "LinkedIn" },
  { id: "r3", co: "Apple", logoBg: "#000", logoFg: "#fff", logo: "", role: "Product Designer, HI", loc: "Cupertino", salary: "$165–215k", match: 88, status: "offer", stage: "Verbal offer", updated: "3h ago", appliedAt: "Apr 22", resumeVer: "v3", resumeName: "apple-tailored.pdf", tailored: { headline: "Senior Product Designer · Motion & Systems", changedBullet: "Owned motion language for the v3 mobile app — shipped 40+ tuned curves and a documented latency budget for every interaction class." }, nextAction: "Respond to offer", deadline: "May 22", deadlineUrgent: true, source: "Direct" },
  { id: "r4", co: "Linear", logoBg: "#5E6AD2", logoFg: "#fff", logo: "L", role: "Founding Designer, Mobile", loc: "Remote", salary: "$180–230k", match: 85, status: "applied", stage: "Awaiting reply", updated: "2d ago", appliedAt: "May 6", resumeVer: "v3", resumeName: "linear-tailored.pdf", tailored: { headline: "Senior Product Designer · Mobile craft", changedBullet: "Wrote the type and spacing system used across mobile and web after a 3-month audit." }, nextAction: "Follow up", deadline: "May 20", deadlineUrgent: false, source: "Direct" },
  { id: "r5", co: "Notion", logoBg: "#fff", logoFg: "#000", logo: "N", role: "Senior PD, Editor", loc: "New York", salary: "$170–210k", match: 82, status: "rejected", stage: "No fit this round", updated: "5d ago", appliedAt: "Apr 28", resumeVer: "v3", resumeName: "notion-tailored.pdf", tailored: { headline: "Senior Product Designer · Editorial tools", changedBullet: "Designed the writing canvas used by 180k creators; selected as App Store editor's pick three quarters running." }, nextAction: null, deadline: null, deadlineUrgent: false, source: "LinkedIn" },
];

function boardRowToTrackerRow(r: BoardRow): TrackerRowData {
  return {
    id: String(r.id),
    co: r.company,
    logoBg: "var(--surface-1)", logoFg: "var(--foreground)", logo: r.company.charAt(0),
    role: r.title,
    loc: r.location ?? "—",
    salary: r.salary_range ?? "—",
    match: r.match_score ?? 0,
    status: backendStatusToUI(r.status),
    stage: r.status.replace(/_/g, " "),
    updated: new Date(r.updated_at).toLocaleDateString(),
    appliedAt: r.created_at ? new Date(r.created_at).toLocaleDateString() : "—",
    resumeVer: "v1",
    resumeName: `${r.company.toLowerCase()}-tailored.pdf`,
    tailored: { headline: r.title, changedBullet: "Tailored for this role." },
    nextAction: null, deadline: null, deadlineUrgent: false,
    source: r.source ?? "Direct",
  };
}

type FilterType = "all" | TrackerStatus;

export function TrackerPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TrackerRowData[]>(MOCK_ROWS);
  const [filter, setFilter] = useState<FilterType>("all");
  const [openStatusFor, setOpenStatusFor] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, TrackerStatus>>({});

  useEffect(() => {
    fetchTrackerBoard()
      .then((data) => {
        if (data.jobs?.length) setRows(data.jobs.map(boardRowToTrackerRow));
      })
      .catch(() => {/* keep mock data */});
  }, []);

  const liveRows = rows.map((r) => statusMap[r.id] ? { ...r, status: statusMap[r.id] } : r);
  const filtered = filter === "all" ? liveRows : liveRows.filter((r) => r.status === filter);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: liveRows.length };
    Object.keys(STATUSES).forEach((k) => { c[k] = liveRows.filter((r) => r.status === k).length; });
    return c;
  }, [liveRows]);

  const activeCount = (counts.applied ?? 0) + (counts.interview ?? 0);
  const offerCount = counts.offer ?? 0;
  const savedCount = counts.saved ?? 0;
  const respondedRate = Math.round(
    ((counts.applied ?? 0) + (counts.interview ?? 0) + offerCount) /
    Math.max(1, liveRows.length - savedCount) * 100
  );
  const topMatch = liveRows.find((r) => r.status === "interview" || r.status === "offer");

  function handleUpdateStatus(id: string, status: TrackerStatus) {
    setStatusMap((m) => ({ ...m, [id]: status }));
    updateTrackerStatus(id, status).catch(console.error);
  }

  function handleOpenEditor(id: string) {
    router.push(`/resume/${id}`);
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
          background: "rgba(252,250,247,0.80)", borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, var(--terracotta), var(--terracotta-deep))", display: "grid", placeItems: "center" }}>
          <span style={{ font: "700 13px/1 Inter, sans-serif", color: "#fff" }}>C</span>
        </div>
        <span style={{ font: "500 14px/1 Inter, sans-serif", letterSpacing: "-0.01em" }}>
          CareerOps{" "}
          <em style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontStyle: "italic", fontWeight: 400, fontSize: 14, color: "var(--terracotta-deep)" }}>Pro</em>
        </span>
        <span style={{ width: 1, height: 18, background: "var(--border)", marginLeft: 6 }} />
        <span style={{ font: "500 12.5px/1 Inter, sans-serif", color: "var(--muted-foreground)" }}>
          <span style={{ color: "var(--foreground)" }}>Tracker</span>
        </span>
        <span style={{ flex: 1 }} />
        <button style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 7, background: "var(--paper)", border: "1px solid var(--border)", font: "500 11.5px/1 Inter, sans-serif", color: "var(--foreground)", cursor: "pointer" }}>
          + Add application
        </button>
      </div>

      {/* HEADER + STATS */}
      <div style={{ maxWidth: 1180, width: "100%", margin: "0 auto", padding: "28px 28px 18px" }}>
        <h1 style={{ font: '400 36px/1.1 "Instrument Serif", Georgia, serif', letterSpacing: "-0.02em", margin: 0, color: "var(--foreground)" }}>
          Tracker
        </h1>
        <p style={{ font: "400 13px/1.5 Inter, sans-serif", color: "var(--muted-foreground)", margin: "8px 0 22px", maxWidth: 520 }}>
          Every job you&apos;ve saved, every application sent, every tailored version of your resume.
        </p>

        {/* Stat strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "1px solid var(--border)", borderRadius: 10, background: "var(--paper)", overflow: "hidden" }}>
          {[
            { label: "In play",   value: activeCount + offerCount,  tone: "var(--foreground)",      note: `${activeCount} active · ${offerCount} offer${offerCount === 1 ? "" : "s"}` },
            { label: "Response",  value: `${respondedRate}%`,        tone: "var(--foreground)",      note: "across applied roles" },
            { label: "Drafted",   value: savedCount,                 tone: "var(--foreground)",      note: "ready to send" },
            { label: "Top match", value: topMatch?.co ?? "—",        tone: "var(--terracotta-deep)", note: topMatch ? `${topMatch.stage}` : "No active matches" },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: "14px 18px", borderLeft: i === 0 ? "none" : "1px solid var(--border)" }}>
              <div style={{ font: '500 9.5px/1 "JetBrains Mono", monospace', letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--subtle-foreground)", marginBottom: 8 }}>
                {s.label}
              </div>
              <div style={{ font: `500 22px/1 ${typeof s.value === "number" || /^\d+%$/.test(String(s.value)) ? '"JetBrains Mono", monospace' : "Inter, sans-serif"}`, color: s.tone, letterSpacing: "-0.02em" }}>
                {s.value}
              </div>
              <div style={{ font: "400 11px/1.3 Inter, sans-serif", color: "var(--subtle-foreground)", marginTop: 5 }}>
                {s.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ maxWidth: 1180, width: "100%", margin: "0 auto", padding: "0 28px", display: "flex", alignItems: "center", gap: 6 }}>
        {([
          { id: "all",       label: "All" },
          { id: "saved",     label: "Saved" },
          { id: "applied",   label: "Applied" },
          { id: "interview", label: "Interview" },
          { id: "offer",     label: "Offer" },
          { id: "rejected",  label: "Rejected" },
        ] as { id: FilterType; label: string }[]).map((f) => {
          const on = filter === f.id;
          const tone = f.id === "all" ? "var(--foreground)" : (STATUSES[f.id as TrackerStatus]?.tone ?? "var(--foreground)");
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 7, background: on ? "var(--surface-2)" : "transparent", border: 0, font: `${on ? 500 : 400} 12px/1 Inter, sans-serif`, color: on ? "var(--foreground)" : "var(--muted-foreground)", cursor: "pointer", letterSpacing: "-0.005em" }}>
              {f.id !== "all" && <span style={{ width: 5, height: 5, borderRadius: 999, background: tone }} />}
              {f.label}
              <span style={{ font: '400 10.5px/1 "JetBrains Mono", monospace', color: "var(--subtle-foreground)", marginLeft: 1 }}>
                {counts[f.id] ?? 0}
              </span>
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <span style={{ font: "400 11px/1 Inter, sans-serif", color: "var(--muted-foreground)", marginRight: 6 }}>Sort:</span>
        <select style={{ font: "500 11.5px/1 Inter, sans-serif", color: "var(--foreground)", padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--paper)" }}>
          <option>Most recent</option>
          <option>Match score</option>
          <option>Status</option>
        </select>
      </div>

      {/* TABLE */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 28px 40px" }}>
        <div style={{ maxWidth: 1180, width: "100%", margin: "0 auto", background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 12, overflow: "visible", boxShadow: "0 1px 2px oklch(0.40 0.04 42 / 0.04), 0 8px 32px oklch(0.40 0.04 42 / 0.04)" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "34px 1.4fr 0.95fr 1.0fr 70px 78px 64px", alignItems: "center", columnGap: 14, padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-1)" }}>
            <span />
            {["Role", "Status", "Next action", "Apply", "", "Resume"].map((h, i) => (
              <span key={i} style={{ font: '500 9.5px/1 "JetBrains Mono", monospace', letterSpacing: "0.16em", color: "var(--subtle-foreground)", textTransform: "uppercase", textAlign: i === 5 ? "right" : "left" }}>
                {h}
              </span>
            ))}
          </div>

          {filtered.map((r, i) => (
            <TrackerRow
              key={r.id} row={r} isLast={i === filtered.length - 1}
              openStatusFor={openStatusFor} setOpenStatusFor={setOpenStatusFor}
              updateStatus={handleUpdateStatus} onOpenEditor={handleOpenEditor}
            />
          ))}

          {filtered.length === 0 && (
            <div style={{ padding: "48px 22px", textAlign: "center", color: "var(--muted-foreground)", font: "400 13px/1.5 Inter, sans-serif" }}>
              Nothing here yet — save jobs from the Job Stack to start tracking.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
