'use client';

import * as React from 'react';
import { PrintCanvasV3 } from './PrintCanvasV3';
import { type ResumeFileV3, v3FileToEditorBody } from './schema/v3Envelope';

interface Props {
  resume: ResumeFileV3;
  /** Template selected at print time. Provided by the server component
   * (which reads `?template=` from searchParams) so SSR + client first
   * render agree — no hydration mismatch and no PaginationPlugin
   * "measure with minimal then re-flow with fullstack" race that would
   * leave the PDF using stale geometry. */
  templateId?: 'minimal' | 'fullstack';
}

export function PrintCanvasClientV3({ resume, templateId = 'minimal' }: Props) {
  const doc = React.useMemo(() => v3FileToEditorBody(resume), [resume]);
  return <PrintCanvasV3 doc={doc} templateId={templateId} />;
}
