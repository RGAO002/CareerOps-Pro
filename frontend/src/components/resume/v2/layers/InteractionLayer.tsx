// frontend/src/components/resume/v2/layers/InteractionLayer.tsx
'use client';
import { useState } from 'react';
import { DragHandle } from '../interaction/DragHandle';
import { DropIndicator } from '../interaction/DropIndicator';
import { HoverAffordance } from '../interaction/HoverAffordance';
import { SlashMenu } from '../interaction/SlashMenu';
import type { DropIndicatorPayload } from '../interaction/DragController';
import { getAtomAbsoluteCoord } from '../layout/coords';
import { useResumeStore } from '../store/useResumeStore';
import type { LayoutAtom, AtomLayout, AtomId, SelectableBlock } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';

interface Props {
  atoms: LayoutAtom[];
  layouts: Map<AtomId, AtomLayout>;
  template: NormalizedTemplate;
}

function selectableForAtom(atom: LayoutAtom): SelectableBlock | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  if (atom.kind === 'header') return null;            // header not draggable
  if (atom.kind === 'section-heading') return { kind: 'section', id: atom.sourceBlockId };
  // entry → find its section
  const section = r.sections.find(s => s.entries.some(e => e.id === atom.sourceBlockId));
  return section ? { kind: 'entry', id: atom.sourceBlockId, sectionId: section.id } : null;
}

export function InteractionLayer({ atoms, layouts, template }: Props) {
  const [dropPayload, setDropPayload] = useState<DropIndicatorPayload>(null);

  return (
    <div
      className="interaction-layer"
      data-edit-only
      style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
    >
      {atoms.map((atom) => {
        const layout = layouts.get(atom.id);
        if (!layout) return null;
        const block = selectableForAtom(atom);
        if (!block) return null;
        const coord = getAtomAbsoluteCoord(layout, 'edit', template);
        return (
          <div
            key={atom.id}
            style={{ position: 'absolute', top: coord.top, left: coord.left - 28, pointerEvents: 'auto' }}
          >
            <DragHandle block={block} onDropIndicator={setDropPayload} />
            <HoverAffordance block={block} style={{ marginTop: 4 }} />
          </div>
        );
      })}
      <DropIndicator target={dropPayload?.target ?? null} y={dropPayload?.y ?? 0} />
      <SlashMenu />
    </div>
  );
}
