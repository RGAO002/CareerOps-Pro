// frontend/src/components/resume/v2/store/actions/moveEntry.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

export function moveEntry(
  entryId: BlockId,
  targetSectionId: BlockId,
  indexInSection: number,
  origin: UpdateOrigin,
): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  let entry: any = null;
  let sourceSectionId: BlockId | null = null;
  for (const s of r.sections) {
    const found = s.entries.find(e => e.id === entryId);
    if (found) { entry = found; sourceSectionId = s.id; break; }
  }
  if (!entry) return;
  _pushUndo('moveEntry');
  const next = r.sections.map(s => {
    if (s.id === sourceSectionId && s.id !== targetSectionId) {
      return { ...s, entries: s.entries.filter(e => e.id !== entryId) };
    }
    if (s.id === targetSectionId) {
      const cleaned = s.id === sourceSectionId
        ? s.entries.filter(e => e.id !== entryId)
        : s.entries;
      const out = [...cleaned];
      out.splice(Math.min(indexInSection, out.length), 0, entry);
      return { ...s, entries: out };
    }
    return s;
  });
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
