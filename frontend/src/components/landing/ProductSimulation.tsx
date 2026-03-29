"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* Gentle easing — not snappy, more like a slow exhale */
const gentleOut = [0.25, 0.8, 0.25, 1] as const;

/* ── Simulation data ── */
const SKILLS = [
  { name: "Python", delay: 0 },
  { name: "React", delay: 0.25 },
  { name: "AWS", delay: 0.5 },
  { name: "SQL", delay: 0.75 },
  { name: "TypeScript", delay: 1.0 },
  { name: "Docker", delay: 1.25 },
];

const CATEGORIES = [
  { label: "Content", score: 92, color: "oklch(0.62 0.14 42)" },
  { label: "Format", score: 78, color: "oklch(0.60 0.12 150)" },
  { label: "Impact", score: 85, color: "oklch(0.58 0.10 260)" },
];

const MATCHES = [
  { title: "Senior PM", company: "Google", score: 94 },
  { title: "SWE II", company: "Meta", score: 89 },
  { title: "Staff Eng", company: "Stripe", score: 87 },
];

/* ── Phases — much slower, more breathing room ── */
type Phase = "idle" | "scanning" | "scoring" | "skills" | "matching" | "done" | "fading";

const PHASE_TIMING: Record<Phase, number> = {
  idle: 1500,
  scanning: 2500,
  scoring: 3500,
  skills: 3000,
  matching: 3000,
  done: 5000,    // hold the complete state
  fading: 1500,  // fade out before reset
};

/* Ease-out cubic for score counter — starts fast, decelerates */
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function ProductSimulation() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [cycle, setCycle] = useState(0);
  const rafRef = useRef<number>(0);

  /* Animate score with eased counting — smooth deceleration */
  useEffect(() => {
    if (phase !== "scoring") return;
    const target = 87;
    const duration = 2200; // ms
    const start = performance.now();

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setScore(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  /* Single-path phase state machine — no competing timers */
  useEffect(() => {
    const order: Phase[] = ["idle", "scanning", "scoring", "skills", "matching", "done", "fading"];
    const idx = order.indexOf(phase);

    const timeout = setTimeout(() => {
      if (phase === "fading") {
        // Reset cleanly
        setScore(0);
        setPhase("idle");
        setCycle((c) => c + 1);
      } else if (idx < order.length - 1) {
        setPhase(order[idx + 1]);
      }
    }, PHASE_TIMING[phase]);

    return () => clearTimeout(timeout);
  }, [phase, cycle]);

  const pastScoring = ["scoring", "skills", "matching", "done", "fading"].includes(phase);

  return (
    <div className="relative w-full max-w-[280px] mx-auto">
      {/* Main card — glass surface */}
      <motion.div
        className="relative rounded-2xl overflow-hidden"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: phase === "fading" ? 0.3 : 1, y: 0 }}
        transition={{ duration: phase === "fading" ? 1.2 : 1.6, ease: gentleOut }}
        style={{
          background: "oklch(0.14 0.03 260 / 0.6)",
          backdropFilter: "blur(20px) saturate(1.3)",
          WebkitBackdropFilter: "blur(20px) saturate(1.3)",
          border: "1px solid oklch(0.35 0.03 260 / 0.25)",
          boxShadow: `
            inset 0 1px 0 oklch(0.50 0.02 260 / 0.15),
            0 20px 60px oklch(0.05 0.02 260 / 0.4),
            0 4px 12px oklch(0.05 0.02 260 / 0.2)
          `,
          transformStyle: "preserve-3d",
          perspective: "1000px",
        }}
      >
        <div className="px-5 py-5 space-y-4">
          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-[oklch(0.55_0.02_260)]">
              Resume Analysis
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={phase}
                className="text-[9px] font-medium px-2 py-0.5 rounded-full"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.4, ease: gentleOut }}
                style={{
                  background:
                    phase === "done" || phase === "fading"
                      ? "oklch(0.55 0.14 150 / 0.15)"
                      : "oklch(0.65 0.14 42 / 0.15)",
                  color:
                    phase === "done" || phase === "fading"
                      ? "oklch(0.70 0.14 150)"
                      : "oklch(0.75 0.14 42)",
                }}
              >
                {phase === "idle" && "Waiting..."}
                {phase === "scanning" && "Scanning"}
                {phase === "scoring" && "Analyzing"}
                {phase === "skills" && "Extracting"}
                {phase === "matching" && "Matching"}
                {(phase === "done" || phase === "fading") && "Complete"}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* ── Score — gentle count-up ── */}
          <div className="flex items-end gap-3">
            <motion.span
              className="text-[42px] leading-none font-[family-name:var(--font-display)] tabular-nums"
              animate={{
                color: score > 0
                  ? "oklch(0.92 0.02 60)"
                  : "oklch(0.35 0.01 260)",
              }}
              transition={{ duration: 1, ease: gentleOut }}
            >
              {score}
            </motion.span>
            <span className="text-[11px] text-[oklch(0.45_0.01_260)] mb-1.5">/100</span>
          </div>

          {/* ── Category bars — slow fill ── */}
          <div className="space-y-2">
            {CATEGORIES.map((cat, i) => (
              <div key={cat.label} className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[oklch(0.55_0.02_260)]">{cat.label}</span>
                  <motion.span
                    className="tabular-nums text-[oklch(0.70_0.02_260)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: pastScoring ? 1 : 0 }}
                    transition={{ duration: 0.8, delay: 0.6 + i * 0.3, ease: gentleOut }}
                  >
                    {cat.score}%
                  </motion.span>
                </div>
                <div
                  className="h-[3px] rounded-full overflow-hidden"
                  style={{ background: "oklch(0.25 0.02 260)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: cat.color }}
                    initial={{ width: "0%" }}
                    animate={{ width: pastScoring ? `${cat.score}%` : "0%" }}
                    transition={{
                      duration: 2,
                      ease: gentleOut,
                      delay: 0.4 + i * 0.3,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ── Skills — fixed height container ── */}
          <div className="h-[42px]">
            <div className="flex flex-wrap gap-1.5">
              {SKILLS.map((skill) => {
                const showSkills = ["skills", "matching", "done", "fading"].includes(phase);
                return (
                  <motion.span
                    key={skill.name}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                    style={{
                      background: "oklch(0.25 0.03 260)",
                      color: "oklch(0.75 0.06 42)",
                      border: "1px solid oklch(0.35 0.04 260 / 0.3)",
                    }}
                    animate={{
                      opacity: showSkills ? 1 : 0,
                      scale: showSkills ? 1 : 0.7,
                      y: showSkills ? 0 : 6,
                    }}
                    transition={{
                      duration: 0.7,
                      ease: gentleOut,
                      delay: showSkills ? skill.delay : 0,
                    }}
                  >
                    {skill.name}
                  </motion.span>
                );
              })}
            </div>
          </div>

          {/* ── Divider ── */}
          <div
            className="h-[1px]"
            style={{ background: "oklch(0.30 0.02 260 / 0.4)" }}
          />

          {/* ── Matched roles — fixed layout, content fades in ── */}
          <div className="space-y-2">
            <span className="text-[10px] font-medium tracking-[0.08em] uppercase text-[oklch(0.45_0.01_260)]">
              Top Matches
            </span>
            <div className="space-y-1.5">
              {MATCHES.map((match, i) => {
                const showMatch = ["matching", "done", "fading"].includes(phase);
                return (
                  <motion.div
                    key={match.title}
                    className="flex items-center justify-between rounded-lg px-3 py-2 h-[44px]"
                    style={{
                      background: showMatch
                        ? "oklch(0.18 0.02 260 / 0.5)"
                        : "oklch(0.18 0.02 260 / 0.3)",
                      border: showMatch
                        ? "1px solid oklch(0.30 0.02 260 / 0.2)"
                        : "1px solid oklch(0.25 0.01 260 / 0.1)",
                    }}
                    animate={{
                      opacity: 1,
                    }}
                    transition={{ duration: 0.5 }}
                  >
                    <motion.div
                      animate={{
                        opacity: showMatch ? 1 : 0,
                        x: showMatch ? 0 : 12,
                      }}
                      transition={{
                        duration: 0.9,
                        ease: gentleOut,
                        delay: showMatch ? i * 0.35 : 0,
                      }}
                    >
                      <p className="text-[12px] font-medium text-[oklch(0.85_0.02_260)]">
                        {match.title}
                      </p>
                      <p className="text-[10px] text-[oklch(0.50_0.01_260)]">
                        {match.company}
                      </p>
                    </motion.div>
                    <motion.span
                      className="text-[11px] font-semibold tabular-nums"
                      style={{ color: "oklch(0.70 0.14 150)" }}
                      animate={{
                        opacity: showMatch ? 1 : 0,
                      }}
                      transition={{
                        duration: 0.9,
                        ease: gentleOut,
                        delay: showMatch ? i * 0.35 + 0.2 : 0,
                      }}
                    >
                      {match.score}%
                    </motion.span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Agent status line ── */}
      <div className="mt-4 h-5 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {phase !== "idle" && phase !== "done" && (
            <motion.div
              key={phase}
              className="flex items-center gap-2"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.5, ease: gentleOut }}
            >
              <motion.span
                className="size-[5px] rounded-full"
                style={{
                  backgroundColor:
                    phase === "scanning" ? "oklch(0.62 0.12 32)"
                    : phase === "scoring" ? "oklch(0.60 0.12 150)"
                    : phase === "skills" ? "oklch(0.60 0.10 260)"
                    : "oklch(0.62 0.12 32)",
                }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
              <span className="text-[10px] text-[oklch(0.55_0.02_260)]">
                {phase === "scanning" && "Recruiter scanning for ATS keywords..."}
                {phase === "scoring" && "Hiring Manager reviewing impact..."}
                {phase === "skills" && "Coach analyzing career narrative..."}
                {phase === "matching" && "Finding best role matches..."}
              </span>
            </motion.div>
          )}
          {(phase === "done" || phase === "fading") && (
            <motion.span
              key="done"
              className="text-[10px] text-[oklch(0.60_0.08_150)]"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.5, ease: gentleOut }}
            >
              ✓ Analysis complete
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* ── Reflection/glow beneath ── */}
      <motion.div
        className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[70%] h-12 rounded-full blur-[30px]"
        style={{ background: "oklch(0.50 0.10 42 / 0.15)" }}
        animate={{
          opacity: phase === "done" ? 0.3 : 0.1,
          scale: phase === "done" ? 1.1 : 1,
        }}
        transition={{ duration: 1.5, ease: gentleOut }}
      />

      {/* ── Agent indicators — sequential activation ── */}
      {[
        { name: "R", color: "oklch(0.62 0.12 32)", x: -16, y: 60, activateAt: 1 },   // scanning onwards
        { name: "H", color: "oklch(0.60 0.12 150)", x: -12, y: 160, activateAt: 2 },  // scoring onwards
        { name: "C", color: "oklch(0.60 0.10 260)", x: -14, y: 260, activateAt: 3 },  // skills onwards
      ].map((agent, i) => {
        const phaseOrder: Phase[] = ["idle", "scanning", "scoring", "skills", "matching", "done"];
        const currentIdx = phaseOrder.indexOf(phase);
        const isActive = currentIdx >= agent.activateAt;

        return (
          <motion.div
            key={agent.name}
            className="absolute flex items-center justify-center size-7 rounded-full text-[9px] font-bold transition-all duration-700"
            style={{
              left: agent.x,
              top: agent.y,
              background: isActive ? agent.color : "oklch(0.20 0.02 260 / 0.6)",
              color: isActive ? "oklch(0.98 0 0)" : "oklch(0.45 0.02 260)",
              border: `1px solid ${isActive ? agent.color : "oklch(0.30 0.02 260 / 0.3)"}`,
              boxShadow: isActive ? `0 0 16px ${agent.color}` : "0 0 0 transparent",
              transitionTimingFunction: "cubic-bezier(0.25, 0.8, 0.25, 1)",
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: 1,
              scale: isActive ? [1, 1.1, 1] : 1,
            }}
            transition={{
              opacity: { duration: 0.8, delay: 0.8 + i * 0.2, ease: gentleOut },
              scale: isActive
                ? { duration: 3, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.5, ease: gentleOut },
            }}
          >
            {agent.name}
          </motion.div>
        );
      })}
    </div>
  );
}
