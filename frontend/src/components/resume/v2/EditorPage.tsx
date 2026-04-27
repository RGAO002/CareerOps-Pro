'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
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
  const [pageCount, setPageCount] = useState(1);
  const resume = useResumeStore(s => s.resume);

  useEffect(() => {
    useResumeStore.getState().hydrate(initialResume);
    setSaveBackend(defaultBackendSave);
    const stopSave = startAutoSave();
    const stopKbd = installKeyboardRouter();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setHideInteraction(params.get('hideInteractionLayer') === '1');
    }
    setHydrated(true);
    return () => { stopSave(); stopKbd(); };
  }, [initialResume]);

  if (!hydrated || !resume) {
    return (
      <AppShell>
        <div className="p-6 text-neutral-500">Loading editor…</div>
      </AppShell>
    );
  }
  const template = getTemplate(resume.template_id);

  return (
    <AppShell>
      <EditorTopBar resumeId={resume.id} pageCount={pageCount} />
      <div className="bg-neutral-100 py-6">
        <ResumeDocumentCanvas
          resume={resume}
          template={template}
          mode="edit"
          hideInteractionLayer={hideInteraction}
          onPageCountChange={setPageCount}
        />
      </div>
    </AppShell>
  );
}
