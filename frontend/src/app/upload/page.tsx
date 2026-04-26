// frontend/src/app/upload/page.tsx
"use client";

import { AppShell } from "@/components/layout/AppShell";
import { PdfUploader } from "@/components/upload/PdfUploader";

export default function UploadPage() {
  return (
    <AppShell>
      <div className="mx-auto mt-12 max-w-2xl px-4">
        <h1 className="mb-2 text-xl font-semibold text-neutral-900">
          Import a resume
        </h1>
        <p className="mb-6 text-sm text-neutral-600">
          Upload your PDF and we'll parse it into the editor. You can review and edit
          everything afterwards.
        </p>
        <PdfUploader />
      </div>
    </AppShell>
  );
}
