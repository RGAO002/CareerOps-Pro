// frontend/src/stores/resumeEditor.ts
import { create } from "zustand";
import type { ResumeDoc, ResumeMeta } from "@/components/resume/types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ResumeEditorStore {
  meta: ResumeMeta | null;
  doc: ResumeDoc | null;
  saveStatus: SaveStatus;
  setAll: (meta: ResumeMeta, doc: ResumeDoc) => void;
  setDoc: (doc: ResumeDoc) => void;
  setSaveStatus: (s: SaveStatus) => void;
}

export const useResumeEditorStore = create<ResumeEditorStore>((set) => ({
  meta: null,
  doc: null,
  saveStatus: "idle",
  setAll: (meta, doc) => set({ meta, doc, saveStatus: "idle" }),
  setDoc: (doc) => set({ doc }),
  setSaveStatus: (s) => set({ saveStatus: s }),
}));
