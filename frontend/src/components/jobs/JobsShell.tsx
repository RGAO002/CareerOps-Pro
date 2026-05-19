"use client";

import { JobStackPage } from "./JobStackPage";

interface Props { animateIn: boolean; resumeId: string | null; }

export function JobsShell({ animateIn, resumeId }: Props) {
  return (
    <div className="h-screen overflow-hidden">
      <JobStackPage animateIn={animateIn} resumeId={resumeId} />
    </div>
  );
}
