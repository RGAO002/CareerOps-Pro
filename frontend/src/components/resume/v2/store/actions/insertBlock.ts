// frontend/src/components/resume/v2/store/actions/insertBlock.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type {
  BlockId, BulletBlock, EntryBlock, SectionBlock, SectionRole, UpdateOrigin,
} from '../../types';

function newId(): BlockId {
  return crypto.randomUUID();
}

export function insertBullet(
  entryId: BlockId,
  indexInEntry: number,
  contentDoc: BulletBlock['content'],
  origin: UpdateOrigin,
): BlockId {
  const r = useResumeStore.getState().resume;
  if (!r) throw new Error('No resume hydrated');
  _pushUndo('insertBullet');
  const newBullet: BulletBlock = { id: newId(), content: contentDoc };
  const next = r.sections.map(s => ({
    ...s,
    entries: s.entries.map(e => {
      if (e.id !== entryId) return e;
      const out = [...e.bullets];
      out.splice(Math.min(indexInEntry, out.length), 0, newBullet);
      return { ...e, bullets: out };
    }),
  }));
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
  return newBullet.id;
}

export function insertEntry(
  sectionId: BlockId,
  indexInSection: number,
  origin: UpdateOrigin,
): BlockId {
  const r = useResumeStore.getState().resume;
  if (!r) throw new Error('No resume hydrated');
  _pushUndo('insertEntry');
  const newEntry: EntryBlock = {
    id: newId(),
    title: '',
    meta: '',
    bullets: [{ id: newId(), content: { type: 'doc', content: [{ type: 'paragraph' }] } }],
  };
  const next = r.sections.map(s => {
    if (s.id !== sectionId) return s;
    const out = [...s.entries];
    out.splice(Math.min(indexInSection, out.length), 0, newEntry);
    return { ...s, entries: out };
  });
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
  return newEntry.id;
}

export function insertSection(
  role: SectionRole,
  beforeSectionId: BlockId | null,
  origin: UpdateOrigin,
): BlockId {
  const r = useResumeStore.getState().resume;
  if (!r) throw new Error('No resume hydrated');
  _pushUndo('insertSection');
  const newSection: SectionBlock = {
    id: newId(),
    role,
    heading: defaultHeadingForRole(role),
    entries: [],
  };
  const idx = beforeSectionId === null
    ? r.sections.length
    : r.sections.findIndex(s => s.id === beforeSectionId);
  const out = [...r.sections];
  out.splice(idx < 0 ? r.sections.length : idx, 0, newSection);
  useResumeStore.setState({
    resume: { ...r, sections: out, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
  return newSection.id;
}

function defaultHeadingForRole(role: SectionRole): string {
  switch (role) {
    case 'summary': return 'Summary';
    case 'skills': return 'Skills';
    case 'experience': return 'Experience';
    case 'projects': return 'Projects';
    case 'education': return 'Education';
    case 'awards': return 'Awards';
    case 'publications': return 'Publications';
    case 'custom': return 'Section';
  }
}
