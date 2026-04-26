// frontend/src/app/resume/[id]/page.tsx
import { AppShell } from "@/components/layout/AppShell";
import dynamic from "next/dynamic";

const ResumeEditor = dynamic(
  () => import("@/components/resume/ResumeEditor").then((m) => m.ResumeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center text-neutral-400">
        Loading editor…
      </div>
    ),
  },
);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResumeEditorPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <AppShell>
      <ResumeEditor id={id} />
    </AppShell>
  );
}
