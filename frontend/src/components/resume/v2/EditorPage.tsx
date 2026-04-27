'use client';
import { useEffect, useState } from 'react';
import { ResumeDocumentCanvas } from './ResumeDocumentCanvas';
import { EditorTopBar } from './EditorTopBar';
import { useResumeStore } from './store/useResumeStore';
import { setSaveBackend, defaultBackendSave, startAutoSave } from './store/flush-save';
import { installKeyboardRouter } from './interaction/keyboard-router';
import { getTemplate } from './templates/registry';
import type { ResumeDoc } from './types';

interface Props {
  initialResume: ResumeDoc;
}

export function EditorPage({ initialResume }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [hideInteraction, setHideInteraction] = useState(false);
  const resume = useResumeStore(s => s.resume);

  useEffect(() => {
    useResumeStore.getState().hydrate(initialResume);
    setSaveBackend(defaultBackendSave);
    const stopSave = startAutoSave();
    const stopKbd = installKeyboardRouter();
    // Detect ?hideInteractionLayer=1 URL query (used by e2e tests).
    // Read from window.location to avoid Next's useSearchParams Suspense requirement.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setHideInteraction(params.get('hideInteractionLayer') === '1');
    }
    setHydrated(true);
    return () => { stopSave(); stopKbd(); };
  }, [initialResume]);

  if (!hydrated || !resume) return <div style={{ padding: 24 }}>Loading…</div>;
  const template = getTemplate(resume.template_id);

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <EditorTopBar resumeId={resume.id} pageCount={1} />
      <div style={{ padding: '24px 0' }}>
        <ResumeDocumentCanvas
          resume={resume}
          template={template}
          mode="edit"
          hideInteractionLayer={hideInteraction}
        />
      </div>
    </div>
  );
}
