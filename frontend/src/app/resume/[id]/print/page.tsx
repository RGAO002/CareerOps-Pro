// frontend/src/app/resume/[id]/print/page.tsx
//
// Headless-Chromium prints THIS route to PDF. We fetch the resume on the
// server so the client component receives v2 data immediately — no client
// loading flicker, faster ready-flag for Playwright.
import { PrintCanvasClient } from "@/components/resume/v2/PrintCanvasClient";
import type { ResumeDoc } from "@/components/resume/v2/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PrintPage({ params }: PageProps) {
  const { id } = await params;
  const resp = await fetch(`${API_BASE}/api/resume/${id}`, {
    cache: "no-store",
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => resp.statusText);
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        Error: failed to load resume ({resp.status}) {detail}
      </div>
    );
  }

  const resume = (await resp.json()) as ResumeDoc;
  return <PrintCanvasClient resume={resume} />;
}
