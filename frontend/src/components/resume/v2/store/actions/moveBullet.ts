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
  for (const s of r.sections) {
    for (const e of s.entries) {
      const found = e.bullets.find(b => b.id === bulletId);
      if (found) { bullet = found; sourceEntryId = e.id; break; }
    }
    if (bullet) break;
  }
  if (!bullet) return;
  if (!r.sections.some(s => s.entries.some(e => e.id === targetEntryId))) return;
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
        out.splice(Math.min(indexInEntry, out.length), 0, bullet);
        return { ...e, bullets: out };
      }
      return e;
    }),
  }));
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
