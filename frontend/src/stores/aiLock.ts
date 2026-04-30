// frontend/src/stores/aiLock.ts
//
// AI lock store — keyed lock set guarding both v2 and v3 paths.
//
// Key type is the UNION of:
//   - BlockId (v2; production today)
//   - RowId   (v3; row-level lock)
//   - GroupId (v3; entry/section group lock)
//
// All three are string aliases at runtime, so a single Set<string> backs them.
// The union exists for type safety at call sites. v3 ships behind
// ENABLE_RESUME_V3 — v2 keeps using BlockId; M6 will remove BlockId once v2
// retires.
import { create } from 'zustand';
import type { EditorState } from '@tiptap/pm/state';
import type { RowId, GroupId } from '@/components/resume/v3/schema/types';

type BlockId = string;
export type AILockKey = BlockId | RowId | GroupId;

export interface LockedRange { from: number; to: number }

interface AILockStoreState {
  lockedBlockIds: Set<AILockKey>;
  lock: (ids: AILockKey[]) => void;
  unlock: (ids: AILockKey[]) => void;
  isLocked: (id: AILockKey) => boolean;
  /** Returns the live lock set as a read-only view. Do not mutate. */
  lockedKeys: () => ReadonlySet<AILockKey>;
  /** T39 — Walk the given EditorState doc and return PM ranges for every row
   *  whose `id` or `semanticGroupId` attr is in the lock set. Mirror of the
   *  AILockPlugin internal helper, exposed for external pre-flight checks
   *  (AI apply, drag, slash overlay) without coupling them to the plugin. */
  lockedRanges: (state: EditorState) => LockedRange[];
  clear: () => void;
}

export const useAILockStore = create<AILockStoreState>((set, get) => ({
  lockedBlockIds: new Set<AILockKey>(),

  lock: (ids: AILockKey[]) => set((s) => {
    const next = new Set(s.lockedBlockIds);
    for (const id of ids) next.add(id);
    return { lockedBlockIds: next };
  }),

  unlock: (ids: AILockKey[]) => set((s) => {
    const next = new Set(s.lockedBlockIds);
    for (const id of ids) next.delete(id);
    return { lockedBlockIds: next };
  }),

  isLocked: (id: AILockKey) => get().lockedBlockIds.has(id),

  lockedKeys: () => get().lockedBlockIds,

  lockedRanges: (state: EditorState) => {
    const keys = get().lockedBlockIds;
    if (keys.size === 0) return [];
    const out: LockedRange[] = [];
    state.doc.forEach((node, offset) => {
      const rid = node.attrs.id as string | undefined;
      const gid = node.attrs.semanticGroupId as string | null | undefined;
      if ((rid && keys.has(rid)) || (gid && keys.has(gid))) {
        out.push({ from: offset, to: offset + node.nodeSize });
      }
    });
    return out;
  },

  clear: () => set({ lockedBlockIds: new Set<AILockKey>() }),
}));
