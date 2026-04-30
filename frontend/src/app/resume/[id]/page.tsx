// frontend/src/app/resume/[id]/page.tsx
//
// Resume Editor v3 entry point. Server-fetches the current API doc and hands
// it to the client v3 editor bridge so the editor mounts with data immediately.
import { EditorPageV3 } from "@/components/resume/v3/EditorPageV3";
import type { ResumeDoc } from "@/components/resume/v2/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

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
  return <EditorPageV3 initialResume={resume} />;
}
