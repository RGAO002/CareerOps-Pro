// frontend/src/components/resume/v2/atoms/HeaderAtomRenderer.tsx
'use client';
import { PlainTextField } from '../fields/PlainTextField';
import { ContactLinesField } from '../fields/ContactLinesField';
import { useResumeStore } from '../store/useResumeStore';
import type { Align } from '../fields/single-line-adapter';
import type { CanvasMode, HeaderBlock } from '../types';

interface Props {
  header: HeaderBlock;
  mode: CanvasMode;
}

export function HeaderAtomRenderer({ header, mode }: Props) {
  const nameAlign = useResumeStore(s => s.resume?.alignments?.['header.name']) as Align | undefined;
  const contactAlign = useResumeStore(s => s.resume?.alignments?.['header.contact:0']) as Align | undefined;
  return (
    <div className="resume-header" data-block-id={header.id} data-atom-content>
      <PlainTextField
        fieldKey={{ kind: 'header.name' }}
        value={header.name}
        align={nameAlign}
        mode={mode}
        className="resume-name"
        placeholder="Your name"
      />
      <ContactLinesField index={0} items={header.contact_lines} align={contactAlign} mode={mode} />
    </div>
  );
}
