'use client';
import { ResumeDocumentCanvas } from './ResumeDocumentCanvas';
import { getTemplate } from './templates/registry';
import type { ResumeDoc } from './types';

interface Props {
  resume: ResumeDoc;
}

export function PrintCanvasClient({ resume }: Props) {
  const template = getTemplate(resume.template_id);
  return <ResumeDocumentCanvas resume={resume} template={template} mode="export" />;
}
