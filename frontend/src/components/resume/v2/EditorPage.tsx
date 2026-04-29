'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ResumeDocumentCanvas } from './ResumeDocumentCanvas';
import { EditorTopBar } from './EditorTopBar';
import { useResumeStore } from './store/useResumeStore';
import { setSaveBackend, defaultBackendSave, startAutoSave } from './store/flush-save';
import { installKeyboardRouter } from './interaction/keyboard-router';
import { atomFocusManager } from './interaction/AtomFocusManager';
import { selectionManager } from './interaction/SelectionManager';
import { getTemplate } from './templates/registry';
import type { ResumeDoc } from './types';
import { usePageContext } from '@/hooks/usePageContext';
import { useAssistantStore } from '@/stores/assistant';
import { useSuggestionStore } from '@/stores/aiSuggestion';

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

    // Clear block selection whenever the user clicks into a TipTap field —
    // otherwise an old block selection (e.g. from clicking ⋮⋮) persists and
    // a Backspace inside a focused heading would route to deleteSelectedBlocks
    // and obliterate the section.
    const stopFocusClear = atomFocusManager.subscribe(() => {
      if (atomFocusManager.currentEditor()) {
        selectionManager.notifyTipTapFocus();
      }
    });

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setHideInteraction(params.get('hideInteractionLayer') === '1');
    }
    setHydrated(true);
    return () => { stopSave(); stopKbd(); stopFocusClear(); };
  }, [initialResume]);

  // Register page context for the global AI panel:
  usePageContext({
    page: 'resume_editor',
    summary: resume
      ? `正在编辑「${resume.title || '未命名'}」简历，目标 ${resume.metadata?.target_company ?? resume.metadata?.target_role ?? '未指定'}`
      : '加载中…',
    data: resume ? { resumeId: resume.id, title: resume.title } : undefined,
  });

  // Hydrate suggestions when resume changes:
  useEffect(() => {
    if (resume) useSuggestionStore.getState().hydrate(resume.id);
  }, [resume?.id]);

  // Add a body class while sidebar pose is active so globals.css can reflow / overlay.
  useEffect(() => {
    const unsub = useAssistantStore.subscribe((s) => {
      const open = s.pose === 'sidebar';
      document.body.classList.toggle('ai-sidebar-open', open);
    });
    return () => { unsub(); document.body.classList.remove('ai-sidebar-open'); };
  }, []);

  if (!hydrated || !resume) {
    return (
      <AppShell>
        <div className="p-6 text-neutral-500">Loading editor…</div>
      </AppShell>
    );
  }
  const template = getTemplate(resume.template_id);

  return (
    <>
      <AppShell>
        <EditorTopBar resumeId={resume.id} pageCount={pageCount} />
        <div className="bg-neutral-100 py-6 ai-host-reflow">
          <ResumeDocumentCanvas
            resume={resume}
            template={template}
            mode="edit"
            hideInteractionLayer={hideInteraction}
            onPageCountChange={setPageCount}
          />
        </div>
      </AppShell>
      {/* <AISidebar /> moved to global <Assistant /> mount in AppShell. */}
    </>
  );
}
