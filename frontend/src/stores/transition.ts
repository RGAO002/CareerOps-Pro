import { create } from "zustand";

export type Phase = 0 | 1 | 2 | 3 | 4;

interface TransitionState {
  phase: Phase;
  resumeId: string | null;
  start: (resumeId: string) => void;
  finish: () => void;
}

export const useTransitionStore = create<TransitionState>((set) => ({
  phase: 0,
  resumeId: null,
  start: (resumeId) => {
    set({ phase: 1, resumeId });
    setTimeout(() => set({ phase: 2 }), 1000);
    setTimeout(() => set({ phase: 3 }), 2200);
    setTimeout(() => set({ phase: 4 }), 4200);
    setTimeout(() => set({ phase: 0, resumeId: null }), 4900);
  },
  finish: () => set({ phase: 0, resumeId: null }),
}));
