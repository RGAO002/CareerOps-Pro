// frontend/src/app/resume/[id]/page.tsx
import { AppShell } from "@/components/layout/AppShell";

import { ResumeEditorClient } from "./ResumeEditorClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResumeEditorPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <AppShell>
      <ResumeEditorClient id={id} />
    </AppShell>
  );
}
