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
  let srcIdxInSection = -1;
  for (const s of r.sections) {
    const idx = s.entries.findIndex(e => e.id === entryId);
    if (idx >= 0) { entry = s.entries[idx]; sourceSectionId = s.id; srcIdxInSection = idx; break; }
  }
  if (!entry || !sourceSectionId) return;
  const targetSection = r.sections.find(s => s.id === targetSectionId);
  if (!targetSection) return;

  // No-op detection for same-section drops where the user just released near
  // the current position. Same family of bugs as moveSection — splice math
  // would phantom-move the entry to the section's tail.
  if (sourceSectionId === targetSectionId) {
    if (indexInSection === srcIdxInSection) return;       // drop on self slot
    if (indexInSection === srcIdxInSection + 1) return;   // drop on slot just after self (same effective position)
  }

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
      // If we just removed the entry from the same section, the target index
      // referred to the ORIGINAL list. Adjust: indices > srcIdxInSection
      // shift down by one in the cleaned list.
      const adjustedIdx = (s.id === sourceSectionId && indexInSection > srcIdxInSection)
        ? indexInSection - 1
        : indexInSection;
      out.splice(Math.min(adjustedIdx, out.length), 0, entry);
      return { ...s, entries: out };
    }
    return s;
  });
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
