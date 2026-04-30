// frontend/src/components/resume/v2/layout/atoms-projection.test.ts
import { describe, it, expect } from 'vitest';
import { projectAtoms } from './atoms-projection';
import type { ResumeDoc } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: 't', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'X', contact_lines: [] },
  sections: [
    {
      id: 's1', role: 'experience', heading: 'Experience', entries: [
        { id: 'e1', title: 'A', meta: 'M', bullets: [] },
        { id: 'e2', title: 'B', meta: 'M', bullets: [] },
      ],
    },
    { id: 's2', role: 'skills', heading: 'Skills', entries: [
        { id: 'e3', title: 'C', meta: '', bullets: [] },
    ]},
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

describe('projectAtoms', () => {
  it('flattens to header + (heading + entries) per section', () => {
    const atoms = projectAtoms(RESUME);
    expect(atoms.map(a => `${a.kind}:${a.id}`)).toEqual([
      'header:h',
      'section-heading:s1', 'entry:e1', 'entry:e2',
      'section-heading:s2', 'entry:e3',
    ]);
  });

  it('marks section-heading atoms keepWithNext=true', () => {
    const atoms = projectAtoms(RESUME);
    atoms.filter(a => a.kind === 'section-heading').forEach(a => {
      expect(a.keepWithNext).toBe(true);
    });
  });

  it('header and entry atoms keepWithNext=false', () => {
    const atoms = projectAtoms(RESUME);
    expect(atoms.find(a => a.kind === 'header')?.keepWithNext).toBe(false);
    atoms.filter(a => a.kind === 'entry').forEach(a => {
      expect(a.keepWithNext).toBe(false);
    });
  });
});
