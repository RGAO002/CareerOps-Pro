// frontend/src/app/resume/[id]/print/page.tsx
import { PrintView } from "./PrintView";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResumePrintPage({ params }: PageProps) {
  const { id } = await params;
  return <PrintView id={id} />;
}
