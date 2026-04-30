// frontend/src/components/resume/PreviewPDFModal.tsx
"use client";

import { Download, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  resumeId: string;
  onClose: () => void;
}

/**
 * "Preview" modal — iframes the /resume/:id/print route, which uses Paged.js
 * to paginate the resume into multiple page cards. The same /print route is
 * what Playwright loads to generate the exported PDF, so what the user sees
 * in this preview matches the downloaded PDF — same paged.polyfill.js
 * render, same DOM, same pages, same metrics.
 */
export function PreviewPDFModal({ resumeId, onClose }: Props) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [printUrl, setPrintUrl] = useState<string | null>(null);

  useEffect(() => {
    // Each open uses a fresh URL (timestamp) so a re-open after edits
    // shows the freshest pagination.
    setPrintUrl(`/resume/${resumeId}/print?_=${Date.now()}`);
  }, [resumeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-neutral-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-neutral-900">Preview</h2>
        <div className="flex items-center gap-2">
          <a
            href={`${apiBase}/api/resume/${resumeId}/pdf`}
            download
            className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
          >
            <Download className="size-3.5" />
            Download PDF
          </a>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-neutral-100"
            aria-label="Close preview"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 bg-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Paginating…
          </div>
        )}
        {printUrl != null && (
          <iframe
            key={printUrl}
            src={printUrl}
            title="Paged.js preview"
            className="absolute inset-0 h-full w-full border-0"
            onLoad={() => setIframeLoaded(true)}
          />
        )}
      </div>
    </div>
  );
}
