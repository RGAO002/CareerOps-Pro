// frontend/src/components/resume/v2/layers/InteractionLayer.tsx
'use client';
import type { LayoutAtom, AtomLayout, AtomId } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';

interface Props {
  atoms: LayoutAtom[];
  layouts: Map<AtomId, AtomLayout>;
  template: NormalizedTemplate;
}

/**
 * Renders DragHandles, Selection outlines, Hover affordances, Drop indicator,
 * Drag ghost, BubbleMenu portals. Filled in by Tasks 28-33.
 */
export function InteractionLayer(_props: Props) {
  return (
    <div
      className="interaction-layer"
      data-edit-only
      style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
    >
      {/* DragHandle, SelectionOutline, HoverAffordance, DropIndicator placeholder slots
         — wired up in Task 28-33 */}
    </div>
  );
}
