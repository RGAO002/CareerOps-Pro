import { create } from "zustand";

interface ResumeState {
  resumeData: Record<string, unknown> | null;
  pdfFilename: string | null;
  analysisResult: Record<string, unknown> | null;
  jobMatchResult: Record<string, unknown> | null;

  parsing: boolean;
  analyzing: boolean;
  matching: boolean;

  setResumeData: (data: Record<string, unknown>, filename: string) => void;
  setAnalysis: (result: Record<string, unknown>) => void;
  setJobMatchResult: (result: Record<string, unknown>) => void;

  setParsing: (v: boolean) => void;
  setAnalyzing: (v: boolean) => void;
  setMatching: (v: boolean) => void;
}

export const useResumeStore = create<ResumeState>((set) => ({
  resumeData: null,
  pdfFilename: null,
  analysisResult: null,
  jobMatchResult: null,

  parsing: false,
  analyzing: false,
  matching: false,

  setResumeData: (data, filename) =>
    set({ resumeData: data, pdfFilename: filename }),
  setAnalysis: (analysisResult) => set({ analysisResult }),
  setJobMatchResult: (jobMatchResult) => set({ jobMatchResult }),

  setParsing: (parsing) => set({ parsing }),
  setAnalyzing: (analyzing) => set({ analyzing }),
  setMatching: (matching) => set({ matching }),
}));
