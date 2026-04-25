import { create } from "zustand";

export type AiPanelState = "collapsed" | "compact" | "expanded";

interface AiPanelStore {
  state: AiPanelState;

  /** Drop one level: expanded → compact, compact → collapsed. No-op at collapsed. */
  collapse: () => void;
  /** Move up one level: collapsed → compact, compact → expanded. No-op at expanded. */
  expandOne: () => void;
  /** Force a specific state. */
  setState: (s: AiPanelState) => void;
  /** Convenience: jump straight to expanded. */
  forceExpand: () => void;
}

export const useAiPanelStore = create<AiPanelStore>((set) => ({
  state: "compact",

  collapse: () =>
    set((s) => ({
      state:
        s.state === "expanded" ? "compact" :
        s.state === "compact"  ? "collapsed" :
        "collapsed",
    })),

  expandOne: () =>
    set((s) => ({
      state:
        s.state === "collapsed" ? "compact"  :
        s.state === "compact"   ? "expanded" :
        "expanded",
    })),

  setState: (state) => set({ state }),
  forceExpand: () => set({ state: "expanded" }),
}));
