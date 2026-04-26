// frontend/src/components/resume/v2/store/actions/moveSection.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

export function moveSection(
  sectionId: BlockId,
  beforeSectionId: BlockId | null,
  origin: UpdateOrigin,
): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  const section = r.sections.find(s => s.id === sectionId);
  if (!section) return;
  _pushUndo('moveSection');
  const remaining = r.sections.filter(s => s.id !== sectionId);
  const insertAt = beforeSectionId === null
    ? remaining.length
    : remaining.findIndex(s => s.id === beforeSectionId);
  const next = [...remaining];
  next.splice(insertAt < 0 ? remaining.length : insertAt, 0, section);
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
