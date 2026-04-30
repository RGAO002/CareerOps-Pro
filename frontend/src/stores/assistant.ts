// frontend/src/stores/assistant.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AssistantPose = 'bar' | 'sidebar' | 'orb';
export type AssistantTab  = 'chat' | 'suggestions' | 'history';
export type AssistantTargetAgent = 'all' | 'recruit' | 'hm' | 'coach';

/** Per-agent visibility/selection mask, used by AgentChips (multi-select)
 *  and FluidCanvas (which orbs to show in the sidebar background). */
export interface AgentMask {
  recruit: boolean;
  hm: boolean;
  coach: boolean;
}

/** "all" = the user explicitly clicked the All-agents chip; show all 3 orbs,
 *  highlight the All chip and de-emphasize the individual ones.
 *  "custom" = at least one but not all individual agents are selected; orbs
 *  match the mask, individual chips highlight by mask. */
export type AgentMode = 'all' | 'custom';
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
  /** Mode + per-agent mask. Together they drive both chip highlight state
   *  and FluidCanvas orb visibility/scale. See `AgentMode` doc above. */
  agentMode: AgentMode;
  agentMask: AgentMask;
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
  /** Click "All agents" chip — collapses any custom mask back to all-on. */
  selectAllAgents: () => void;
  /** Click an individual agent chip (multi-select). Auto-promotes to 'all'
   *  if the click would result in all 3 selected, or leave 0 selected. */
  toggleAgent: (agent: 'recruit' | 'hm' | 'coach') => void;
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
      agentMode: 'all',
      agentMask: { recruit: true, hm: true, coach: true },
      activeRunId: null,
      barSize: 'compact',

      setPose: (pose) => set({ pose }),
      setTab: (tab) => set({ tab }),
      openSidebarWithScope: (scope) => set({ pose: 'sidebar', scope }),
      clearScope: () => set({ scope: null }),
      setTargetAgent: (targetAgent) => set({ targetAgent }),
      selectAllAgents: () => set({
        agentMode: 'all',
        agentMask: { recruit: true, hm: true, coach: true },
        targetAgent: 'all',
      }),
      toggleAgent: (agent) => set((s) => {
        // From 'all' → switching to custom starts fresh: ONLY this agent on.
        // From 'custom' → flip just that agent's bit.
        const base = s.agentMode === 'all'
          ? { recruit: false, hm: false, coach: false }
          : s.agentMask;
        const next: AgentMask = { ...base, [agent]: s.agentMode === 'all' ? true : !base[agent] };
        const count = (next.recruit ? 1 : 0) + (next.hm ? 1 : 0) + (next.coach ? 1 : 0);
        // Auto-promote: 0 selected (toggled off the only one) → snap back to
        // 'all' so the panel never sits in a degenerate empty state.
        // 3 selected (toggled on the last one) → also snap to 'all', as the
        // user requested ("三个都全选 自动跳到 all agents").
        if (count === 0 || count === 3) {
          return {
            agentMode: 'all' as const,
            agentMask: { recruit: true, hm: true, coach: true },
            targetAgent: 'all' as const,
          };
        }
        // 1 or 2 selected → custom mode. targetAgent (used for backend
        // routing) collapses pairs to 'all' since v0 backend doesn't model
        // 2-of-3; the visual still shows only the selected colors.
        const single = count === 1
          ? (next.recruit ? 'recruit' : next.hm ? 'hm' : 'coach') as AssistantTargetAgent
          : 'all' as const;
        return { agentMode: 'custom' as const, agentMask: next, targetAgent: single };
      }),
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
