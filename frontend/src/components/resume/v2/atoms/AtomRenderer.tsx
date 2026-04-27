// frontend/src/components/resume/v2/atoms/AtomRenderer.tsx
'use client';
import { useCallback } from 'react';
import { HeaderAtomRenderer } from './HeaderAtomRenderer';
import { SectionHeadingAtomRenderer } from './SectionHeadingAtomRenderer';
import { EntryAtomRenderer } from './EntryAtomRenderer';
import type { LayoutAtom, CanvasMode, ResumeDoc } from '../types';
import type { AtomElementRegistry } from '../layout/AtomElementRegistry';

interface Props {
  atom: LayoutAtom;
  resume: ResumeDoc;
  mode: CanvasMode;
  registry?: AtomElementRegistry | null;
  style?: React.CSSProperties;
}

export function AtomRenderer({ atom, resume, mode, registry, style }: Props) {
  const refCallback = useCallback((el: HTMLDivElement | null) => {
    registry?.register(atom.id, el);
  }, [registry, atom.id]);

  let content: React.ReactNode = null;

  if (atom.kind === 'header') {
    content = <HeaderAtomRenderer header={resume.header} mode={mode} />;
  } else if (atom.kind === 'section-heading') {
    const section = resume.sections.find(s => s.id === atom.sourceBlockId);
    if (section) content = <SectionHeadingAtomRenderer section={section} mode={mode} />;
  } else if (atom.kind === 'entry') {
    const entry = resume.sections.flatMap(s => s.entries).find(e => e.id === atom.sourceBlockId);
    if (entry) content = <EntryAtomRenderer entry={entry} mode={mode} />;
  }

  return (
    <div ref={refCallback} style={style} data-atom-id={atom.id} data-atom-kind={atom.kind}>
      {content}
    </div>
  );
}
