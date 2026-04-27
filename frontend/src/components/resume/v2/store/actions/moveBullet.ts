// frontend/src/components/resume/v2/store/actions/moveBullet.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

export function moveBullet(
  bulletId: BlockId,
  targetEntryId: BlockId,
  indexInEntry: number,
  origin: UpdateOrigin,
): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  let bullet: any = null;
  let sourceEntryId: BlockId | null = null;
  let srcIdxInEntry = -1;
  for (const s of r.sections) {
    for (const e of s.entries) {
      const idx = e.bullets.findIndex(b => b.id === bulletId);
      if (idx >= 0) { bullet = e.bullets[idx]; sourceEntryId = e.id; srcIdxInEntry = idx; break; }
    }
    if (bullet) break;
  }
  if (!bullet || !sourceEntryId) return;
  if (!r.sections.some(s => s.entries.some(e => e.id === targetEntryId))) return;

  // No-op detection: drop on self / drop right-after-self in same entry.
  if (sourceEntryId === targetEntryId) {
    if (indexInEntry === srcIdxInEntry) return;
    if (indexInEntry === srcIdxInEntry + 1) return;
  }

  _pushUndo('moveBullet');
  const next = r.sections.map(s => ({
    ...s,
    entries: s.entries.map(e => {
      if (e.id === sourceEntryId && e.id !== targetEntryId) {
        return { ...e, bullets: e.bullets.filter(b => b.id !== bulletId) };
      }
      if (e.id === targetEntryId) {
        const cleaned = e.id === sourceEntryId
          ? e.bullets.filter(b => b.id !== bulletId)
          : e.bullets;
        const out = [...cleaned];
        // Same-entry index adjustment: post-removal, original-array indices
        // > srcIdxInEntry shift down by one in the cleaned array.
        const adjustedIdx = (e.id === sourceEntryId && indexInEntry > srcIdxInEntry)
          ? indexInEntry - 1
          : indexInEntry;
        out.splice(Math.min(adjustedIdx, out.length), 0, bullet);
        return { ...e, bullets: out };
      }
      return e;
    }),
  }));
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
