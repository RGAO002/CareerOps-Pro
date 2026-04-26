// frontend/src/components/upload/PdfUploader.tsx
"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { resumeApi } from "@/lib/resumeApi";

export function PdfUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("PDF too large (max 10 MB).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await resumeApi.parsePdf(file);
      router.push(`/resume/${r.id}?just_imported=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex w-full flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-colors ${
        dragOver ? "border-blue-400 bg-blue-50" : "border-neutral-300 bg-white"
      }`}
    >
      {busy ? (
        <>
          <Loader2 className="size-8 animate-spin text-neutral-400" />
          <div className="text-sm text-neutral-600">Parsing your resume…</div>
        </>
      ) : (
        <>
          <Upload className="size-8 text-neutral-400" />
          <div className="text-center">
            <div className="text-sm font-medium text-neutral-900">
              Drop a PDF here, or
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="ml-1 text-blue-600 underline"
              >
                browse
              </button>
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Max 10 MB · text-based PDFs only (scanned PDFs not yet supported)
            </div>
          </div>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}
