// frontend/src/components/layout/AIChatPanel/colors.ts
/**
 * Shared color palette for the global AI panel.
 * Dark warm + terracotta accent + backdrop blur.
 * Mirrors the mockup palette validated during brainstorming.
 */
export const C = {
  // Surfaces
  panelBg:     "linear-gradient(180deg, oklch(0.13 0.025 34 / 0.96), oklch(0.10 0.025 35 / 0.98))",
  panelBlur:   "blur(10px)",
  border:      "1px solid oklch(0.28 0.018 35 / 0.5)",

  // Inner surfaces
  surface:     "oklch(0.18 0.025 34 / 0.6)",
  surface2:    "oklch(0.20 0.04 38)",
  surfaceHover:"oklch(0.22 0.03 36 / 0.7)",
  innerBorder: "oklch(0.28 0.018 35 / 0.5)",

  // Accents
  accent:      "oklch(0.72 0.13 38)",       // terracotta
  accentMuted: "oklch(0.72 0.13 38 / 0.18)",
  accentWarm:  "oklch(0.78 0.12 42)",
  brandGrad:   "linear-gradient(135deg, #c5915a, #9d5e3a)",

  // Text
  textPrimary: "oklch(0.93 0.010 55)",
  textBody:    "oklch(0.85 0.020 50)",
  textMuted:   "oklch(0.55 0.020 50)",
  textDim:     "oklch(0.45 0.010 50)",
  userBubble:  "oklch(0.92 0.010 50)",

  // Shadows
  shadowUp:    "0 -8px 24px rgba(0,0,0,0.12)",
  shadowUpBig: "0 -16px 40px rgba(0,0,0,0.20)",
} as const;
