"use client";

import { useResumeStore } from "@/stores/resume";
import { LandingHero } from "@/components/landing/LandingHero";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/components/dashboard/Dashboard";

export default function Home() {
  const hasResume = useResumeStore((s) => !!s.resumeData);

  // TODO: remove this bypass — temporary for design preview
  const forceDesign = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dashboard");

  if (!hasResume && !forceDesign) {
    return <LandingHero />;
  }

  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
