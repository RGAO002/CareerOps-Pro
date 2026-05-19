import type { TrackerStatus } from "@/components/tracker/MiniDoc";

export interface BoardRow {
  id: string;
  company: string;
  title: string;
  location: string | null;
  salary_range: string | null;
  status: string;
  apply_url: string | null;
  match_score: number | null;
  has_tailored_resume: boolean;
  created_at: string;
  updated_at: string;
  source?: string;
}

export interface BoardResponse {
  jobs: BoardRow[];
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchTrackerBoard(resumeId?: string): Promise<BoardResponse> {
  const url = resumeId
    ? `${BASE}/api/tracker/board?resume_id=${resumeId}`
    : `${BASE}/api/tracker/board`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tracker/board: ${res.status}`);
  return res.json();
}

export async function updateTrackerStatus(jobId: string, status: TrackerStatus): Promise<void> {
  const backendStatus = UI_TO_BACKEND[status];
  const res = await fetch(`${BASE}/api/tracker/status/${jobId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: backendStatus }),
  });
  if (!res.ok) throw new Error(`tracker/status: ${res.status}`);
}

const BACKEND_TO_UI: Record<string, TrackerStatus> = {
  to_tailor:    "saved",
  tailored:     "saved",
  to_apply:     "saved",
  applied:      "applied",
  interviewing: "interview",
  offer:        "offer",
  rejected:     "rejected",
};

const UI_TO_BACKEND: Record<TrackerStatus, string> = {
  saved:     "to_apply",
  applied:   "applied",
  interview: "interviewing",
  offer:     "offer",
  rejected:  "rejected",
};

export function backendStatusToUI(s: string): TrackerStatus {
  return (BACKEND_TO_UI[s] as TrackerStatus) ?? "saved";
}
