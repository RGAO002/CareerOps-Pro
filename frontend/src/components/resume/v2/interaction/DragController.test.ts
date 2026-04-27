// frontend/src/components/resume/v2/interaction/DragController.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDropTargetsFor, commitDrop } from './DragController';
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin, _resetTransactionCounter } from '../store/source-of-truth';
import type { ResumeDoc } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: '', meta: '', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
    ]},
    { id: 's2', role: 'skills', heading: 'Skills', entries: [] },
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(RESUME), bulletMeta: {} });
  _resetTransactionCounter();
});

describe('getDropTargetsFor', () => {
  it('section drag → all section slots + tail', () => {
    const targets = getDropTargetsFor({ kind: 'section', id: 's1' });
    expect(targets).toHaveLength(3);  // before s1, before s2, end
  });
  it('entry drag → all entry slots in all sections', () => {
    const targets = getDropTargetsFor({ kind: 'entry', id: 'e1', sectionId: 's1' });
    // s1 has 1 entry → 2 slots; s2 has 0 entries → 1 slot
    expect(targets).toHaveLength(3);
  });
  it('bullet drag → bullet slots in all entries', () => {
    const targets = getDropTargetsFor({ kind: 'bullet', id: 'b1', entryId: 'e1' });
    expect(targets).toHaveLength(2);  // before b1, after b1
  });
});

describe('commitDrop', () => {
  it('section drop reorders sections', () => {
    commitDrop(
      { kind: 'section', id: 's1' },
      { kind: 'section-slot', insertBeforeSectionId: null },
      makeOrigin('drag-reorder'),
    );
    expect(useResumeStore.getState().resume!.sections.map(s => s.id)).toEqual(['s2', 's1']);
  });
});
