/* ─── Resume ─── */

export interface ResumeData {
  name: string;
  role: string;
  contact: string[];
  skills: Record<string, string>;
  summary: string;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
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

/* ─── Job matching ─── */

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
