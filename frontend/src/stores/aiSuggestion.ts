// frontend/src/stores/aiSuggestion.ts
import { create } from 'zustand';
import {
  _registerAiApplyUndoCallback,
  type AiApplyUndoDirection,
} from '@/components/resume/v2/store/useResumeStore';

// Mirror types from backend services/ai/types.py — discriminated union on `op`.
type BlockId = string;
type TipTapDoc = unknown;

export type EditableField =
  | { kind: 'header.name' }
  | { kind: 'header.contact'; index: number }
  | { kind: 'section.heading'; id: BlockId }
  | { kind: 'entry.title'; id: BlockId }
  | { kind: 'entry.meta'; id: BlockId }
  | { kind: 'bullet.content'; id: BlockId };

// BlockSnapshot mirrors backend services/ai/types.py. Inner arrays are typed
// to their concrete child variant (not the union) so TS narrows cleanly in
// apply / concurrency layers — entries always contain bullets, sections
// always contain entries.
export type BulletSnapshot = { kind: 'bullet'; id: BlockId; content: TipTapDoc };
export type EntrySnapshot = { kind: 'entry'; id: BlockId; title: string; meta: string; bullets: BulletSnapshot[] };
export type SectionSnapshot = { kind: 'section'; id: BlockId; heading: string; role: string; entries: EntrySnapshot[] };
export type BlockSnapshot = BulletSnapshot | EntrySnapshot | SectionSnapshot;

export type SuggestionStatus = 'streaming' | 'pending' | 'accepted' | 'rejected' | 'superseded';

interface Base {
  id: string;
  runId: string;
  agentId: string;
  resumeId: string;
  status: SuggestionStatus;
  createdAt: number;
  appliedAt?: number;
  rejectedAt?: number;
  supersededAt?: number;
  source: { kind: 'agent'; agentId: string; runId: string };
}

export type UpdateSuggestion = Base & {
  op: 'update'; field: EditableField; before: TipTapDoc | string; after: TipTapDoc | string;
};
export type InsertSuggestion = Base & {
  op: 'insert'; parentId: BlockId; atIndex: number; beforeChildIds: BlockId[]; insertedBlock: BlockSnapshot;
};
export type DeleteSuggestion = Base & {
  op: 'delete'; parentId: BlockId; blockId: BlockId; beforeChildIds: BlockId[]; deletedBlock: BlockSnapshot;
};
export type MoveSuggestion = Base & {
  op: 'move'; blockId: BlockId; fromParentId: BlockId; fromIndex: number; fromBeforeChildIds: BlockId[];
  toParentId: BlockId; toIndex: number; toBeforeChildIds: BlockId[];
};
export type Suggestion = UpdateSuggestion | InsertSuggestion | DeleteSuggestion | MoveSuggestion;

export function suggestionBlockId(s: Suggestion): BlockId {
  switch (s.op) {
    case 'update':
      // For header.name / header.contact, target is the header block; we
      // don't have its id at compile time so caller resolves via current resume.
      return 'id' in s.field ? s.field.id : '<header>';
    case 'insert': return s.parentId;
    case 'delete': return s.blockId;
    case 'move':   return s.blockId;
  }
}

// Same API base resolver as flush-save.ts: dev defaults to localhost:8000
// where FastAPI runs; override via NEXT_PUBLIC_API_BASE for staging/prod.
const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) ||
  'http://localhost:8000';

interface SuggestionStoreState {
  byId: Record<string, Suggestion>;
  byRun: Record<string, string[]>;
  hydrate: (resumeId: string) => Promise<void>;
  upsert: (s: Suggestion) => void;
  markStatusLocally: (id: string, status: SuggestionStatus, ts?: number) => void;
  allInRunArePending: (suggestionIds: string[]) => boolean;
  postStatusToBackend: (id: string, status: SuggestionStatus) => Promise<{ok: boolean; current?: string; noop?: boolean}>;
}

export const useSuggestionStore = create<SuggestionStoreState>((set, get) => ({
  byId: {},
  byRun: {},

  hydrate: async (resumeId: string) => {
    const params = new URLSearchParams({ resumeId, status: 'pending,streaming' });
    const r = await fetch(`${API_BASE}/api/ai/suggestions?${params}`, { method: 'GET' });
    if (!r.ok) return;
    const body = await r.json();
    const byId: Record<string, Suggestion> = {};
    const byRun: Record<string, string[]> = {};
    for (const s of body.suggestions as Suggestion[]) {
      byId[s.id] = s;
      (byRun[s.runId] ||= []).push(s.id);
    }
    set({ byId, byRun });
  },

  upsert: (s: Suggestion) => set((st) => {
    const byId = { ...st.byId, [s.id]: s };
    const byRun = { ...st.byRun };
    if (!byRun[s.runId]?.includes(s.id)) {
      byRun[s.runId] = [...(byRun[s.runId] || []), s.id];
    }
    return { byId, byRun };
  }),

  markStatusLocally: (id: string, status: SuggestionStatus, ts?: number) => set((st) => {
    const cur = st.byId[id];
    if (!cur) return st;
    const updated: Suggestion = { ...cur, status };
    delete (updated as Base).appliedAt;
    delete (updated as Base).rejectedAt;
    delete (updated as Base).supersededAt;
    const t = ts ?? Date.now();
    if (status === 'accepted') (updated as Base).appliedAt = t;
    else if (status === 'rejected') (updated as Base).rejectedAt = t;
    else if (status === 'superseded') (updated as Base).supersededAt = t;
    return { ...st, byId: { ...st.byId, [id]: updated } };
  }),

  allInRunArePending: (ids: string[]) => {
    const map = get().byId;
    return ids.every((id) => map[id]?.status === 'pending');
  },

  postStatusToBackend: async (id: string, status: SuggestionStatus) => {
    const r = await fetch(`${API_BASE}/api/ai/suggestions/${id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) return { ok: false };
    return r.json();
  },
}));

/** Install the AI-apply undo callback once on module load. Called by:
 *  - undo() after popping an aiApply entry (direction='undo'): flip suggestions back to 'pending'
 *  - redo() before swap (direction='redo:precheck'): return true iff all are pending
 *  - redo() after swap (direction='redo'): flip back to 'accepted'
 */
_registerAiApplyUndoCallback((suggestionIds: string[], direction: AiApplyUndoDirection) => {
  const store = useSuggestionStore.getState();
  if (direction === 'redo:precheck') {
    return store.allInRunArePending(suggestionIds);
  }
  const targetStatus = direction === 'undo' ? 'pending' : 'accepted';
  for (const id of suggestionIds) {
    store.markStatusLocally(id, targetStatus);
    // Fire-and-forget the backend status update:
    store.postStatusToBackend(id, targetStatus).catch(() => {});
  }
});
