import type {
  ResumeData,
  AnalysisResult,
  JobMatchResult,
  JobMatch,
  SessionMeta,
  MatchPreferences,
  MatchResponse,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ─── helpers ─── */

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/* ─── resume v3 ─── */

export async function parseResumeFile(
  file: File,
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/api/resume/parse`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function matchJobsForResume(
  resumeId: string,
  preferences?: MatchPreferences,
  topK?: number,
): Promise<MatchResponse> {
  return post<MatchResponse>("/api/jobs/match", {
    resume_id: resumeId,
    preferences,
    top_k: topK,
  });
}

/* ─── legacy resume ─── */

export async function uploadResume(
  file: File,
  model: string,
  apiKey: string,
): Promise<{ data: ResumeData; raw_text: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("model", model);
  form.append("api_key", apiKey);

  const res = await fetch(`${API}/api/resume/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function analyzeResume(
  resumeData: ResumeData,
  model: string,
  apiKey: string,
): Promise<AnalysisResult> {
  const result = await post<{ success: boolean; analysis: AnalysisResult }>(
    "/api/resume/analyze",
    { resume_data: resumeData, model, api_key: apiKey },
  );
  return result.analysis;
}

export async function matchJobs(
  resumeData: ResumeData,
  model: string,
  apiKey: string,
): Promise<JobMatchResult> {
  return post<JobMatchResult>("/api/resume/match", {
    resume_data: resumeData,
    model,
    api_key: apiKey,
  });
}

export async function parseCustomJD(
  input: string,
  resumeData: ResumeData,
  model: string,
  apiKey: string,
): Promise<JobMatch> {
  const result = await post<{ success: boolean; job: JobMatch }>(
    "/api/resume/parse-jd",
    { input, resume_data: resumeData, model, api_key: apiKey },
  );
  return result.job;
}

/* ─── sessions ─── */

export async function fetchSessions(): Promise<SessionMeta[]> {
  const result = await get<{ sessions: SessionMeta[] }>(
    "/api/resume/sessions",
  );
  return result.sessions;
}
