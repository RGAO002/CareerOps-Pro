"use client";

import { useJobMatchStore, type FilterType, type SortType } from "@/stores/jobMatch";

export function MatchFilterBar() {
  const matches   = useJobMatchStore((s) => s.matches);
  const filter    = useJobMatchStore((s) => s.filter);
  const sort      = useJobMatchStore((s) => s.sort);
  const setFilter = useJobMatchStore((s) => s.setFilter);
  const setSort   = useJobMatchStore((s) => s.setSort);

  const counts = {
    all:    matches.length,
    spons:  matches.filter((j) => j.sponsorshipSignal === "friendly" || j.sponsorshipSignal === "company_history").length,
    remote: matches.filter((j) => j.workType === "remote").length,
    strong: matches.filter((j) => j.tier === "A").length,
    recent: matches.length, // posted_at not available in Job interface yet
  };

  const FILTERS: { id: FilterType; label: string; accent?: boolean }[] = [
    { id: "all",    label: "All" },
    { id: "spons",  label: "Sponsors H-1B", accent: true },
    { id: "remote", label: "Remote OK" },
    { id: "strong", label: "Strong fit" },
    { id: "recent", label: "Posted 7d" },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {FILTERS.map((f) => {
        const active = filter === f.id;
        const count = counts[f.id];
        return (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "7px 12px", borderRadius: 999,
              background: active ? (f.accent ? "oklch(0.62 0.13 38 / 0.15)" : "oklch(0.20 0.020 45)") : "#fff",
              color:      active ? (f.accent ? "oklch(0.50 0.14 35)"         : "#fff")                 : "oklch(0.20 0.020 45)",
              border: `1px solid ${active ? (f.accent ? "oklch(0.62 0.13 38 / 0.40)" : "oklch(0.20 0.020 45)") : "oklch(0.90 0.008 50)"}`,
              fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {f.id === "spons" && <span>★</span>}
            {f.label}
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, opacity: active ? 0.7 : 0.5 }}>
              {count}
            </span>
          </button>
        );
      })}
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "oklch(0.48 0.012 50)" }}>Sort:</span>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SortType)}
        style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 500, color: "oklch(0.20 0.020 45)", padding: "5px 8px", borderRadius: 6, border: "1px solid oklch(0.90 0.008 50)", background: "#fff" }}
      >
        <option value="match">Match score</option>
        <option value="recent">Most recent</option>
        <option value="salary">Salary</option>
      </select>
    </div>
  );
}
