// frontend/src/components/resume/v2/layers/InteractionLayer.tsx
'use client';
import { useEffect, useState } from 'react';
import { DragHandle } from '../interaction/DragHandle';
import { DropIndicator } from '../interaction/DropIndicator';
import { HoverAffordance } from '../interaction/HoverAffordance';
import { SlashMenu } from '../interaction/SlashMenu';
import { selectionManager } from '../interaction/SelectionManager';
import type { DropIndicatorPayload } from '../interaction/DragController';
import { getAtomAbsoluteCoord } from '../layout/coords';
import { useResumeStore } from '../store/useResumeStore';
import type { LayoutAtom, AtomLayout, AtomId, SelectableBlock, BlockId } from '../types';
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
  const [selectedBlocks, setSelectedBlocks] = useState<Set<BlockId>>(new Set());
  // Track the atom whose content the user is hovering — used to fade in the
  // ⋮⋮ drag handle and + / × buttons only for that row.
  const [hoveredAtomId, setHoveredAtomId] = useState<AtomId | null>(null);
  // Tick to force re-render of selection outlines when layouts shift (e.g.
  // typing causes atoms to grow / pagination to recompute).
  const [, setOutlineTick] = useState(0);

  useEffect(() => {
    return selectionManager.subscribe((s) => {
      setSelectedBlocks(new Set(s));
      setOutlineTick(t => t + 1);
    });
  }, []);

  // Outlines reposition when layouts change (atoms move during pagination).
  useEffect(() => {
    setOutlineTick(t => t + 1);
  }, [layouts]);

  // Document-level event delegation: figure out which atom the cursor is over
  // by walking up from the event target to the nearest [data-atom-id].
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.querySelector('[data-canvas-root]');
    if (!root) return;
    const onOver = (e: Event) => {
      const tgt = e.target as HTMLElement | null;
      if (!tgt || typeof tgt.closest !== 'function') return;
      const atomEl = tgt.closest('[data-atom-id]') as HTMLElement | null;
      const id = (atomEl?.getAttribute('data-atom-id') as AtomId | null) ?? null;
      setHoveredAtomId(id);
    };
    const onLeaveRoot = () => setHoveredAtomId(null);
    root.addEventListener('mouseover', onOver);
    root.addEventListener('mouseleave', onLeaveRoot);
    return () => {
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('mouseleave', onLeaveRoot);
    };
  }, []);

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
        const isHovered = hoveredAtomId === atom.id;
        return (
          <div
            key={atom.id}
            onMouseEnter={() => setHoveredAtomId(atom.id)}
            onMouseLeave={() => setHoveredAtomId(prev => (prev === atom.id ? null : prev))}
            style={{
              position: 'absolute',
              top: coord.top,
              left: coord.left - 28,
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 0.15s',
              pointerEvents: isHovered ? 'auto' : 'none',
            }}
          >
            <DragHandle block={block} onDropIndicator={setDropPayload} />
            <HoverAffordance block={block} style={{ marginTop: 4 }} />
          </div>
        );
      })}
      {/* Selection outlines — drawn on top of selected blocks. Re-rendered
          whenever selection or layouts change (selectionTick forces a relayout
          read of getBoundingClientRect). */}
      {Array.from(selectedBlocks).map((id) => {
        if (typeof document === 'undefined') return null;
        const el = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
        if (!el) return null;
        const root = document.querySelector('[data-canvas-root]') as HTMLElement | null;
        if (!root) return null;
        const rect = el.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        return (
          <div
            key={`sel-${id}`}
            style={{
              position: 'absolute',
              top: rect.top - rootRect.top - 4,
              left: rect.left - rootRect.left - 4,
              width: rect.width + 8,
              height: rect.height + 8,
              outline: '2px solid #3b82f6',
              outlineOffset: 0,
              borderRadius: 4,
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }}
          />
        );
      })}
      <DropIndicator target={dropPayload?.target ?? null} y={dropPayload?.y ?? 0} />
      <SlashMenu />
    </div>
  );
}
