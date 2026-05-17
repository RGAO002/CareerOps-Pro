import { create } from "zustand";

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  workType: string;
  salary: string;
  matchScore: number;
  agentScores: { recruiter: number; hm: number; coach: number };
  matchReasons: string[];
  gap: string;
  tags: string[];
  tier: "A" | "B" | "C";
}

export type FilterType = "all" | "spons" | "remote" | "strong" | "recent";
export type SortType = "match" | "recent" | "salary";

export const MOCK_SIGNATURE = [
  "Product Design", "8y experience", "Motion · Systems", "Consumer mobile", "iOS depth",
];

const MOCK_JOBS: Job[] = [
  { id: "j1",  title: "Senior PM, Payments",       company: "Stripe",    location: "San Francisco · Hybrid", workType: "hybrid", salary: "$210–260k", matchScore: 94, agentScores: { recruiter: 96, hm: 92, coach: 94 }, matchReasons: ["Payments infrastructure depth", "API ergonomics from Plaid", "Scale: 12k merchants × 4 yrs"], gap: "Settlement protocols not on resume",  tags: ["Sponsors H1B", "Strong fit"], tier: "A" },
  { id: "j2",  title: "Product Manager, Claude",   company: "Anthropic", location: "San Francisco · Hybrid", workType: "hybrid", salary: "$220–280k", matchScore: 91, agentScores: { recruiter: 88, hm: 94, coach: 91 }, matchReasons: ["LLM product experience", "Research adjacency", "Strong writing samples"],              gap: "No published research",              tags: ["Sponsors H1B", "Strong fit"], tier: "A" },
  { id: "j3",  title: "Product Designer, HI",      company: "Apple",     location: "Cupertino · On-site",    workType: "onsite", salary: "$165–215k", matchScore: 88, agentScores: { recruiter: 84, hm: 92, coach: 88 }, matchReasons: ["Motion design lead at Linear", "iOS depth from Folio", "RISD design background"],   gap: "Spatial / visionOS missing",         tags: ["Strong fit"],                 tier: "A" },
  { id: "j4",  title: "Founding Designer, Mobile", company: "Linear",    location: "Remote · Americas",      workType: "remote", salary: "$180–230k", matchScore: 85, agentScores: { recruiter: 80, hm: 88, coach: 87 }, matchReasons: ["Mobile craft signal", "Type & motion concentration", "Tooling fluency"],            gap: "No SwiftUI in resume",               tags: ["Remote OK", "Good fit"],      tier: "A" },
  { id: "j5",  title: "Senior PD, Editor",         company: "Notion",    location: "New York · Hybrid",      workType: "hybrid", salary: "$170–210k", matchScore: 82, agentScores: { recruiter: 78, hm: 84, coach: 84 }, matchReasons: ["Editor canvas at Folio", "Plugin ecosystem", "Editorial tools expertise"],          gap: "No collab/CRDT story",               tags: ["Sponsors H1B", "Good fit"],   tier: "B" },
  { id: "j6",  title: "PM, Frontend Infra",        company: "Vercel",    location: "San Francisco · Remote", workType: "remote", salary: "$200–260k", matchScore: 78, agentScores: { recruiter: 74, hm: 82, coach: 78 }, matchReasons: ["Developer tooling instinct", "React ecosystem", "0→1 launches"],                 gap: "No edge / CDN depth",                tags: ["Remote OK"],                  tier: "B" },
  { id: "j7",  title: "Product Designer, FigJam",  company: "Figma",     location: "New York · Hybrid",      workType: "hybrid", salary: "$160–200k", matchScore: 75, agentScores: { recruiter: 70, hm: 78, coach: 77 }, matchReasons: ["Design systems rebuild", "Cross-functional collab", "Plugin authoring"],         gap: "No collab UX research",              tags: ["Sponsors H1B"],               tier: "B" },
  { id: "j8",  title: "Senior PM, Acquiring",      company: "Block",     location: "San Francisco · Hybrid", workType: "hybrid", salary: "$190–240k", matchScore: 72, agentScores: { recruiter: 78, hm: 68, coach: 70 }, matchReasons: ["Payments operator at Plaid", "Acquiring rate optimization", "SQL fluency"],    gap: "Less consumer-facing recently",      tags: ["Sponsors H1B"],               tier: "B" },
  { id: "j9",  title: "PM, Bill Pay",              company: "Ramp",      location: "NYC · Hybrid",           workType: "hybrid", salary: "$180–220k", matchScore: 68, agentScores: { recruiter: 72, hm: 65, coach: 67 }, matchReasons: ["B2B SaaS background", "Roadmap discipline"],                                     gap: "No accounts payable domain",         tags: ["Worth exploring"],            tier: "C" },
  { id: "j10", title: "Sr. PM, Income",            company: "Plaid",     location: "San Francisco · Hybrid", workType: "hybrid", salary: "$190–235k", matchScore: 66, agentScores: { recruiter: 64, hm: 70, coach: 64 }, matchReasons: ["Alum signal", "Banks API fluency"],                                              gap: "Underwriting/credit unfamiliar",      tags: ["Stretch"],                    tier: "C" },
];

interface JobMatchState {
  resumeId: string | null;
  loading: boolean;
  matches: Job[];
  signature: string[];
  filter: FilterType;
  sort: SortType;
  fetch: (resumeId: string) => Promise<void>;
  setFilter: (f: FilterType) => void;
  setSort: (s: SortType) => void;
}

export const useJobMatchStore = create<JobMatchState>((set) => ({
  resumeId: null,
  loading: false,
  matches: MOCK_JOBS,
  signature: MOCK_SIGNATURE,
  filter: "all",
  sort: "match",
  fetch: async (resumeId) => {
    set({ resumeId, loading: false, matches: MOCK_JOBS, signature: MOCK_SIGNATURE });
  },
  setFilter: (filter) => set({ filter }),
  setSort: (sort) => set({ sort }),
}));
