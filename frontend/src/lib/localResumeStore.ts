// frontend/src/lib/localResumeStore.ts
import type { ResumeDoc, ResumeMeta } from "@/components/resume/types";

const LS_KEY = (id: string) => `careerops-resume-${id}`;

interface StoredPayload {
  meta: ResumeMeta;
  doc: ResumeDoc;
}

export function loadFromLocal(id: string): StoredPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY(id));
    if (!raw) return null;
    return JSON.parse(raw) as StoredPayload;
  } catch {
    return null;
  }
}

export function saveToLocal(id: string, meta: ResumeMeta, doc: ResumeDoc): void {
  if (typeof window === "undefined") return;
  const payload: StoredPayload = {
    meta: { ...meta, updated_at: new Date().toISOString() },
    doc,
  };
  localStorage.setItem(LS_KEY(id), JSON.stringify(payload));
}
