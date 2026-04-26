// frontend/src/app/resume/[id]/print/page.tsx
//
// Headless-Chromium prints THIS route to PDF. Single render path: this view
// uses the SAME TipTap editor + CSS the user sees in the editor, just in
// editable=false mode with chrome hidden. Whatever you see in the editor
// canvas is what goes into the PDF — same fonts, same layout, same metrics.
import { PrintCanvasClient } from "./PrintCanvasClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PrintPage({ params }: PageProps) {
  const { id } = await params;
  return <PrintCanvasClient id={id} />;
}
