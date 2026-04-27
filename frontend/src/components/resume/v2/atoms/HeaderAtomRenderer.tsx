// frontend/src/components/resume/v2/atoms/HeaderAtomRenderer.tsx
'use client';
import { PlainTextField } from '../fields/PlainTextField';
import { ContactLinesField } from '../fields/ContactLinesField';
import type { CanvasMode, HeaderBlock } from '../types';

interface Props {
  header: HeaderBlock;
  mode: CanvasMode;
}

export function HeaderAtomRenderer({ header, mode }: Props) {
  return (
    <div className="resume-header" data-block-id={header.id} data-atom-content>
      <PlainTextField
        fieldKey={{ kind: 'header.name' }}
        value={header.name}
        mode={mode}
        className="resume-name"
        placeholder="Your name"
      />
      <ContactLinesField index={0} items={header.contact_lines} mode={mode} />
    </div>
  );
}
