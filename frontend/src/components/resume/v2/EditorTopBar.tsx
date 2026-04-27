'use client';
import { useState } from 'react';
import { flushSave } from './store/flush-save';
import { useResumeStore } from './store/useResumeStore';

interface Props {
  resumeId: string;
  pageCount: number;
}

export function EditorTopBar({ resumeId, pageCount }: Props) {
  const [exporting, setExporting] = useState(false);
  const _resume = useResumeStore(s => s.resume);   // subscribe so topbar re-renders on changes (silenced by underscore)
  void _resume;

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      await flushSave();
      window.location.href = `/api/resume/${encodeURIComponent(resumeId)}/pdf`;
    } catch (e) {
      alert(`Couldn't save before export: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      data-edit-only
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 16px', background: 'rgba(255,255,255,0.95)',
        borderBottom: '1px solid #e5e7eb', backdropFilter: 'blur(8px)',
      }}
    >
      <span style={{ fontSize: 12, color: '#666' }}>
        Page <strong>{pageCount}</strong> of <strong>{pageCount}</strong>
      </span>
      {pageCount > 2 && (
        <span style={{ fontSize: 12, color: '#dc2626' }}>
          ⚠ Resume is {pageCount} pages (recommended ≤ 2)
        </span>
      )}
      <div style={{ flex: 1 }} />
      <button
        onClick={handleExport}
        disabled={exporting}
        style={{
          padding: '6px 14px', borderRadius: 6,
          background: '#111', color: 'white', fontSize: 13, fontWeight: 500,
          border: 0, cursor: exporting ? 'wait' : 'pointer',
        }}
      >
        {exporting ? 'Saving…' : 'Export PDF'}
      </button>
    </div>
  );
}
