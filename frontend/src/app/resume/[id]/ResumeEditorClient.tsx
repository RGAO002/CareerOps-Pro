// frontend/src/app/resume/[id]/ResumeEditorClient.tsx
"use client";

import dynamic from "next/dynamic";

// Dynamic import with ssr:false MUST live inside a Client Component
// (Next.js 16 App Router restriction). The page.tsx Server Component
// imports this wrapper instead of calling next/dynamic directly.
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

export function ResumeEditorClient({ id }: { id: string }) {
  return <ResumeEditor id={id} />;
}
