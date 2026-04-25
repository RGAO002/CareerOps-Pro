// frontend/src/components/layout/AIChatPanel/colors.ts
/**
 * Shared color palette for the global AI panel.
 * Dark warm + terracotta accent + backdrop blur.
 * Mirrors the mockup palette validated during brainstorming.
 */
export const C = {
  // Surfaces
  panelBg:     "linear-gradient(180deg, oklch(0.17 0.030 34 / 0.94), oklch(0.13 0.028 35 / 0.96))",
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

  // Shadows — stronger, more visible drop for the floating panel
  shadowUp:    "0 14px 36px rgba(0,0,0,0.34), 0 4px 8px rgba(0,0,0,0.22)",
  shadowUpBig: "0 28px 56px rgba(0,0,0,0.42), 0 8px 16px rgba(0,0,0,0.28)",

  // ── "Liquid glass" surface for the message input — softened ──
  glassBg:     "linear-gradient(180deg, oklch(0.98 0.005 60 / 0.05) 0%, oklch(0.22 0.03 34 / 0.24) 40%, oklch(0.16 0.025 34 / 0.28) 100%)",
  glassBlur:   "blur(14px) saturate(1.25) brightness(1.02)",
  glassShadow: [
    "0 6px 18px rgba(0,0,0,0.22)",
    "0 1.5px 3px rgba(0,0,0,0.15)",
    "inset 0 1px 0 oklch(0.99 0.005 60 / 0.12)",
    "inset 0 -1px 0 rgba(0,0,0,0.18)",
  ].join(", "),
} as const;
