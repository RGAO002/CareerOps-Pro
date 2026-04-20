// frontend/src/components/layout/AIChatPanel/platform.ts
/**
 * Platform-aware modifier key label.
 * "⌘" on macOS, "Ctrl" on Windows/Linux.
 * SSR-safe (returns "⌘" on the server, then re-evaluates after hydration).
 */
export function modKeyLabel(): string {
  if (typeof navigator === "undefined") return "⌘";
  return /Mac/i.test(navigator.userAgent) ? "⌘" : "Ctrl";
}
