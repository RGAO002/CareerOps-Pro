'use client';
import { useEffect, useState } from 'react';
import { ResumeDocumentCanvas } from './ResumeDocumentCanvas';
import { getTemplate } from './templates/registry';
import { useResumeStore } from './store/useResumeStore';
import type { ResumeDoc } from './types';

interface Props {
  resume: ResumeDoc;
}

export function PrintCanvasClient({ resume }: Props) {
  // Hydrate the store so renderers (HeaderAtomRenderer, EntryAtomRenderer,
  // SectionHeadingAtomRenderer) can read `alignments[...]` via selector. Without
  // this, print/export reads undefined and renders left-aligned even when the
  // resume has center/right alignments saved.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    useResumeStore.getState().hydrate(resume);
    setHydrated(true);
  }, [resume]);

  const template = getTemplate(resume.template_id);
  if (!hydrated) return null;
  return <ResumeDocumentCanvas resume={resume} template={template} mode="export" />;
}
