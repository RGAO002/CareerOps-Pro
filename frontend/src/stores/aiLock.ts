// frontend/src/stores/aiLock.ts
import { create } from 'zustand';

type BlockId = string;

interface AILockStoreState {
  lockedBlockIds: Set<BlockId>;
  lock: (ids: BlockId[]) => void;
  unlock: (ids: BlockId[]) => void;
  isLocked: (id: BlockId) => boolean;
  clear: () => void;
}

export const useAILockStore = create<AILockStoreState>((set, get) => ({
  lockedBlockIds: new Set<BlockId>(),

  lock: (ids: BlockId[]) => set((s) => {
    const next = new Set(s.lockedBlockIds);
    for (const id of ids) next.add(id);
    return { lockedBlockIds: next };
  }),

  unlock: (ids: BlockId[]) => set((s) => {
    const next = new Set(s.lockedBlockIds);
    for (const id of ids) next.delete(id);
    return { lockedBlockIds: next };
  }),

  isLocked: (id: BlockId) => get().lockedBlockIds.has(id),

  clear: () => set({ lockedBlockIds: new Set<BlockId>() }),
}));
