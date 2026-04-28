// frontend/src/components/resume/v2/atoms/EntryRowInteractionOverlay.tsx
'use client';
import { DragHandle } from '../interaction/DragHandle';
import { useResumeStore } from '../store/useResumeStore';
import type { DropIndicatorPayload } from '../interaction/DragController';
import type { BlockId, SelectableBlock } from '../types';
import { useAISidebarUIStore } from '@/stores/aiSidebarUI';

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
      onDoubleClick={(e) => {
        e.stopPropagation();
        useAISidebarUIStore.getState().open(entryId);
      }}
      style={{
        position: 'absolute',
        left: -28,
        top: 0,
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.15s',
        pointerEvents: hovered ? 'auto' : 'none',
        // Explicit zIndex is load-bearing. The sibling PlainTextField wrapper
        // (`.resume-entry-title` / `.resume-entry-meta`) is `position: relative`
        // in edit mode (resume-styles.css gives it a positioning context for
        // the empty-state placeholder ::before). Two positioned siblings with
        // no z-index → CSS paints the LATER one on top (the contenteditable),
        // and the contenteditable's hit area extends to the wrapper's full
        // width. Even though the gutter (left:-28) is visually outside that
        // wrapper's box, browsers route pointerdown to whichever positioned
        // sibling is on top within the parent's stacking context — so without
        // an explicit zIndex the editor swallows the click and startDrag never
        // fires. Bumping the overlay above the editor restores the gutter as
        // a clickable handle. (BulletInteractionOverlay doesn't hit this
        // because the parent <li> has `transform: translateY(0)` which makes
        // its own stacking context — the entry-row wrapper does not.)
        zIndex: 5,
      }}
    >
      <DragHandle block={block} onDropIndicator={onDropIndicator ?? (() => {})} />
    </div>
  );
}
