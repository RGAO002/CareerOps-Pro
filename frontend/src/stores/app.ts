// frontend/src/stores/app.ts
import { create } from "zustand";

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  prefsOpen: boolean;
  togglePrefs: () => void;

  modelChoice: string;
  setModelChoice: (m: string) => void;

  apiKeys: { openai: string; google: string; anthropic: string };
  setApiKey: (provider: "openai" | "google" | "anthropic", key: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  prefsOpen: false,
  togglePrefs: () =>
    set((s) => ({ prefsOpen: !s.prefsOpen })),

  modelChoice: "gpt-5.4-mini",
  setModelChoice: (modelChoice) => set({ modelChoice }),

  apiKeys: { openai: "", google: "", anthropic: "" },
  setApiKey: (provider, key) =>
    set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
}));
