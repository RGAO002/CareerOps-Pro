/* ─── Resume ─── */

export interface ResumeData {
  id?: string;
  name: string;
  role: string;
  contact: string[];
  skills: Record<string, string>;
  summary: string;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  [key: string]: unknown;
}

export interface ExperienceEntry {
  company: string;
  role: string;
  date: string;
  bullets: string[];
}

export interface ProjectEntry {
  name: string;
  tech: string;
  link: string;
  link_text: string;
  bullets: string[];
}

export interface EducationEntry {
  school: string;
  degree: string;
  date: string;
  gpa: string;
  coursework: string[];
  note: string;
}

export interface Resume {
  id: string;
  name: string;
  role: string;
  filename: string;
  resume_data: ResumeData;
  created_at: string;
  updated_at: string;
}

export interface ResumeListItem {
  id: string;
  name: string;
  role: string;
  filename: string;
  created_at: string;
  updated_at: string;
}

/* ─── Analysis ─── */

export interface AnalysisResult {
  overall_score: number;
  category_scores: Record<string, number>;
  strengths: FeedbackItem[];
  weaknesses: FeedbackItem[];
  quick_wins: string[];
  summary: string;
}

export interface FeedbackItem {
  title: string;
  description: string;
  icon: string;
}

/* ─── Legacy job matching (old API) ─── */

export interface JobMatch {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  requirements: string[];
  type: string;
  work_type: string;
  category: string;
  match_score: number;
  match_reasons: string[];
  gaps: string[];
  tailoring_tips: string[];
  url?: string;
}

export interface JobMatchResult {
  matches: JobMatch[];
  candidate_summary: string;
  recommended_focus: string;
}

/* ─── Sessions ─── */

export interface SessionMeta {
  id: string;
  name: string;
  model: string;
  pdf_filename: string;
  updated_at: string;
  has_resume: boolean;
  has_job: boolean;
  thumbnail?: string;
}

/* ─── Tracker ─── */

export type JobStatus =
  | "to_tailor"
  | "tailored"
  | "to_apply"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected";

export interface TrackerJob {
  id: string;
  resume_id: string | null;
  company: string;
  title: string;
  location: string;
  work_type: string;
  url: string;
  jd_summary: string;
  jd_text: string;
  requirements: string[];
  match_score: number;
  gaps: string[];
  tailoring_tips: string[];
  status: JobStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface TailoredResume {
  id: string;
  job_id: string;
  resume_id: string;
  tailored_data: ResumeData;
  changes_summary: string;
  status: string;
  error?: string;
  created_at: string;
}

export interface BatchProgress {
  status: string;
  total: number;
  completed: number;
  failed: number;
  current_job: string | null;
  results: Record<string, { success: boolean; error?: string; changes?: string }>;
}

export interface DashboardJob extends TrackerJob {
  has_tailored_resume: boolean;
  tailored_resume_id: string | null;
}

export const STATUS_LABELS: Record<JobStatus, string> = {
  to_tailor: "To Tailor",
  tailored: "Tailored",
  to_apply: "To Apply",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

export const STATUS_COLORS: Record<JobStatus, string> = {
  to_tailor: "bg-gray-700 text-gray-300",
  tailored: "bg-blue-900 text-blue-300",
  to_apply: "bg-yellow-900 text-yellow-300",
  applied: "bg-indigo-900 text-indigo-300",
  interviewing: "bg-purple-900 text-purple-300",
  offer: "bg-green-900 text-green-300",
  rejected: "bg-red-900 text-red-300",
};

/* ─── Public jobs ─── */

export type LocationTier =
  | "nyc_core"
  | "nj_close"
  | "ny_suburb"
  | "remote_nyc_hq"
  | "";

export interface PublicCompanySummary {
  id: number;
  slug: string;
  display_name: string;
  industry: string;
  is_bodyshop: boolean;
  h1b_lca_count_1y: number;
  h1b_lca_count_3y: number;
  hq_city: string;
  hq_state: string;
}

export interface PublicJobListItem {
  id: number;
  title: string;
  company: PublicCompanySummary;
  location_raw: string;
  location_tier: LocationTier;
  work_type: string;
  department: string;
  employment_type: string;
  apply_url: string;
  posted_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  description_preview: string;
  source: string;
}

export interface PublicJobDetail extends PublicJobListItem {
  description_html: string;
  description_text: string;
  requirements: string[];
}

export interface PublicJobsResponse {
  total: number;
  offset: number;
  limit: number;
  jobs: PublicJobListItem[];
}

export interface PublicStats {
  total_active_jobs: number;
  total_nyc_jobs: number;
  total_companies: number;
  last_refresh_at: string | null;
  jobs_posted_last_7d: number;
  tier_counts: Record<string, number>;
}

export interface BrowseParams {
  q?: string;
  company_slug?: string;
  location_tier?: LocationTier;
  work_type?: string;
  department?: string;
  posted_within_days?: number;
  min_lca_count?: number;
  include_bodyshops?: boolean;
  limit?: number;
  offset?: number;
}

export const LOCATION_TIER_LABELS: Record<string, string> = {
  nyc_metro: "NYC",
  bay_area:  "Bay Area",
  seattle:   "Seattle",
  boston:    "Boston",
  la_metro:  "LA",
  dc_metro:  "DC",
  austin:    "Austin",
  chicago:   "Chicago",
  denver:    "Denver",
  atlanta:   "Atlanta",
  toronto:   "Toronto",
  vancouver: "Vancouver",
  remote_us: "Remote (US)",
  other_na:  "Other US/Canada",
  other_intl:"International",
  nyc_core: "NYC Core",
  nj_close: "NJ Close",
  ny_suburb: "NY Suburb",
  remote_nyc_hq: "Remote (NYC HQ)",
};

export const LOCATION_TIER_COLORS: Record<string, string> = {
  nyc_metro: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  bay_area:  "bg-orange-900/40 text-orange-300 border-orange-700/50",
  seattle:   "bg-sky-900/40 text-sky-300 border-sky-700/50",
  boston:    "bg-rose-900/40 text-rose-300 border-rose-700/50",
  la_metro:  "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  dc_metro:  "bg-blue-900/40 text-blue-300 border-blue-700/50",
  austin:    "bg-fuchsia-900/40 text-fuchsia-300 border-fuchsia-700/50",
  chicago:   "bg-cyan-900/40 text-cyan-300 border-cyan-700/50",
  denver:    "bg-lime-900/40 text-lime-300 border-lime-700/50",
  atlanta:   "bg-pink-900/40 text-pink-300 border-pink-700/50",
  toronto:   "bg-indigo-900/40 text-indigo-300 border-indigo-700/50",
  vancouver: "bg-teal-900/40 text-teal-300 border-teal-700/50",
  remote_us: "bg-amber-900/40 text-amber-300 border-amber-700/50",
  other_na:  "bg-zinc-800/60 text-zinc-300 border-zinc-700/50",
  other_intl:"bg-zinc-800/60 text-zinc-500 border-zinc-700/50",
  nyc_core: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  nj_close: "bg-sky-900/40 text-sky-300 border-sky-700/50",
  ny_suburb: "bg-violet-900/40 text-violet-300 border-violet-700/50",
  remote_nyc_hq: "bg-amber-900/40 text-amber-300 border-amber-700/50",
};

/* ─── Matching ─── */

export interface MatchPreferences {
  levels?: string[];
  location_tiers?: string[];
  work_types?: string[];
  needs_sponsorship?: boolean;
  only_with_jd?: boolean;
  exclude_companies?: string[];
}

export interface MatchScoreParts {
  cosine: number;
  skill: number;
  sponsor: number;
  recency: number;
}

export interface MatchResultItem {
  id: number;
  title: string;
  company: string;
  industry: string;
  location: string;
  location_tier: string;
  level: string;
  work_type: string;
  sponsorship_signal: string;
  apply_url: string;
  posted_at: string | null;
  h1b_lca_count_3y: number;
  uscis_h1b_approvals_3y: number;
  uscis_h1b_approvals_1y: number;
  has_jd: boolean;
  score: number;
  score_parts: MatchScoreParts;
  reasons: string[];
}

export interface MatchResponse {
  results: MatchResultItem[];
  pool_size: number;
}

export const SPONSORSHIP_LABELS: Record<string, string> = {
  friendly: "Sponsors H-1B",
  company_history: "H-1B history",
  unfriendly: "No sponsorship",
  "": "Sponsor unverified",
};

export const SPONSORSHIP_COLORS: Record<string, string> = {
  friendly: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  company_history: "bg-teal-900/40 text-teal-300 border-teal-700/50",
  unfriendly: "bg-rose-900/40 text-rose-300 border-rose-700/50",
  "": "bg-zinc-800/60 text-zinc-400 border-zinc-700/50",
};

export const LEVEL_LABELS: Record<string, string> = {
  intern: "Intern",
  new_grad: "New Grad",
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
};

/* ─── People Search ─── */

export interface PeopleSearchEvidence {
  source: string;
  url: string;
  title: string;
  snippet: string;
}

export interface PeopleSearchCandidate {
  name: string;
  headline: string | null;
  confidence: number;
  reasoning: string;
  profile_links: Record<string, string>;
  emails: string[];
  evidence: PeopleSearchEvidence[];
}

export interface PeopleSearchParsed {
  gender: string | null;
  age_min: number | null;
  age_max: number | null;
  schools: string[];
  employers_past: string[];
  employers_current: string[];
  roles: string[];
  location_hints: string[];
  keywords: string[];
  raw_query: string;
}

export interface PeopleSearchResponse {
  query: string;
  parsed: PeopleSearchParsed;
  candidates: PeopleSearchCandidate[];
  stats: Record<string, unknown>;
}
