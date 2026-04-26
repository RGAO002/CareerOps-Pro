// frontend/src/components/resume/v2/layout/atoms-projection.ts
import type { ResumeDoc, LayoutAtom } from '../types';

export function projectAtoms(resume: ResumeDoc): LayoutAtom[] {
  const atoms: LayoutAtom[] = [];
  atoms.push({
    kind: 'header',
    id: resume.header.id,
    sourceBlockId: resume.header.id,
    keepWithNext: false,
  });
  for (const section of resume.sections) {
    atoms.push({
      kind: 'section-heading',
      id: section.id,
      sourceBlockId: section.id,
      keepWithNext: true,
    });
    for (const entry of section.entries) {
      atoms.push({
        kind: 'entry',
        id: entry.id,
        sourceBlockId: entry.id,
        keepWithNext: false,
      });
    }
  }
  return atoms;
}
