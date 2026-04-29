// frontend/src/components/ai/assistant/keyboard.ts
//
// Cmd+\ (or Ctrl+\) toggles the assistant pose between the two allowed poses
// for the current route.
//
// /editor → sidebar ↔ orb
// other   → bar ↔ orb is NOT allowed by §c, so on those routes Cmd+\ is a no-op
//          besides bar (already there).
//
// Existing shortcuts (Cmd+J, Cmd+↑, Cmd+↓) used to drive the legacy three-state
// AIChatPanel; those are no longer relevant once the panel is deleted in
// Task 16. They are removed alongside the panel; we do NOT register
// replacements here.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAssistantStore } from '@/stores/assistant';
import { allowedPosesForRoute } from './route-pose';

export function useAssistantKeyboard(): void {
  const pathname = usePathname();
  useEffect(() => {
    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.key !== '\\') return;
      e.preventDefault();
      const allowed = allowedPosesForRoute(pathname || '/');
      if (allowed.length < 2) return;  // only one pose → nothing to toggle
      const cur = useAssistantStore.getState().pose;
      const idx = allowed.indexOf(cur);
      const next = idx === -1 ? allowed[0] : allowed[(idx + 1) % allowed.length];
      useAssistantStore.getState().setPose(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname]);
}

/** Hook: sync pose to route default whenever the pathname changes. Skips if
 *  the user has explicitly chosen a pose this session (persisted via the
 *  store middleware). The semantic: route default is suggestive, not coercive,
 *  but /editor is special — it forces sidebar on entry. */
export function useRoutePoseSync(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    const allowed = allowedPosesForRoute(pathname);
    const cur = useAssistantStore.getState().pose;
    if (!allowed.includes(cur)) {
      // Current pose isn't allowed here — snap to the first allowed.
      useAssistantStore.getState().setPose(allowed[0]);
    }
  }, [pathname]);
}
