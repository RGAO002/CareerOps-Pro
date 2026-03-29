"use client";

export function WelcomeHero() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <section className="animate-fade-up" style={{ "--stagger": 0 } as React.CSSProperties}>
      <div className="overflow-hidden rounded-2xl shadow-[0_1px_3px_oklch(0.15_0.02_50/0.08)]">
        <div className="grid grid-cols-5 min-h-[320px]">

          {/* ── Left: Warm, personal ── */}
          <div
            className="col-span-3 relative flex flex-col justify-center px-12 py-14 overflow-hidden"
            style={{
              background:
                "linear-gradient(160deg, oklch(0.99 0.003 70) 0%, oklch(0.96 0.02 50) 60%, oklch(0.93 0.05 45) 100%)",
            }}
          >
            {/* Floating warm orbs on left side too */}
            <div
              className="absolute w-64 h-64 rounded-full blur-[80px] bg-[oklch(0.90_0.06_42)]"
              style={{ top: "-10%", right: "-5%", opacity: 0.5, animation: "drift-1 12s ease-in-out infinite" }}
            />
            <div
              className="absolute w-48 h-48 rounded-full blur-[70px] bg-[oklch(0.92_0.05_65)]"
              style={{ bottom: "0%", left: "-5%", opacity: 0.4, animation: "drift-2 15s ease-in-out infinite" }}
            />

            <div className="relative z-10">
              <p className="text-[12px] font-semibold tracking-[0.15em] uppercase text-primary mb-4">
                {greeting}
              </p>

              <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.75rem)] leading-[1.12] tracking-[-0.02em] text-foreground">
                Let&apos;s find your
                <br />
                <em className="not-italic" style={{ color: "oklch(0.60 0.14 42)" }}>
                  next role
                </em>
              </h1>

              <p className="mt-5 max-w-[32ch] text-[15px] leading-[1.7] text-foreground/50 font-light">
                Your AI career team will analyze your resume, match opportunities,
                and coach you through the process.
              </p>
            </div>
          </div>

          {/* ── Right: Dark tech panel ── */}
          <div
            className="col-span-2 relative flex flex-col justify-end overflow-hidden px-8 py-10"
            style={{
              background:
                "linear-gradient(160deg, oklch(0.22 0.04 40) 0%, oklch(0.16 0.06 280) 60%, oklch(0.14 0.04 260) 100%)",
            }}
          >
            {/* Dot grid texture */}
            <div
              className="absolute inset-0 opacity-[0.15]"
              style={{
                backgroundImage:
                  "radial-gradient(oklch(0.80 0.04 42 / 0.6) 0.5px, transparent 0.5px)",
                backgroundSize: "14px 14px",
              }}
            />

            {/* Animated floating orbs */}
            <div
              className="absolute w-44 h-44 rounded-full blur-[60px] bg-[oklch(0.60_0.16_42)]"
              style={{ top: "5%", right: "10%", opacity: 0.25, animation: "drift-1 8s ease-in-out infinite" }}
            />
            <div
              className="absolute w-36 h-36 rounded-full blur-[55px] bg-[oklch(0.50_0.14_260)]"
              style={{ top: "50%", left: "5%", opacity: 0.2, animation: "drift-2 11s ease-in-out infinite" }}
            />
            <div
              className="absolute w-28 h-28 rounded-full blur-[50px] bg-[oklch(0.55_0.16_150)]"
              style={{ bottom: "10%", right: "30%", opacity: 0.18, animation: "drift-3 9s ease-in-out infinite" }}
            />

            {/* Animated flowing curves */}
            <svg
              className="absolute inset-0 w-full h-full opacity-[0.15]"
              viewBox="0 0 300 320"
              fill="none"
              preserveAspectRatio="none"
            >
              <path stroke="oklch(0.70 0.14 42)" strokeWidth="1.5" fill="none">
                <animate
                  attributeName="d"
                  values="M0 240 Q80 180 160 210 T300 150;M0 220 Q80 200 160 190 T300 170;M0 240 Q80 180 160 210 T300 150"
                  dur="8s"
                  repeatCount="indefinite"
                />
              </path>
              <path stroke="oklch(0.60 0.12 150)" strokeWidth="1" fill="none">
                <animate
                  attributeName="d"
                  values="M0 270 Q100 220 200 250 T300 190;M0 260 Q100 240 200 230 T300 210;M0 270 Q100 220 200 250 T300 190"
                  dur="10s"
                  repeatCount="indefinite"
                />
              </path>
              <path stroke="oklch(0.65 0.08 260)" strokeWidth="0.8" fill="none">
                <animate
                  attributeName="d"
                  values="M0 210 Q120 160 240 190 T300 120;M0 200 Q120 180 240 170 T300 140;M0 210 Q120 160 240 190 T300 120"
                  dur="12s"
                  repeatCount="indefinite"
                />
              </path>
            </svg>

            {/* Status content */}
            <div className="relative space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="size-[6px] rounded-full animate-pulse"
                  style={{
                    backgroundColor: "oklch(0.65 0.16 150)",
                    boxShadow: "0 0 10px oklch(0.65 0.16 150 / 0.7)",
                  }}
                />
                <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[oklch(0.70_0.03_260)]">
                  AI Team Ready
                </span>
              </div>
              <p className="text-[13px] leading-[1.65] text-[oklch(0.55_0.02_260)] font-light">
                3 specialized agents will review
                <br />
                your resume from different angles
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
