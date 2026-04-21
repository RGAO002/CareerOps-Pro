// frontend/src/app/resume/[id]/page.tsx
import { ResumeEditor } from "@/components/resume/ResumeEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResumeEditorPage({ params }: PageProps) {
  const { id } = await params;
  return <ResumeEditor id={id} />;
}
