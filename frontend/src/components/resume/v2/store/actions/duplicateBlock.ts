// frontend/src/components/resume/v2/store/actions/duplicateBlock.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

function newId(): BlockId { return crypto.randomUUID(); }

function deepClone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function reassignIds(node: any): any {
  if (Array.isArray(node)) return node.map(reassignIds);
  if (node && typeof node === 'object') {
    const out: any = {};
    for (const k of Object.keys(node)) {
      out[k] = (k === 'id') ? newId() : reassignIds(node[k]);
    }
    return out;
  }
  return node;
}

export function duplicateBullet(id: BlockId, origin: UpdateOrigin): BlockId | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  for (const s of r.sections) {
    for (const e of s.entries) {
      const idx = e.bullets.findIndex(b => b.id === id);
      if (idx < 0) continue;
      _pushUndo('duplicateBullet');
      const cloned = reassignIds(deepClone(e.bullets[idx]));
      const newBullets = [...e.bullets];
      newBullets.splice(idx + 1, 0, cloned);
      const next = r.sections.map(sec => sec.id === s.id
        ? { ...sec, entries: sec.entries.map(ent => ent.id === e.id
            ? { ...ent, bullets: newBullets } : ent) }
        : sec);
      useResumeStore.setState({
        resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
      });
      return cloned.id;
    }
  }
  return null;
}

export function duplicateEntry(id: BlockId, origin: UpdateOrigin): BlockId | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  for (const s of r.sections) {
    const idx = s.entries.findIndex(e => e.id === id);
    if (idx < 0) continue;
    _pushUndo('duplicateEntry');
    const cloned = reassignIds(deepClone(s.entries[idx]));
    const newEntries = [...s.entries];
    newEntries.splice(idx + 1, 0, cloned);
    const next = r.sections.map(sec => sec.id === s.id
      ? { ...sec, entries: newEntries } : sec);
    useResumeStore.setState({
      resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
    });
    return cloned.id;
  }
  return null;
}

export function duplicateSection(id: BlockId, origin: UpdateOrigin): BlockId | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  const idx = r.sections.findIndex(s => s.id === id);
  if (idx < 0) return null;
  _pushUndo('duplicateSection');
  const cloned = reassignIds(deepClone(r.sections[idx]));
  const out = [...r.sections];
  out.splice(idx + 1, 0, cloned);
  useResumeStore.setState({
    resume: { ...r, sections: out, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
  return cloned.id;
}
