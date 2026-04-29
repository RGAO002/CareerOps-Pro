// frontend/src/components/resume/v2/layers/InteractionLayer.tsx
'use client';
import { useEffect, useState } from 'react';
import { DragHandle } from '../interaction/DragHandle';
import { DropIndicator } from '../interaction/DropIndicator';
import { SlashMenu } from '../interaction/SlashMenu';
import { selectionManager } from '../interaction/SelectionManager';
import type { DropIndicatorPayload } from '../interaction/DragController';
import { setHoverState } from '../interaction/hover-state';
import { getAtomAbsoluteCoord } from '../layout/coords';
import { useResumeStore } from '../store/useResumeStore';
import type { LayoutAtom, AtomLayout, AtomId, SelectableBlock, BlockId } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';
import { useAISidebarUIStore } from '@/stores/aiSidebarUI';

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

function aiScopeForBlock(block: SelectableBlock): BlockId {
  return block.kind === 'header-row' ? block.headerId : block.id;
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

  // Document-level hover detection: figure out which atom the cursor is over.
  // We use mousemove + Y-coordinate matching against atom layouts, NOT
  // event-target walking. Reason: the gutter (where ⋮⋮ lives) sits at
  // left:-28 with pointerEvents:'none' until hovered → before hover,
  // mouseover targets pass through to the page card / canvas root, which
  // has no [data-atom-id], which would clear the hover state right when
  // the user is reaching for the ⋮⋮.
  //
  // Y-coordinate matching ignores X entirely, so the ⋮⋮ in the gutter is
  // treated as "still on the same atom row" — hover stays put as the
  // cursor crosses from content into gutter.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.querySelector('[data-canvas-root]') as HTMLElement | null;
    if (!root) return;

    const onMove = (e: MouseEvent) => {
      const rootRect = root.getBoundingClientRect();
      const cursorY = e.clientY - rootRect.top;
      // Find the atom whose layout band contains cursorY.
      let atomHit: AtomId | null = null;
      for (const [id, layout] of layouts.entries()) {
        const top = getAtomAbsoluteCoord(layout, 'edit', template).top;
        const bottom = top + layout.height;
        if (cursorY >= top && cursorY <= bottom) { atomHit = id; break; }
      }
      setHoveredAtomId(prev => (prev === atomHit ? prev : atomHit));

      // Bullet hover: scan all rendered .resume-bullet <li>s for Y-band match.
      // Cheap because there are typically <50 bullets per resume.
      let bulletHit: BlockId | null = null;
      const bulletEls = document.querySelectorAll('li.resume-bullet[data-block-id]');
      for (const el of Array.from(bulletEls)) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          bulletHit = (el as HTMLElement).getAttribute('data-block-id') as BlockId;
          break;
        }
      }
      // Field-row hover (entry.title / entry.meta): scan rendered single-line
      // editor wrappers tagged with data-row-field-key for Y-band match. Same
      // cheap approach as bullets so the row-level ⋮⋮ handle behaves identically.
      let atomFieldKey: string | null = null;
      const rowEls = document.querySelectorAll('[data-row-field-key]');
      for (const el of Array.from(rowEls)) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          atomFieldKey = (el as HTMLElement).getAttribute('data-row-field-key');
          break;
        }
      }
      setHoverState({ atomId: atomHit, bulletId: bulletHit, atomFieldKey });
    };
    const onLeaveRoot = () => {
      setHoveredAtomId(null);
      setHoverState({ atomId: null, bulletId: null, atomFieldKey: null });
    };
    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeaveRoot);
    return () => {
      root.removeEventListener('mousemove', onMove);
      root.removeEventListener('mouseleave', onLeaveRoot);
    };
  }, [layouts, template]);

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
            <DragHandle
              block={block}
              onDropIndicator={setDropPayload}
              onDoubleClick={(e) => {
                e.stopPropagation();
                useAISidebarUIStore.getState().open(aiScopeForBlock(block));
              }}
            />
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
