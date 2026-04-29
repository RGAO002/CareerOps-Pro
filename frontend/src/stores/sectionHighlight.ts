// frontend/src/stores/sectionHighlight.ts
//
// Lightweight ephemeral store for section-level visual highlight.
// - hoveredSectionId: section the mouse is currently over (any of its atoms).
// - selectedSectionId: section the user clicked the 6-dot of. "Active" pose.
//
// Both are presentation-only — they do not persist and do not affect
// resume data, layout, or selection semantics elsewhere.
import { create } from 'zustand';

interface SectionHighlightState {
  hoveredSectionId: string | null;
  selectedSectionId: string | null;
  setHovered: (id: string | null) => void;
  setSelected: (id: string | null) => void;
  toggleSelected: (id: string) => void;
}

export const useSectionHighlight = create<SectionHighlightState>((set) => ({
  hoveredSectionId: null,
  selectedSectionId: null,
  setHovered: (hoveredSectionId) => set({ hoveredSectionId }),
  setSelected: (selectedSectionId) => set({ selectedSectionId }),
  toggleSelected: (id) => set((s) => ({ selectedSectionId: s.selectedSectionId === id ? null : id })),
}));
