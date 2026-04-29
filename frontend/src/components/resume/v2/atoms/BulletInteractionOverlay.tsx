// frontend/src/components/resume/v2/atoms/BulletInteractionOverlay.tsx
'use client';
import { DragHandle } from '../interaction/DragHandle';
import type { DropIndicatorPayload } from '../interaction/DragController';
import type { BlockId } from '../types';
import { useAssistantStore } from '@/stores/assistant';

interface Props {
  bulletId: BlockId;
  entryId: BlockId;
  hovered?: boolean;
  onDropIndicator?: (p: DropIndicatorPayload) => void;
}

/**
 * Bullet-level drag handle + hover affordance. Rendered inline inside
 * EntryAtomRenderer's <li>, not in InteractionLayer (bullets aren't atoms —
 * atoms are pagination units, bullets are interaction units only).
 *
 * The `hovered` prop is driven by the parent <li>'s mouseenter/mouseleave so
 * the affordance shows when the user hovers the bullet TEXT (not just the
 * narrow gutter where this overlay actually lives).
 */
export function BulletInteractionOverlay({ bulletId, entryId, hovered = false, onDropIndicator }: Props) {
  const block = { kind: 'bullet' as const, id: bulletId, entryId };
  return (
    <div
      data-edit-only
      style={{
        position: 'absolute',
        left: -28,
        top: 0,
        // Vertically center the 18px handle on the bullet's first text line.
        // 1lh = the element's current line-height (matches bullet font line-box).
        height: '1lh',
        display: 'flex',
        alignItems: 'center',
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.15s',
        pointerEvents: hovered ? 'auto' : 'none',
      }}
    >
      <DragHandle
        block={block}
        onDropIndicator={onDropIndicator ?? (() => {})}
        onDoubleClick={(e) => {
          e.stopPropagation();
          useAssistantStore.getState().openSidebarWithScope({ blockId: bulletId, label: bulletId.slice(0, 8) });
        }}
        // Selection is handled by DragController.onUp (click-without-drag).
      />
    </div>
  );
}
