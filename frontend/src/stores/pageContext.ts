import { create } from "zustand";

export interface PageContext {
  /** Stable identifier for the page (e.g. "resume_editor", "dashboard"). */
  page: string;
  /** Natural-language summary fed into the AI's system prompt. */
  summary: string;
  /** Optional structured payload for tool calls. */
  data?: Record<string, unknown>;
}

interface PageContextStore {
  context: PageContext | null;
  setPageContext: (ctx: PageContext) => void;
  clearPageContext: () => void;
}

export const usePageContextStore = create<PageContextStore>((set) => ({
  context: null,
  setPageContext: (ctx) => set({ context: ctx }),
  clearPageContext: () => set({ context: null }),
}));
