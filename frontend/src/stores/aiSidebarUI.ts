// frontend/src/stores/aiSidebarUI.ts
import { create } from 'zustand';

type BlockId = string;

interface AISidebarUIState {
  isOpen: boolean;
  scopedToBlockId: BlockId | null;
  open: (scope?: BlockId | null) => void;
  close: () => void;
  setScope: (id: BlockId | null) => void;
}

export const useAISidebarUIStore = create<AISidebarUIState>((set) => ({
  isOpen: false,
  scopedToBlockId: null,
  open: (scope) => set({ isOpen: true, scopedToBlockId: scope ?? null }),
  close: () => set({ isOpen: false }),
  setScope: (id) => set({ scopedToBlockId: id }),
}));
