// frontend/src/components/resume/v2/atoms/SectionHeadingAtomRenderer.tsx
'use client';
import { PlainTextField } from '../fields/PlainTextField';
import { useResumeStore } from '../store/useResumeStore';
import type { Align } from '../fields/single-line-adapter';
import type { CanvasMode, SectionBlock } from '../types';

interface Props {
  section: SectionBlock;
  mode: CanvasMode;
}

export function SectionHeadingAtomRenderer({ section, mode }: Props) {
  const align = useResumeStore(
    s => s.resume?.alignments?.[`section.heading:${section.id}`],
  ) as Align | undefined;
  return (
    <div className="resume-section-heading" data-block-id={section.id} data-atom-content>
      <PlainTextField
        fieldKey={{ kind: 'section.heading', id: section.id }}
        value={section.heading}
        align={align}
        mode={mode}
        className="resume-section-heading-text"
        placeholder="Section heading"
      />
    </div>
  );
}
