"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTransitionStore } from "@/stores/transition";
import { useJobMatchStore } from "@/stores/jobMatch";
import { EmbeddingConstellation } from "@/components/jobs/EmbeddingConstellation";

const STATUS: Record<number, string> = {
  1: "Vectorizing your résumé…",
  2: "Scanning 1,247 open roles",
  3: "Matching against your signature",
};
const COUNTER: Record<number, string> = { 1: "1,247", 2: "247", 3: "12" };
const COUNTER_LABEL: Record<number, string> = { 1: "in scope", 2: "shortlisted", 3: "strong fits" };

export function MatchTransitionOverlay() {
  const phase     = useTransitionStore((s) => s.phase);
  const resumeId  = useTransitionStore((s) => s.resumeId);
  const signature = useJobMatchStore((s) => s.signature);
  const router    = useRouter();

  // Push to /jobs between phase 2→3
  useEffect(() => {
    if (phase === 3 && resumeId) {
      router.push(`/jobs?from_upload=1&resume=${resumeId}`);
    }
  }, [phase, resumeId, router]);

  const constellationPhase = (Math.min(phase, 3)) as 0 | 1 | 2 | 3;

  return (
    <AnimatePresence>
      {phase >= 1 && phase <= 3 && (
        <motion.div
          key="match-overlay"
          initial={{ opacity: 0, clipPath: "circle(0% at 62% 50%)" }}
          animate={{ opacity: 1, clipPath: "circle(150% at 62% 50%)" }}
          exit={{ opacity: 0, transition: { duration: 0.7 } }}
          transition={{ duration: 0.6, ease: [0.7, 0, 0.3, 1] }}
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "oklch(0.13 0.025 34)", overflow: "hidden" }}
        >
          {/* Fluid background */}
          <div style={{ position: "absolute", inset: "-30%", background: `radial-gradient(ellipse 42% 52% at 24% 28%, oklch(0.62 0.17 38 / 0.55), transparent 62%), radial-gradient(ellipse 42% 52% at 76% 72%, oklch(0.55 0.14 152 / 0.42), transparent 62%), radial-gradient(ellipse 40% 50% at 50% 50%, oklch(0.55 0.15 268 / 0.40), transparent 62%)`, filter: "blur(44px) saturate(1.25)", animation: "flow 16s ease-in-out infinite alternate" }} />
          {/* Scrim */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, oklch(0.10 0.020 34 / 0.55) 0%, oklch(0.08 0.015 34 / 0.75) 100%)" }} />

          {/* Status pill — top left */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{ position: "absolute", left: 32, top: 32, display: "flex", alignItems: "center", gap: 10 }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "oklch(0.62 0.13 38)", boxShadow: "0 0 12px oklch(0.62 0.13 38)", animation: "beacon 1.2s ease-in-out infinite", flexShrink: 0 }} />
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
              {STATUS[phase] ?? ""}
            </span>
          </motion.div>

          {/* Counter — top right */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            style={{ position: "absolute", right: 32, top: 32, textAlign: "right" }}
          >
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, fontWeight: 500, letterSpacing: "0.20em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", marginBottom: 6 }}>Candidates</div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 36, fontWeight: 300, color: "#fff", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>{COUNTER[phase] ?? ""}</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{COUNTER_LABEL[phase] ?? ""}</div>
          </motion.div>

          {/* Center stage — tokens + constellation */}
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <div style={{ position: "relative", width: "72%", maxWidth: 920 }}>
              {/* Signature tokens */}
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 30, flexWrap: "wrap" }}>
                {signature.map((token, i) => (
                  <motion.span
                    key={token}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 + i * 0.08 }}
                    style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 500, padding: "7px 12px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
                  >
                    {token}
                  </motion.span>
                ))}
              </div>
              <EmbeddingConstellation phase={constellationPhase} dark />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
