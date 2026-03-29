"use client";

import { useResumeStore } from "@/stores/resume";
import { LandingHero } from "@/components/landing/LandingHero";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/components/dashboard/Dashboard";

export default function Home() {
  const hasResume = useResumeStore((s) => !!s.resumeData);

  if (!hasResume) {
    return <LandingHero />;
  }

  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
