// frontend/src/components/layout/AIChatPanel/colors.ts
/**
 * Shared color palette for the global AI panel.
 * Dark warm + terracotta accent + backdrop blur.
 * Mirrors the mockup palette validated during brainstorming.
 */
export const C = {
  // Surfaces
  panelBg:     "linear-gradient(180deg, oklch(0.13 0.025 34 / 0.96), oklch(0.10 0.025 35 / 0.98))",
  // Static gradient that echoes the FluidCanvas shader palette
  // (terracotta → sage → blue), used when the shader is disabled
  // (e.g. collapsed state where animation would distort).
  panelBgStatic: "linear-gradient(90deg, oklch(0.22 0.12 30) 0%, oklch(0.18 0.07 150) 52%, oklch(0.18 0.09 260) 100%)",
  panelBlur:   "blur(10px)",
  border:      "1px solid oklch(0.28 0.018 35 / 0.5)",

  // Inner surfaces
  surface:     "oklch(0.18 0.025 34 / 0.6)",
  surface2:    "oklch(0.20 0.04 38)",
  surfaceHover:"oklch(0.22 0.03 36 / 0.7)",
  innerBorder: "oklch(0.28 0.018 35 / 0.5)",
  // Keyboard badge background (used in ⌘J / ⌘↑ / Esc badges)
  badgeBg:     "oklch(0.18 0.025 34 / 0.4)",

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
  // Send button active state — text color when button is enabled
  sendActiveText: "oklch(0.99 0.003 70)",

  // Shadows
  shadowUp:    "0 -8px 24px rgba(0,0,0,0.12)",
  shadowUpBig: "0 -16px 40px rgba(0,0,0,0.20)",

  // ── iOS-26-ish "liquid glass" surface (used for the message input) ──
  glassBg:     "oklch(0.20 0.025 34 / 0.28)",        // very translucent, warm tint
  glassBlur:   "blur(22px) saturate(1.7)",           // strong frost + color boost
  // Combined shadow: outer drop for lift, inner top highlight (glass sheen),
  // inner bottom shadow (depth). Applied via boxShadow.
  glassShadow: [
    "0 6px 20px rgba(0,0,0,0.22)",
    "0 1px 2px rgba(0,0,0,0.15)",
    "inset 0 1px 0 oklch(0.98 0.005 60 / 0.14)",
    "inset 0 -1px 0 rgba(0,0,0,0.18)",
  ].join(", "),
} as const;
