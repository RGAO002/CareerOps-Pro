// frontend/src/stores/assistant.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AssistantPose = 'bar' | 'sidebar' | 'orb';
export type AssistantTab  = 'chat' | 'suggestions' | 'history';
export type AssistantTargetAgent = 'all' | 'recruit' | 'hm' | 'coach';
/** Three-tier sizing for the bar pose (was the legacy AIChatPanel's 3 sizes).
 *  collapsed = small pill, compact = command-bar, expanded = chat-card. */
export type BarSize = 'collapsed' | 'compact' | 'expanded';

export interface AssistantScope {
  /** Block id (section / entry / bullet / header) the assistant is focused on. */
  blockId: string;
  /** Human label shown in the scope pill, e.g. "Experience · Linear Labs". */
  label: string;
}

interface AssistantState {
  pose: AssistantPose;
  tab: AssistantTab;
  scope: AssistantScope | null;
  targetAgent: AssistantTargetAgent;
  /** Run id of the currently-streaming SSE connection, if any. Used by
   *  the session singleton to dedupe + by the UI to show a typing indicator. */
  activeRunId: string | null;
  /** Sub-pose only meaningful when pose === 'bar'. Bar can shrink to a tiny
   *  pill, sit at command-bar size, or expand to a chat card. */
  barSize: BarSize;

  setPose: (p: AssistantPose) => void;
  setTab: (t: AssistantTab) => void;
  openSidebarWithScope: (scope: AssistantScope) => void;
  clearScope: () => void;
  setTargetAgent: (a: AssistantTargetAgent) => void;
  setActiveRunId: (id: string | null) => void;
  setBarSize: (s: BarSize) => void;
  /** Step bar size up one tier (collapsed → compact → expanded). No-op at top. */
  expandBar: () => void;
  /** Step bar size down one tier (expanded → compact → collapsed). No-op at bottom. */
  collapseBar: () => void;
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set) => ({
      pose: 'bar',
      tab: 'chat',
      scope: null,
      targetAgent: 'all',
      activeRunId: null,
      barSize: 'compact',

      setPose: (pose) => set({ pose }),
      setTab: (tab) => set({ tab }),
      openSidebarWithScope: (scope) => set({ pose: 'sidebar', scope }),
      clearScope: () => set({ scope: null }),
      setTargetAgent: (targetAgent) => set({ targetAgent }),
      setActiveRunId: (activeRunId) => set({ activeRunId }),
      setBarSize: (barSize) => set({ barSize }),
      expandBar: () => set((s) => ({
        barSize: s.barSize === 'collapsed' ? 'compact'
               : s.barSize === 'compact'   ? 'expanded'
               : 'expanded',
      })),
      collapseBar: () => set((s) => ({
        barSize: s.barSize === 'expanded' ? 'compact'
               : s.barSize === 'compact'  ? 'collapsed'
               : 'collapsed',
      })),
    }),
    {
      name: 'careerops-assistant',
      // Only persist user-controlled prefs. Scope and activeRunId are runtime-only.
      partialize: (s) => ({ pose: s.pose, tab: s.tab, targetAgent: s.targetAgent, barSize: s.barSize }),
    },
  ),
);
