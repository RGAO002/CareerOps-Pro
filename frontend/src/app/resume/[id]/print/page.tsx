// frontend/src/app/resume/[id]/print/page.tsx
//
// Headless-Chromium prints THIS route to PDF. We fetch the resume on the
// server so the client component receives v3 data immediately — no client
// loading flicker, faster ready-flag for Playwright.
//
// `template` query param is read SERVER-SIDE and passed as a prop so the
// PrintCanvasV3 canvas root receives the correct template class on its
// first render (no SSR/hydration mismatch). PaginationPlugin then measures
// against the final styled layout, not against minimal then re-flowing.
import { PrintCanvasClientV3 } from "@/components/resume/v3/PrintCanvasClientV3";
import type { ResumeFileV3 } from "@/components/resume/v3/schema/v3Envelope";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ template?: string }>;
}

export default async function PrintPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const templateParam = sp.template === 'fullstack' ? 'fullstack' : 'minimal';
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

  const resume = (await resp.json()) as ResumeFileV3;
  return <PrintCanvasClientV3 resume={resume} templateId={templateParam} />;
}
