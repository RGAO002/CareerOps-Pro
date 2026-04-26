// frontend/src/components/resume/v2/store/actions/deleteBlock.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

export function deleteSection(id: BlockId, origin: UpdateOrigin): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  _pushUndo('deleteSection');
  useResumeStore.setState({
    resume: { ...r, sections: r.sections.filter(s => s.id !== id),
      metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}

export function deleteEntry(id: BlockId, origin: UpdateOrigin): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  _pushUndo('deleteEntry');
  useResumeStore.setState({
    resume: { ...r,
      sections: r.sections.map(s => ({ ...s, entries: s.entries.filter(e => e.id !== id) })),
      metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}

export function deleteBullet(id: BlockId, origin: UpdateOrigin): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  _pushUndo('deleteBullet');
  useResumeStore.setState({
    resume: { ...r,
      sections: r.sections.map(s => ({
        ...s,
        entries: s.entries.map(e => ({ ...e, bullets: e.bullets.filter(b => b.id !== id) })),
      })),
      metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
