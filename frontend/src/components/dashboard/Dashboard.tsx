"use client";

import { motion } from "framer-motion";
import { ArrowRight, Zap, Target, TrendingUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/* ── Mock data — will be replaced with real API data ── */
const MOCK = {
  summary: "Your resume is well-structured and highlights relevant experience. A few targeted changes could significantly strengthen it for PM and SWE roles.",
  score: 87,
  agents: [
    {
      id: "recruiter",
      name: "Recruiter",
      color: "oklch(0.62 0.14 32)",
      colorMuted: "oklch(0.62 0.14 32 / 0.08)",
      finding: "3 key skills from recent JDs are missing from your skills section",
      detail: "Python, AWS, and CI/CD appear in 80% of matching job descriptions but aren't listed.",
    },
    {
      id: "hm",
      name: "Hiring Manager",
      color: "oklch(0.55 0.14 150)",
      colorMuted: "oklch(0.55 0.14 150 / 0.08)",
      finding: "Two experience bullets lack quantified impact",
      detail: "Snapbrillia bullet #3 and Freelance bullet #1 would be stronger with metrics.",
    },
    {
      id: "coach",
      name: "Career Coach",
      color: "oklch(0.55 0.12 260)",
      colorMuted: "oklch(0.55 0.12 260 / 0.08)",
      finding: "Your career narrative needs a connecting thread",
      detail: "The transition from Snapbrillia to freelance to Evlin could tell a stronger story.",
    },
  ],
  actions: [
    {
      id: 1,
      text: 'Add Python, AWS, and CI/CD to your skills section',
      agent: "Recruiter",
      impact: "high",
    },
    {
      id: 2,
      text: "Rewrite Snapbrillia bullet #3 with quantified results",
      agent: "Hiring Manager",
      impact: "high",
    },
    {
      id: 3,
      text: "Add a connecting narrative to your summary",
      agent: "Career Coach",
      impact: "medium",
    },
  ],
  jobs: [
    { title: "Senior PM", company: "Google", match: 94, tag: "Strong fit" },
    { title: "SWE II", company: "Meta", match: 89, tag: "Good fit" },
    { title: "Staff Eng", company: "Stripe", match: 87, tag: "Good fit" },
  ],
};

const ease = [0.16, 1, 0.3, 1] as const;
const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.7, ease, delay } },
});

export function Dashboard() {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="space-y-10 pb-16">
      {/* ── ① Status overview — one sentence, not a score card ── */}
      <motion.section {...fadeUp(0)} className="space-y-3">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <h2
              className="font-[family-name:var(--font-display)] text-[1.6rem] leading-[1.25] tracking-tight"
              style={{ color: "var(--foreground)" }}
            >
              Looking good.
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground max-w-lg">
              {MOCK.summary}
            </p>
          </div>
          {/* Small score — visible but not the hero */}
          <div
            className="flex flex-col items-center shrink-0 rounded-2xl px-5 py-3"
            style={{ background: "var(--surface-1)" }}
          >
            <span
              className="text-[28px] font-bold leading-none tracking-tight"
              style={{ color: "var(--foreground)" }}
            >
              {MOCK.score}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground mt-1">/100</span>
          </div>
        </div>
      </motion.section>

      {/* ── ② Agent findings — the multi-agent differentiator ── */}
      <motion.section {...fadeUp(0.1)} className="space-y-3">
        <h3 className="text-[12px] font-semibold tracking-widest uppercase text-muted-foreground">
          Your AI team found
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {MOCK.agents.map((agent, i) => {
            const isExpanded = expandedAgent === agent.id;
            return (
              <motion.button
                key={agent.id}
                onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                className={cn(
                  "group relative text-left rounded-xl p-4 transition-all duration-300",
                  "hover:shadow-[0_2px_16px_oklch(0.50_0.04_40/0.08)]",
                )}
                style={{
                  background: isExpanded ? agent.colorMuted : "var(--card)",
                  border: `1px solid ${isExpanded ? agent.color + "33" : "var(--border)"}`,
                }}
                {...fadeUp(0.15 + i * 0.08)}
              >
                {/* Agent indicator */}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: agent.color }}
                  />
                  <span className="text-[11px] font-semibold tracking-wide" style={{ color: agent.color }}>
                    {agent.name}
                  </span>
                </div>

                {/* Finding */}
                <p className="text-[13px] leading-relaxed text-foreground/80">
                  {agent.finding}
                </p>

                {/* Expanded detail */}
                <div
                  className={cn(
                    "grid transition-all duration-300",
                    isExpanded ? "grid-rows-[1fr] mt-3 opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                      {agent.detail}
                    </p>
                  </div>
                </div>

                {/* Expand hint */}
                <ChevronDown
                  className={cn(
                    "absolute top-4 right-4 size-3.5 text-muted-foreground/40 transition-transform duration-300",
                    isExpanded && "rotate-180",
                  )}
                  strokeWidth={1.5}
                />
              </motion.button>
            );
          })}
        </div>

        {/* Consensus badge */}
        <div className="flex items-center gap-2 pl-1">
          <div className="flex -space-x-0.5">
            {MOCK.agents.map((a) => (
              <div
                key={a.id}
                className="size-1.5 rounded-full"
                style={{ backgroundColor: a.color }}
              />
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            All three agents agree on priority areas
          </span>
        </div>
      </motion.section>

      {/* ── ③ Recommended next steps ── */}
      <motion.section {...fadeUp(0.2)} className="space-y-3">
        <h3 className="text-[12px] font-semibold tracking-widest uppercase text-muted-foreground">
          Recommended next steps
        </h3>
        <div className="space-y-2">
          {MOCK.actions.map((action, i) => (
            <motion.div
              key={action.id}
              {...fadeUp(0.25 + i * 0.06)}
              className="group flex items-center gap-4 rounded-xl px-4 py-3.5 transition-all duration-200 hover:shadow-[0_2px_12px_oklch(0.50_0.04_40/0.06)]"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
              }}
            >
              {/* Step number */}
              <div
                className="flex size-7 items-center justify-center rounded-lg shrink-0 text-[11px] font-bold"
                style={{
                  background: action.impact === "high" ? "var(--primary)" : "var(--surface-2)",
                  color: action.impact === "high" ? "var(--primary-foreground)" : "var(--muted-foreground)",
                }}
              >
                {action.id}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-foreground/80 leading-snug">
                  {action.text}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Suggested by {action.agent}
                </p>
              </div>

              {/* Action */}
              <button
                className="flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-200
                  opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                <Zap className="size-3" strokeWidth={2} />
                Apply
              </button>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── ④ Matching roles ── */}
      <motion.section {...fadeUp(0.3)} className="space-y-3">
        <h3 className="text-[12px] font-semibold tracking-widest uppercase text-muted-foreground">
          Strong matches for you
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {MOCK.jobs.map((job, i) => (
            <motion.button
              key={job.company}
              {...fadeUp(0.35 + i * 0.06)}
              className="group text-left rounded-xl p-4 transition-all duration-200 hover:shadow-[0_2px_16px_oklch(0.50_0.04_40/0.08)]"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[14px] font-semibold text-foreground">{job.title}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{job.company}</p>
                </div>
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                  style={{
                    background: job.match >= 90 ? "var(--positive-muted)" : "var(--accent)",
                    color: job.match >= 90 ? "var(--positive)" : "var(--accent-foreground)",
                  }}
                >
                  {job.match}%
                </span>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Target className="size-3" strokeWidth={1.5} />
                {job.tag}
              </div>

              {/* Hover arrow */}
              <div
                className="mt-3 flex items-center gap-1 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--primary)" }}
              >
                Tailor resume <ArrowRight className="size-3" strokeWidth={2} />
              </div>
            </motion.button>
          ))}
        </div>
      </motion.section>

      {/* ── ⑤ Detailed analysis (collapsed) ── */}
      <motion.section {...fadeUp(0.4)}>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform duration-300", showDetails && "rotate-180")}
            strokeWidth={1.5}
          />
          {showDetails ? "Hide" : "View"} detailed analysis
        </button>

        <div
          className={cn(
            "grid transition-all duration-500",
            showDetails ? "grid-rows-[1fr] mt-4 opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
          style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
        >
          <div className="overflow-hidden space-y-4">
            {/* Category scores */}
            {[
              { label: "Content Quality", pct: 92 },
              { label: "ATS Compatibility", pct: 85 },
              { label: "Format & Layout", pct: 78 },
              { label: "Impact & Metrics", pct: 71 },
            ].map((cat) => (
              <div key={cat.label}>
                <div className="flex justify-between text-[12px] mb-1.5">
                  <span className="text-foreground/70">{cat.label}</span>
                  <span className="font-medium text-foreground/50">{cat.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "var(--surface-2)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: showDetails ? `${cat.pct}%` : "0%",
                      background: "var(--primary)",
                      transitionTimingFunction: "var(--ease-out-expo)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>
    </div>
  );
}
