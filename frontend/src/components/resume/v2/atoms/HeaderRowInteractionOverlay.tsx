// frontend/src/components/resume/v2/atoms/HeaderRowInteractionOverlay.tsx
'use client';
import { DragHandle } from '../interaction/DragHandle';
import type { DropIndicatorPayload } from '../interaction/DragController';
import type { BlockId, SelectableBlock } from '../types';
import { useAISidebarUIStore } from '@/stores/aiSidebarUI';

interface Props {
  headerId: BlockId;
  rowKey: string;     // 'name' or 'contact:N'
  hovered?: boolean;
  onDropIndicator?: (p: DropIndicatorPayload) => void;
}

/**
 * Row-level drag handle for header rows (sister of EntryRowInteractionOverlay).
 * Same hover-revealed ⋮⋮ pattern: positioned absolutely in the gutter at
 * left:-28, opacity 0 until hovered.
 *
 * Drag scope: WITHIN the header only. DragController's getDropTargetsFor
 * returns header-row-slot targets only for `kind: 'header-row'`, so the user
 * can never drop a header row into the section list.
 *
 * Drag preview simplification: header-row drags do NOT participate in
 * `previewLayouts` (no layout-aware sibling shift). Rationale: only 2-4 rows
 * total, all stacked tightly inside the same header atom — running the
 * full layout engine is overkill. The user gets the floating ghost +
 * DropIndicator line, which is enough feedback at this scale.
 */
export function HeaderRowInteractionOverlay({
  headerId, rowKey, hovered = false, onDropIndicator,
}: Props) {
  const block: SelectableBlock = { kind: 'header-row', rowKey, headerId };
  return (
    <div
      data-edit-only
      data-row-handle-field={rowKey}
      style={{
        position: 'absolute',
        left: -28,
        top: 0,
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.15s',
        pointerEvents: hovered ? 'auto' : 'none',
        // Same z-index reasoning as EntryRowInteractionOverlay — sibling
        // contenteditable wrappers (`.resume-name`) become positioned in
        // edit mode for placeholder rendering, and without an explicit
        // zIndex the editor would paint over the gutter button.
        zIndex: 5,
      }}
    >
      <DragHandle
        block={block}
        onDropIndicator={onDropIndicator ?? (() => {})}
        onDoubleClick={(e) => {
          e.stopPropagation();
          useAISidebarUIStore.getState().open(headerId);
        }}
      />
    </div>
  );
}
