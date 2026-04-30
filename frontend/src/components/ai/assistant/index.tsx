// frontend/src/components/ai/assistant/index.tsx
'use client';
import { AnimatePresence } from 'framer-motion';
import { useAssistantStore } from '@/stores/assistant';
import { useAssistantKeyboard, useRoutePoseSync } from './keyboard';
import { BarPose } from './poses/BarPose';
import { SidebarPose } from './poses/SidebarPose';
import { OrbPose } from './poses/OrbPose';

/**
 * Single mount-point for the AI assistant. Registers global shortcuts +
 * route-pose sync, then dispatches to the correct pose component.
 *
 * The "same identity" feeling is achieved by:
 *   1. A single, persistent <Assistant /> mount in <AppShell>.
 *   2. Each pose component uses Framer Motion's `layoutId="ai-assistant-shell"`
 *      on its outer wrapper so morph between poses animates the geometry.
 *
 * NB: the SSE session is owned by `frontend/src/components/ai/session.ts`
 * (module singleton). The Assistant tree never carries the EventSource —
 * unmounting any pose does NOT sever a run.
 */
export function Assistant() {
  useAssistantKeyboard();
  useRoutePoseSync();
  const pose = useAssistantStore((s) => s.pose);

  // AnimatePresence so each pose's `exit` animation runs on pose change.
  // Sidebar gets a slide-out-to-right exit; orb / bar can define their own.
  return (
    <AnimatePresence mode="wait" initial={false}>
      {pose === 'bar'     && <BarPose key="bar" />}
      {pose === 'sidebar' && <SidebarPose key="sidebar" />}
      {pose === 'orb'     && <OrbPose key="orb" />}
    </AnimatePresence>
  );
}
