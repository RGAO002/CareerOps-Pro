'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { flushSave, getSaveStatus, subscribeSaveStatus, type SaveStatus } from './store/flush-save';
import { useResumeStore } from './store/useResumeStore';
import { FormatToolbar } from './interaction/FormatToolbar';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

interface Props {
  resumeId: string;
  pageCount: number;
}

export function EditorTopBar({ resumeId, pageCount }: Props) {
  const [exporting, setExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(getSaveStatus());
  const title = useResumeStore(s => s.resume?.title ?? '');
  const targetCompany = useResumeStore(s => s.resume?.metadata.target_company ?? null);
  const targetRole = useResumeStore(s => s.resume?.metadata.target_role ?? null);

  useEffect(() => subscribeSaveStatus(setSaveStatus), []);

  const tailoringLabel =
    targetCompany && targetRole
      ? `${targetCompany} · ${targetRole}`
      : targetCompany
        ? targetCompany
        : null;

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      await flushSave();
      window.location.href = `${API_BASE}/api/resume/${encodeURIComponent(resumeId)}/pdf`;
    } catch (e) {
      alert(`Couldn't save before export: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      data-edit-only
      className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur-md"
    >
      <span className="truncate text-sm font-medium text-neutral-900">{title || 'Untitled Resume'}</span>

      <div className="h-5 w-px bg-neutral-200" />

      <FormatToolbar />

      <div className="flex-1 text-center">
        {tailoringLabel && (
          <>
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">
              Tailoring for
            </span>
            <span className="ml-2 truncate text-sm text-neutral-800">{tailoringLabel}</span>
          </>
        )}
      </div>

      <SaveStatusBadge status={saveStatus} />

      <span className="text-xs text-neutral-500">
        {pageCount === 1 ? '1 page' : `${pageCount} pages`}
      </span>
      {pageCount > 2 && (
        <span className="text-xs text-red-600">⚠ recommended ≤ 2</span>
      )}

      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        title="Download the resume as PDF"
      >
        <Download className="size-3.5" strokeWidth={2} />
        {exporting ? 'Saving…' : 'Export PDF'}
      </button>
    </div>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const dot = (cls: string) => (
    <span className={`mr-1.5 inline-block size-2 rounded-full ${cls}`} aria-hidden />
  );
  if (status === 'saving') {
    return (
      <span className="flex items-center text-[11px] text-neutral-600">
        {dot('animate-pulse bg-blue-500')}Saving…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center text-[11px] text-red-600">
        {dot('bg-red-500')}Save failed
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center text-[11px] text-neutral-500">
        {dot('bg-green-500')}Saved
      </span>
    );
  }
  return null;
}
