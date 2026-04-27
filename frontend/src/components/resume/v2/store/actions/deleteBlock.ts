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

/**
 * Remove the contact line at the given index. No-op if the index is out of
 * bounds. Indices of subsequent contact lines shift down by 1; the focus
 * order rebuild in ResumeDocumentCanvas re-derives them on the next render.
 */
export function deleteContactLine(index: number, origin: UpdateOrigin): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  if (index < 0 || index >= r.header.contact_lines.length) return;
  _pushUndo('deleteContactLine');
  const lines = r.header.contact_lines.filter((_, i) => i !== index);
  // Also drop any per-line alignment entries that referenced this index, and
  // shift subsequent ones down so the alignment map stays consistent.
  let nextAlignments = r.alignments;
  if (r.alignments) {
    const out: Record<string, 'left' | 'center' | 'right'> = {};
    for (const [k, v] of Object.entries(r.alignments)) {
      const m = /^header\.contact:(\d+)$/.exec(k);
      if (!m) { out[k] = v; continue; }
      const i = Number(m[1]);
      if (i === index) continue;            // drop
      if (i > index) out[`header.contact:${i - 1}`] = v;
      else out[k] = v;
    }
    nextAlignments = Object.keys(out).length > 0 ? out : undefined;
  }
  useResumeStore.setState({
    resume: {
      ...r,
      header: { ...r.header, contact_lines: lines },
      alignments: nextAlignments,
      metadata: { ...r.metadata, updated_at: new Date().toISOString() },
    },
  });
}
