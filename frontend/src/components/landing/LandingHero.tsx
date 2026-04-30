"use client";

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Loader2, Check, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useResumeStore } from "@/stores/resume";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useSpring,
} from "framer-motion";
import { FluidCanvas } from "./FluidCanvas";
import { ProductSimulation } from "./ProductSimulation";

/* ── Easing ── */
const expoOut = [0.16, 1, 0.3, 1] as const;
const quartOut = [0.25, 1, 0.5, 1] as const;

/* ── Orchestration delays (seconds) ── */
const STAGGER = {
  logo: 0,
  headline: 0.15,
  subtext: 0.3,
  dropzone: 0.5,
  panel: 0.2,
  agentLabel: 0.6,
  agent: (i: number) => 0.75 + i * 0.12,
};

/* Encouraging messages while analyzing — specific to what agents actually do */
const PARSING_MESSAGES = [
  "Scanning for ATS compatibility...",
  "Checking keyword alignment...",
  "Reviewing your impact statements...",
  "Analyzing career progression...",
  "Identifying your strongest points...",
];

export function LandingHero() {
  const [hovering, setHovering] = useState(false);
  const [parsingMsgIdx, setParsingMsgIdx] = useState(0);
  const parsing = useResumeStore((s) => s.parsing);
  const pdfFilename = useResumeStore((s) => s.pdfFilename);
  const setParsing = useResumeStore((s) => s.setParsing);
  const setResumeData = useResumeStore((s) => s.setResumeData);

  /* Rotate parsing messages */
  useEffect(() => {
    if (!parsing) return;
    const interval = setInterval(() => {
      setParsingMsgIdx((prev) => (prev + 1) % PARSING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [parsing]);

  /* Mouse parallax for left-side orbs */
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const orbX1 = useSpring(useTransform(mouseX, [0, 1], [-40, 40]), { stiffness: 50, damping: 30 });
  const orbY1 = useSpring(useTransform(mouseY, [0, 1], [-30, 30]), { stiffness: 50, damping: 30 });
  const orbX2 = useSpring(useTransform(mouseX, [0, 1], [30, -30]), { stiffness: 40, damping: 25 });
  const orbY2 = useSpring(useTransform(mouseY, [0, 1], [25, -25]), { stiffness: 40, damping: 25 });
  const orbX3 = useSpring(useTransform(mouseX, [0, 1], [-20, 50]), { stiffness: 60, damping: 35 });
  const orbY3 = useSpring(useTransform(mouseY, [0, 1], [40, -20]), { stiffness: 60, damping: 35 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mouseX.set((e.clientX - rect.left) / rect.width);
      mouseY.set((e.clientY - rect.top) / rect.height);
    },
    [mouseX, mouseY],
  );

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setParsing(true);
      await new Promise((r) => setTimeout(r, 2000));
      setResumeData({ name: "Demo" }, file.name);
      setParsing(false);
    },
    [setParsing, setResumeData],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: parsing,
  });

  /* ── Shared entrance variant ── */
  const fadeSlideUp = (delay: number) => ({
    initial: { opacity: 0, y: 30 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.9, ease: expoOut, delay },
    },
  });

  const fadeSlideRight = (delay: number) => ({
    initial: { opacity: 0, x: 60 },
    animate: {
      opacity: 1,
      x: 0,
      transition: { duration: 1, ease: expoOut, delay },
    },
  });

  return (
    <main className="relative min-h-screen flex overflow-hidden" aria-label="Welcome to CareerOps Pro">
      {/* ══════════ LEFT — Warm side with mouse-reactive orbs ══════════ */}
      <div
        className="relative flex-1 flex flex-col items-center justify-center px-8 md:px-16 lg:px-20"
        onMouseMove={handleMouseMove}
      >
        {/* Base */}
        <div
          className="absolute inset-0"
          style={{ background: "oklch(0.97 0.008 55)" }}
        />

        {/* Static mesh */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 60% 50% at 25% 20%, oklch(0.94 0.04 35 / 0.5) 0%, transparent 70%),
              radial-gradient(ellipse 50% 60% at 75% 70%, oklch(0.93 0.03 55 / 0.4) 0%, transparent 60%),
              radial-gradient(ellipse 40% 35% at 60% 30%, oklch(0.95 0.025 80 / 0.3) 0%, transparent 55%)
            `,
          }}
        />

        {/* ── Mouse-reactive light orbs ── */}
        <motion.div
          className="absolute w-[550px] h-[550px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, oklch(0.82 0.14 35) 0%, transparent 60%)",
            top: "-5%",
            left: "-5%",
            opacity: 0.55,
            x: orbX1,
            y: orbY1,
          }}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.55 }}
          transition={{ duration: 2, ease: expoOut }}
        />
        <motion.div
          className="absolute w-[450px] h-[450px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, oklch(0.85 0.10 70) 0%, transparent 60%)",
            bottom: "-5%",
            right: "-10%",
            opacity: 0.45,
            x: orbX2,
            y: orbY2,
          }}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.45 }}
          transition={{ duration: 2.2, ease: expoOut, delay: 0.3 }}
        />
        <motion.div
          className="absolute w-[350px] h-[350px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, oklch(0.80 0.12 20) 0%, transparent 55%)",
            top: "35%",
            left: "40%",
            opacity: 0.35,
            x: orbX3,
            y: orbY3,
          }}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.35 }}
          transition={{ duration: 2.5, ease: expoOut, delay: 0.5 }}
        />

        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(oklch(0.35 0.02 50) 0.5px, transparent 0.5px)",
            backgroundSize: "20px 20px",
          }}
        />

        {/* ── Content — orchestrated entrance ── */}
        <div className="relative z-10 w-full max-w-md px-4">
          {/* Logo */}
          <motion.div
            {...fadeSlideUp(STAGGER.logo)}
            className="mb-10 flex size-12 items-center justify-center rounded-[14px]"
            style={{
              background: "linear-gradient(145deg, oklch(0.66 0.12 32 / 0.85), oklch(0.54 0.14 28 / 0.9))",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 4px 20px oklch(0.62 0.12 32 / 0.25), inset 0 1px 0 oklch(1 0 0 / 0.15)",
              border: "1px solid oklch(0.70 0.10 32 / 0.2)",
            }}
          >
            <span className="text-[15px] font-bold text-[oklch(0.99_0.003_70)]">C</span>
          </motion.div>

          {/* Headline — word-by-word reveal */}
          <motion.h1
            className="font-[family-name:var(--font-display)] text-[clamp(2.5rem,5vw,4rem)] leading-[1.08] tracking-[-0.03em] text-foreground"
            {...fadeSlideUp(STAGGER.headline)}
          >
            Your career,
            <br />
            <motion.em
              className="italic"
              style={{ color: "oklch(0.58 0.12 32)" }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, ease: expoOut, delay: 0.4 }}
            >
              reimagined.
            </motion.em>
          </motion.h1>

          <motion.p
            {...fadeSlideUp(STAGGER.subtext)}
            className="mt-6 text-[15px] leading-[1.75] text-foreground/50 font-light max-w-[38ch]"
          >
            Three AI specialists analyze your resume from every angle.
            One mission — land the role you deserve.
          </motion.p>

          {/* ── Drop Zone ── */}
          {/* NOTE: react-dropzone's getRootProps() returns onDrag (DragEventHandler) which
              clashes with framer-motion's onDrag (PanInfo callback). Cast to any to bridge
              the type clash — runtime behavior is unaffected (motion.div accepts both at runtime). */}
          <motion.div
            {...fadeSlideUp(STAGGER.dropzone)}
            className="mt-10 w-full"
            role="button"
            aria-label="Upload your resume — drop a PDF file or click to browse"
            tabIndex={0}
            {...(getRootProps() as any)}
          >
            <input {...getInputProps()} />
            <motion.div
              onHoverStart={() => setHovering(true)}
              onHoverEnd={() => setHovering(false)}
              className={cn(
                "group relative cursor-pointer rounded-2xl p-[1px]",
                parsing && "pointer-events-none",
              )}
              animate={{
                boxShadow: isDragActive
                  ? [
                      "0 0 30px oklch(0.65 0.14 42 / 0.35), 0 0 80px oklch(0.65 0.14 42 / 0.15)",
                      "0 0 50px oklch(0.65 0.14 42 / 0.5), 0 0 120px oklch(0.65 0.14 42 / 0.2)",
                      "0 0 30px oklch(0.65 0.14 42 / 0.35), 0 0 80px oklch(0.65 0.14 42 / 0.15)",
                    ]
                  : hovering
                    ? "0 0 25px oklch(0.65 0.14 42 / 0.25), 0 0 60px oklch(0.65 0.14 42 / 0.08)"
                    : [
                        "0 0 15px oklch(0.65 0.14 42 / 0.1), 0 0 40px oklch(0.65 0.14 42 / 0.03)",
                        "0 0 25px oklch(0.65 0.14 42 / 0.2), 0 0 60px oklch(0.65 0.14 42 / 0.06)",
                        "0 0 15px oklch(0.65 0.14 42 / 0.1), 0 0 40px oklch(0.65 0.14 42 / 0.03)",
                      ],
              }}
              transition={
                isDragActive
                  ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                  : hovering
                    ? { duration: 0.4, ease: quartOut }
                    : { duration: 3, repeat: Infinity, ease: "easeInOut" }
              }
            >
              <motion.div
                className="relative overflow-hidden rounded-2xl"
                animate={{
                  scale: isDragActive ? 1.03 : hovering ? 1.01 : 1,
                }}
                transition={{ duration: 0.5, ease: expoOut }}
                style={{
                  background: isDragActive
                    ? "linear-gradient(160deg, oklch(0.96 0.03 42 / 0.65), oklch(0.92 0.05 35 / 0.55))"
                    : "linear-gradient(160deg, oklch(0.99 0.005 55 / 0.55), oklch(0.96 0.01 45 / 0.45))",
                  backdropFilter: "blur(24px) saturate(1.3)",
                  WebkitBackdropFilter: "blur(24px) saturate(1.3)",
                  boxShadow: [
                    "inset 0 1px 0 oklch(1 0 0 / 0.35)",
                    "inset 0 -1px 0 oklch(1 0 0 / 0.1)",
                    "0 4px 24px oklch(0.40 0.04 42 / 0.06)",
                    "0 1px 2px oklch(0.40 0.04 42 / 0.04)",
                  ].join(", "),
                  border: "1px solid oklch(1 0 0 / 0.2)",
                }}
              >
                {/* Scan lines when parsing */}
                <AnimatePresence>
                  {parsing && (
                    <>
                      {[
                        { color: "oklch(0.62 0.14 32 / 0.6)", delay: 0 },
                        { color: "oklch(0.60 0.12 150 / 0.5)", delay: 0.6 },
                        { color: "oklch(0.58 0.10 260 / 0.4)", delay: 1.2 },
                      ].map((line, i) => (
                        <motion.div
                          key={i}
                          className="absolute inset-x-0 h-[2px] z-20"
                          style={{
                            background: `linear-gradient(90deg, transparent, ${line.color}, transparent)`,
                          }}
                          initial={{ y: "-100%", opacity: 0 }}
                          animate={{ y: "400%", opacity: [0, 1, 1, 0] }}
                          transition={{
                            duration: 2,
                            ease: "easeInOut",
                            repeat: Infinity,
                            delay: line.delay,
                          }}
                        />
                      ))}
                    </>
                  )}
                </AnimatePresence>

                <div className="flex flex-col items-center gap-5 px-10 py-10">
                  {/* Icon */}
                  <div className="relative">
                    <motion.div
                      className="relative flex size-14 items-center justify-center rounded-xl"
                      animate={{
                        background:
                          pdfFilename && !parsing
                            ? "linear-gradient(145deg, oklch(0.92 0.04 150), oklch(0.88 0.05 145))"
                            : parsing
                              ? "linear-gradient(145deg, oklch(0.60 0.14 42), oklch(0.50 0.16 30))"
                              : isDragActive
                                ? "linear-gradient(145deg, oklch(0.62 0.14 32), oklch(0.52 0.14 28))"
                                : "linear-gradient(145deg, oklch(0.92 0.03 42), oklch(0.88 0.04 35))",
                        boxShadow:
                          pdfFilename && !parsing
                            ? "0 4px 16px oklch(0.55 0.14 150 / 0.2)"
                            : isDragActive || parsing
                              ? "0 4px 20px oklch(0.62 0.14 32 / 0.3)"
                              : "0 2px 8px oklch(0.50 0.04 42 / 0.1)",
                      }}
                      transition={{ duration: 0.5, ease: expoOut }}
                    >
                      <AnimatePresence mode="wait">
                        {parsing ? (
                          <motion.div
                            key="loader"
                            initial={{ opacity: 0, rotate: -90 }}
                            animate={{ opacity: 1, rotate: 0 }}
                            exit={{ opacity: 0, rotate: 90 }}
                            transition={{ duration: 0.3 }}
                          >
                            <Loader2
                              className="size-6 animate-spin"
                              strokeWidth={1.5}
                              style={{ color: "oklch(0.98 0.003 70)" }}
                            />
                          </motion.div>
                        ) : pdfFilename ? (
                          <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{
                              duration: 0.5,
                              ease: expoOut,
                              scale: { type: "spring", stiffness: 300, damping: 15 },
                            }}
                          >
                            <Check
                              className="size-6"
                              strokeWidth={2.5}
                              style={{ color: "oklch(0.55 0.14 150)" }}
                            />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="upload"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: isDragActive ? -4 : 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.4, ease: expoOut }}
                          >
                            <Upload
                              className="size-6"
                              strokeWidth={1.5}
                              style={{
                                color: isDragActive
                                  ? "oklch(0.98 0.003 70)"
                                  : "oklch(0.55 0.12 32)",
                              }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </div>

                  {/* Text */}
                  <div className="text-center">
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={
                          pdfFilename && !parsing
                            ? "done"
                            : parsing
                              ? `parsing-${parsingMsgIdx}`
                              : isDragActive
                                ? "drag"
                                : "idle"
                        }
                        className="text-[15px] font-semibold"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.25 }}
                        style={{
                          color:
                            pdfFilename && !parsing
                              ? "oklch(0.45 0.12 150)"
                              : isDragActive
                                ? "oklch(0.50 0.14 32)"
                                : parsing
                                  ? "oklch(0.50 0.12 32)"
                                  : "oklch(0.25 0.02 42)",
                        }}
                      >
                        {pdfFilename && !parsing
                          ? "Looking good — let\u2019s get started"
                          : parsing
                            ? PARSING_MESSAGES[parsingMsgIdx]
                            : isDragActive
                              ? "Release to drop"
                              : "Drop your resume here"}
                      </motion.p>
                    </AnimatePresence>
                    <p className="mt-1.5 text-[12px] text-foreground/30">
                      {pdfFilename && !parsing ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <FileText className="size-3 inline" strokeWidth={1.5} />
                          {pdfFilename}
                        </span>
                      ) : parsing ? (
                        "3 specialists analyzing your resume"
                      ) : (
                        "PDF up to 10 MB — or click to browse"
                      )}
                    </p>
                  </div>

                  {/* Breathing dots / Agent indicators */}
                  <AnimatePresence mode="wait">
                    {parsing ? (
                      <motion.div
                        key="agents"
                        className="flex gap-4 mt-1"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3 }}
                      >
                        {[
                          { label: "Recruiter", color: "oklch(0.62 0.12 32)", delay: 0 },
                          { label: "HM", color: "oklch(0.60 0.12 150)", delay: 0.3 },
                          { label: "Coach", color: "oklch(0.60 0.10 260)", delay: 0.6 },
                        ].map((agent) => (
                          <div key={agent.label} className="flex items-center gap-1.5">
                            <motion.div
                              className="size-[5px] rounded-full"
                              style={{ backgroundColor: agent.color }}
                              animate={{
                                opacity: [0.3, 1, 0.3],
                                scale: [1, 1.4, 1],
                              }}
                              transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: agent.delay,
                              }}
                            />
                            <span className="text-[10px] font-medium text-foreground/30">
                              {agent.label}
                            </span>
                          </div>
                        ))}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="dots"
                        className="flex items-center gap-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        {[0, 0.4, 0.8].map((delay) => (
                          <motion.div
                            key={delay}
                            className="size-[5px] rounded-full"
                            style={{ backgroundColor: "oklch(0.62 0.14 32)" }}
                            animate={{
                              opacity: [0.25, 1, 0.25],
                              scale: [1, 1.5, 1],
                            }}
                            transition={{
                              duration: 2.5,
                              repeat: Infinity,
                              ease: "easeInOut",
                              delay,
                            }}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* ══════════ RIGHT — Dark tech panel ══════════ */}
      <motion.div
        className="relative w-[38%] flex flex-col items-center justify-center overflow-hidden"
        initial={{ opacity: 0, x: 80, scaleX: 0.95 }}
        animate={{ opacity: 1, x: 0, scaleX: 1 }}
        transition={{ duration: 1.2, ease: expoOut, delay: STAGGER.panel }}
        style={{ transformOrigin: "right center" }}
      >
        {/* WebGL fluid gradient */}
        <FluidCanvas className="absolute inset-0" />

        {/* Noise texture */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
            backgroundSize: "128px 128px",
          }}
        />

        {/* Live product simulation */}
        <div className="relative z-10 px-6 py-10">
          <ProductSimulation />
        </div>
      </motion.div>
    </main>
  );
}
