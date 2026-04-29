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

/** Resolve a TipTap field key (e.g. `bullet.content:abc123`) to the block id
 *  that field belongs to. Header rows aren't selectable blocks → null. */
function blockIdForFieldKey(key: string): string | null {
  const colon = key.indexOf(':');
  if (colon < 0) return null;
  const kind = key.slice(0, colon);
  const id = key.slice(colon + 1);
  if (kind === 'section.heading') return id;
  if (kind === 'entry.title' || kind === 'entry.meta') return id;
  if (kind === 'bullet.content') return id;
  return null; // header.name / header.contact:N — no block-level selection
}

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

    // Sync block selection to TipTap focus: whenever the user enters any
    // text field (mouse click, Tab, programmatic focus), set selectionManager
    // to the parent block of that field. This is what makes "Cmd+A while
    // typing" work — by the time the user presses Cmd+A, the section the
    // cursor is in is already the selected block.
    const stopFocusClear = atomFocusManager.subscribe(() => {
      const ed = atomFocusManager.currentEditor();
      if (!ed) {
        selectionManager.notifyTipTapFocus();
        return;
      }
      const key = atomFocusManager.currentFieldKey();
      if (!key) {
        selectionManager.notifyTipTapFocus();
        return;
      }
      const blockId = blockIdForFieldKey(key);
      if (blockId) {
        selectionManager.selectSingleBlock(blockId);
      }
      selectionManager.notifyTipTapFocus();
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
