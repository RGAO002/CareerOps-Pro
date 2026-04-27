// frontend/src/components/resume/v2/atoms/BulletInteractionOverlay.tsx
'use client';
import { useState } from 'react';
import { DragHandle } from '../interaction/DragHandle';
import { HoverAffordance } from '../interaction/HoverAffordance';
import type { DropIndicatorPayload } from '../interaction/DragController';
import type { BlockId } from '../types';

interface Props {
  bulletId: BlockId;
  entryId: BlockId;
  onDropIndicator?: (p: DropIndicatorPayload) => void;
}

/**
 * Bullet-level drag handle + hover affordance. Rendered inline inside
 * EntryAtomRenderer's <li>, not in InteractionLayer (bullets aren't atoms —
 * atoms are pagination units, bullets are interaction units only).
 */
export function BulletInteractionOverlay({ bulletId, entryId, onDropIndicator }: Props) {
  const [hovered, setHovered] = useState(false);
  const block = { kind: 'bullet' as const, id: bulletId, entryId };
  return (
    <div
      data-edit-only
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        left: -28,
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.15s',
        pointerEvents: 'auto',
      }}
    >
      <DragHandle block={block} onDropIndicator={onDropIndicator ?? (() => {})} />
      <HoverAffordance block={block} />
    </div>
  );
}
