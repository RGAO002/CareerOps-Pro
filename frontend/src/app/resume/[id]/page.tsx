// frontend/src/app/resume/[id]/page.tsx
//
// Resume Editor v2 entry point. Server-fetches the v2-shaped doc and hands
// it to the client EditorPage so the editor mounts with data immediately.
import { EditorPage } from "@/components/resume/v2/EditorPage";
import type { ResumeDoc } from "@/components/resume/v2/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResumeEditorPage({ params }: PageProps) {
  const { id } = await params;
  const resp = await fetch(`${API_BASE}/api/resume/${id}`, {
    cache: "no-store",
  });
  if (!resp.ok) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        Failed to load resume ({resp.status})
      </div>
    );
  }
  const resume = (await resp.json()) as ResumeDoc;
  return <EditorPage initialResume={resume} />;
}
