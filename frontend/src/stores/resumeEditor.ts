// frontend/src/stores/resumeEditor.ts
import { create } from "zustand";

import type { Resume, ResumeSummary } from "@/lib/resumeApi";

type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

interface ResumeEditorStore {
  current: Resume | null;
  available: ResumeSummary[];
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  setCurrent: (r: Resume) => void;
  setAvailable: (s: ResumeSummary[]) => void;
  setDoc: (doc: Resume["doc"]) => void;
  setMeta: (patch: Partial<Resume>) => void;
  setSaveStatus: (s: SaveStatus) => void;
  markSaved: () => void;
}

export const useResumeEditorStore = create<ResumeEditorStore>((set) => ({
  current: null,
  available: [],
  saveStatus: "idle",
  lastSavedAt: null,
  setCurrent: (r) => set({ current: r, saveStatus: "saved", lastSavedAt: r.updated_at }),
  setAvailable: (s) => set({ available: s }),
  setDoc: (doc) =>
    set((s) => (s.current ? { current: { ...s.current, doc } } : {})),
  setMeta: (patch) =>
    set((s) => (s.current ? { current: { ...s.current, ...patch } } : {})),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  markSaved: () => set({ saveStatus: "saved", lastSavedAt: Date.now() }),
}));
