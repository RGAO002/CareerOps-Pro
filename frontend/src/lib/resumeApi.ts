// frontend/src/lib/resumeApi.ts
"use client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type SnapshotTrigger = "auto" | "manual_save" | "ai_edit" | "checkpoint";

export interface ResumeSummary {
  id: string;
  title: string;
  parent_id: string | null;
  is_base: boolean;
  target_company: string | null;
  target_role: string | null;
  updated_at: number;
}

export interface Resume extends ResumeSummary {
  user_id: string;
  schema_version: number;
  created_at: number;
  target_company_domain: string | null;
  is_user_consented_for_benchmark: boolean;
  doc: { type: "doc"; content: unknown[] };
}

export interface ResumeSnapshot {
  id: string;
  resume_id: string;
  created_at: number;
  trigger: SnapshotTrigger;
  label: string | null;
  ai_message_id: string | null;
  diff_summary: string | null;
  doc: { type: "doc"; content: unknown[] };
}

async function _json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${text || resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

export const resumeApi = {
  list: () =>
    fetch(`${API_BASE}/api/resume/`).then((r) => _json<{ resumes: ResumeSummary[] }>(r)),

  get: (id: string) => fetch(`${API_BASE}/api/resume/${id}`).then((r) => _json<Resume>(r)),

  upsert: (resume: Resume) =>
    fetch(`${API_BASE}/api/resume/${resume.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resume),
    }).then((r) => _json<Resume>(r)),

  createBlank: (title: string) =>
    fetch(`${API_BASE}/api/resume/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).then((r) => _json<Resume>(r)),

  parsePdf: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${API_BASE}/api/resume/parse`, { method: "POST", body: fd }).then((r) =>
      _json<Resume>(r),
    );
  },

  createVariant: (
    parentId: string,
    body: { title: string; target_company?: string; target_role?: string },
  ) =>
    fetch(`${API_BASE}/api/resume/${parentId}/variant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => _json<Resume>(r)),

  createSnapshot: (
    id: string,
    body: {
      trigger?: SnapshotTrigger;
      label?: string;
      diff_summary?: string;
      ai_message_id?: string;
    },
  ) =>
    fetch(`${API_BASE}/api/resume/${id}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => _json<ResumeSnapshot>(r)),

  listSnapshots: (id: string) =>
    fetch(`${API_BASE}/api/resume/${id}/snapshots`).then((r) =>
      _json<{ snapshots: ResumeSnapshot[] }>(r),
    ),

  restore: (id: string, snapshotId: string) =>
    fetch(`${API_BASE}/api/resume/${id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot_id: snapshotId }),
    }).then((r) => _json<Resume>(r)),

  rewriteBullet: (
    id: string,
    body: { bullet_text: string; preset: string; custom_instructions?: string },
  ) =>
    fetch(`${API_BASE}/api/resume/${id}/ai/rewrite-bullet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => _json<{ rewritten: string }>(r)),
};
