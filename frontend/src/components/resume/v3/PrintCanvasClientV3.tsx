'use client';

import * as React from 'react';
import { PrintCanvasV3 } from './PrintCanvasV3';
import { type ResumeFileV3, v3FileToEditorBody } from './schema/v3Envelope';

interface Props {
  resume: ResumeFileV3;
}

function readTemplateFromUrl(): 'minimal' | 'fullstack' {
  if (typeof window === 'undefined') return 'minimal';
  try {
    const t = new URL(window.location.href).searchParams.get('template');
    if (t === 'fullstack') return 'fullstack';
  } catch {}
  return 'minimal';
}

export function PrintCanvasClientV3({ resume }: Props) {
  const doc = React.useMemo(() => v3FileToEditorBody(resume), [resume]);
  // Template is passed via URL query (?template=fullstack) so the editor's
  // selected template propagates to headless-Chromium PDF generation.
  const [templateId] = React.useState<'minimal' | 'fullstack'>(readTemplateFromUrl);
  return <PrintCanvasV3 doc={doc} templateId={templateId} />;
}
