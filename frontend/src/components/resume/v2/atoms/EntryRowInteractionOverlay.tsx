// frontend/src/components/resume/v2/atoms/EntryRowInteractionOverlay.tsx
'use client';
import { DragHandle } from '../interaction/DragHandle';
import { useResumeStore } from '../store/useResumeStore';
import type { DropIndicatorPayload } from '../interaction/DragController';
import type { BlockId, SelectableBlock } from '../types';

interface Props {
  entryId: BlockId;
  field: 'title' | 'meta';
  hovered?: boolean;
  onDropIndicator?: (p: DropIndicatorPayload) => void;
}

/**
 * Row-level drag handle + hover affordance for entry.title / entry.meta rows
 * (sister of BulletInteractionOverlay). Mirrors the bullet pattern: positioned
 * absolutely in the gutter at left:-28, opacity 0 until hovered.
 *
 * `field` is informational — drag/select always operates on the OWNING ENTRY,
 * not on the individual row. Per-row drag doesn't make sense for resume rows
 * (title/meta belong to one entry conceptually), so a row's ⋮⋮ drags the
 * whole entry — same as if the user grabbed the entry-level handle from the
 * InteractionLayer.
 */
export function EntryRowInteractionOverlay({
  entryId, field, hovered = false, onDropIndicator,
}: Props) {
  // Resolve the owning section so DragController's entry-move path has the
  // sectionId it needs. If we can't find it (e.g. transient state), render
  // nothing rather than a broken handle.
  const sectionId = useResumeStore((s) => {
    const r = s.resume;
    if (!r) return null;
    for (const sec of r.sections) {
      if (sec.entries.some(e => e.id === entryId)) return sec.id;
    }
    return null;
  });
  if (!sectionId) return null;

  const block: SelectableBlock = { kind: 'entry', id: entryId, sectionId };

  return (
    <div
      data-edit-only
      data-row-handle-field={field}
      style={{
        position: 'absolute',
        left: -28,
        top: 0,
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.15s',
        pointerEvents: hovered ? 'auto' : 'none',
      }}
    >
      <DragHandle block={block} onDropIndicator={onDropIndicator ?? (() => {})} />
    </div>
  );
}
