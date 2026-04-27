// frontend/src/components/resume/v2/store/useResumeStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ResumeDoc, BulletBlock, BlockId, ProseMirrorBulletDoc, UpdateOrigin,
  EditableField,
} from '../types';
import { UndoStack } from './undo-stack';

export type Align = 'left' | 'center' | 'right';

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
  setFieldAlign: (field: EditableField, align: Align | undefined, origin: UpdateOrigin) => void;
  undo: () => void;
  redo: () => void;
};

/**
 * Serialize an EditableField to the string key used in `resume.alignments`.
 * Mirrors AtomFocusManager's internal fieldKey() so both sides agree.
 */
export function fieldKeyToStr(f: EditableField): string {
  switch (f.kind) {
    case 'header.name': return 'header.name';
    case 'header.contact': return `header.contact:${f.index}`;
    case 'section.heading': return `section.heading:${f.id}`;
    case 'entry.title': return `entry.title:${f.id}`;
    case 'entry.meta': return `entry.meta:${f.id}`;
    case 'bullet.content': return `bullet.content:${f.id}`;
  }
}

/** Read the persisted alignment for a field. Returns undefined for the
 *  default ('left'). Components can call this from a selector. */
export function getFieldAlign(
  resume: ResumeDoc | null,
  field: EditableField,
): Align | undefined {
  if (!resume?.alignments) return undefined;
  const v = resume.alignments[fieldKeyToStr(field)];
  if (v === 'center' || v === 'right') return v;
  return undefined;
}

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

    setFieldAlign: (field, align, _origin) => {
      const r = get().resume;
      if (!r) return;
      // Bullet alignment lives inside the bullet's ProseMirror doc — don't
      // double-store it in the alignments map.
      if (field.kind === 'bullet.content') return;
      const key = fieldKeyToStr(field);
      const current = r.alignments ?? {};
      const prev = current[key];
      // Default 'left' (or undefined) → omit from the map to keep JSON clean.
      const wantOmit = align === undefined || align === 'left';
      if (wantOmit && prev === undefined) return; // no-op
      if (!wantOmit && prev === align) return;    // no-op
      const next: Record<string, Align> = { ...current };
      if (wantOmit) delete next[key];
      else next[key] = align;
      set({
        resume: {
          ...r,
          alignments: Object.keys(next).length > 0 ? next : undefined,
          metadata: { ...r.metadata, updated_at: new Date().toISOString() },
        },
      });
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
