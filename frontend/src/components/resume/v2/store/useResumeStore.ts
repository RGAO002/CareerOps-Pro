// frontend/src/components/resume/v2/store/useResumeStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ResumeDoc, BulletBlock, BlockId, ProseMirrorBulletDoc, UpdateOrigin,
  EditableField,
} from '../types';
import { UndoStack } from './undo-stack';

export type StoredBullet = {
  block: BulletBlock;
  lastUpdateOrigin: UpdateOrigin;
  version: number;        // monotonic per-bullet
};

export type ResumeStoreState = {
  resume: ResumeDoc | null;
  // Per-bullet origin tracking (for store.subscribe listeners)
  bulletMeta: Record<BlockId, { origin: UpdateOrigin; version: number }>;
  // Undo stack lives outside React state to avoid serialization
  _undo: UndoStack;
};

export type ResumeStoreActions = {
  hydrate: (resume: ResumeDoc) => void;
  updateBullet: (id: BlockId, content: ProseMirrorBulletDoc, origin: UpdateOrigin) => void;
  updateField: (field: EditableField, value: string, origin: UpdateOrigin) => void;
  undo: () => void;
  redo: () => void;
};

export const useResumeStore = create<ResumeStoreState & ResumeStoreActions>()(
  subscribeWithSelector((set, get) => ({
    resume: null,
    bulletMeta: {},
    _undo: new UndoStack(),

    hydrate: (resume) => {
      set({ resume, bulletMeta: {} });
      get()._undo.clear();
    },

    updateBullet: (id, content, origin) => {
      const r = get().resume;
      if (!r) return;
      const next: ResumeDoc = {
        ...r,
        sections: r.sections.map(s => ({
          ...s,
          entries: s.entries.map(e => ({
            ...e,
            bullets: e.bullets.map(b => b.id === id ? { ...b, content } : b),
          })),
        })),
        metadata: { ...r.metadata, updated_at: new Date().toISOString() },
      };
      const meta = get().bulletMeta;
      const prevVersion = meta[id]?.version ?? 0;
      set({
        resume: next,
        bulletMeta: { ...meta, [id]: { origin, version: prevVersion + 1 } },
      });
      // NOTE: bullet content updates do NOT push to undo stack — TipTap.history handles it
    },

    updateField: (field, value, origin) => {
      const r = get().resume;
      if (!r) return;
      const next = applyFieldUpdate(r, field, value);
      set({ resume: next });
      // Also no undo push — TipTap.history per-field handles single-line undo
    },

    undo: () => {
      const r = get().resume;
      if (!r) return;
      const past = get()._undo.popPast();
      if (!past) return;
      get()._undo.pushFuture({ doc: r, label: 'redo:' + past.label });
      set({ resume: past.doc, bulletMeta: {} });
    },

    redo: () => {
      const r = get().resume;
      if (!r) return;
      const fut = get()._undo.popFuture();
      if (!fut) return;
      get()._undo.push({ doc: r, label: 'undo:' + fut.label });
      set({ resume: fut.doc, bulletMeta: {} });
    },
  }))
);

function applyFieldUpdate(r: ResumeDoc, f: EditableField, value: string): ResumeDoc {
  switch (f.kind) {
    case 'header.name':
      return { ...r, header: { ...r.header, name: value } };
    case 'section.heading':
      return {
        ...r,
        sections: r.sections.map(s =>
          s.id === f.id ? { ...s, heading: value } : s),
      };
    case 'entry.title':
      return {
        ...r,
        sections: r.sections.map(s => ({
          ...s,
          entries: s.entries.map(e => e.id === f.id ? { ...e, title: value } : e),
        })),
      };
    case 'entry.meta':
      return {
        ...r,
        sections: r.sections.map(s => ({
          ...s,
          entries: s.entries.map(e => e.id === f.id ? { ...e, meta: value } : e),
        })),
      };
    default:
      // header.contact and bullet.content go through dedicated paths
      return r;
  }
}

/** Internal helper for tests: push current state to undo stack with a label.
 *  Real structural actions (Task 12) call this. */
export function _pushUndo(label: string): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  useResumeStore.getState()._undo.push({ doc: r, label });
}
