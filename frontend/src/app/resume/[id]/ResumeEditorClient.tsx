// frontend/src/app/resume/[id]/ResumeEditorClient.tsx
//
// DEPRECATED (v2 cutover, 2026-04-26): no longer imported by any route.
// app/resume/[id]/page.tsx now imports EditorPage from v2/ directly.
// This file (and ResumeEditor.tsx + AIRewriteBulletPopover.tsx) is kept
// for 1-week rollback fallback per spec § 7.5, then deletable in a
// separate cleanup commit. AIRewriteBulletPopover is wired to v1 TipTap
// schema; rebuilding it on v2 schema is deferred to v2.1.
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
