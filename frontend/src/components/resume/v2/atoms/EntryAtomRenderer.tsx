// frontend/src/components/resume/v2/atoms/EntryAtomRenderer.tsx
'use client';
import { useEffect, useState } from 'react';
import { PlainTextField } from '../fields/PlainTextField';
import { BulletField } from '../fields/BulletField';
import { BulletInteractionOverlay } from './BulletInteractionOverlay';
import { getHoverState, subscribeHover } from '../interaction/hover-state';
import {
  getDragPreview,
  subscribeDragPreview,
  type DragPreview,
} from '../interaction/drag-preview-state';
import type { BlockId, CanvasMode, EntryBlock } from '../types';

interface Props {
  entry: EntryBlock;
  mode: CanvasMode;
}

const BULLET_SHIFT_GAP = 6;

export function EntryAtomRenderer({ entry, mode }: Props) {
  // Bullet hover via global Y-coord matcher (InteractionLayer publishes).
  // The overlay sits in the gutter at left:-28 with pointerEvents:'none'
  // until hovered → we can't rely on the <li>'s own onMouseEnter alone
  // (cursor moving from text into gutter passes through to underlying
  // canvas, and the <li> mouseleave fires before the overlay can grab focus).
  const [hoveredBulletId, setHoveredBulletId] = useState<BlockId | null>(getHoverState().bulletId);
  useEffect(() => subscribeHover(s => setHoveredBulletId(s.bulletId)), []);

  // Bullet drag preview: shift sibling bullets to make room (Notion-style).
  const [preview, setPreview] = useState<DragPreview>(getDragPreview());
  useEffect(() => subscribeDragPreview(setPreview), []);

  const bulletPreview = preview && preview.kind === 'bullet' && preview.dstEntryId === entry.id
    ? preview : null;
  const draggedBulletId = preview?.kind === 'bullet' ? preview.draggedBulletId : null;

  function bulletShift(bulletIdx: number, bulletId: BlockId): number {
    if (!bulletPreview) return 0;
    if (bulletPreview.draggedBulletId === bulletId) return 0;
    // Find src index within THIS entry (only valid if drag originated here)
    const srcIdx = bulletPreview.srcEntryId === entry.id
      ? entry.bullets.findIndex(b => b.id === bulletPreview.draggedBulletId)
      : -1;
    const dst = bulletPreview.dstBulletIndex;
    const H = bulletPreview.draggedHeight + BULLET_SHIFT_GAP;
    if (srcIdx < 0) {
      // Bullet from another entry → just open a slot at dst, shift bullets ≥ dst down
      return bulletIdx >= dst ? H : 0;
    }
    // Same-entry move: same Notion math as atom level
    if (srcIdx < dst) {
      if (bulletIdx > srcIdx && bulletIdx < dst) return -H;
    } else if (srcIdx > dst) {
      if (bulletIdx >= dst && bulletIdx < srcIdx) return H;
    }
    return 0;
  }

  return (
    <div className="resume-entry" data-block-id={entry.id} data-atom-content>
      <PlainTextField
        fieldKey={{ kind: 'entry.title', id: entry.id }}
        value={entry.title}
        mode={mode}
        className="resume-entry-title"
        placeholder="Title (e.g. Software Engineer @ Acme)"
      />
      <PlainTextField
        fieldKey={{ kind: 'entry.meta', id: entry.id }}
        value={entry.meta}
        mode={mode}
        className="resume-entry-meta"
        placeholder="Date · Location"
      />
      <ul className="resume-entry-bullets">
        {entry.bullets.map((b, idx) => {
          const dragged = draggedBulletId === b.id;
          const shift = bulletShift(idx, b.id);
          return (
            <li
              key={b.id}
              className="resume-bullet"
              data-block-id={b.id}
              style={{
                position: 'relative',
                transform: `translateY(${shift}px)`,
                transition: 'transform 0.18s ease-out, opacity 0.12s ease-out',
                opacity: dragged ? 0 : 1,
                visibility: dragged ? 'hidden' : 'visible',
                willChange: preview ? 'transform, opacity' : undefined,
              }}
            >
              {mode === 'edit' && (
                <BulletInteractionOverlay
                  bulletId={b.id}
                  entryId={entry.id}
                  hovered={hoveredBulletId === b.id}
                />
              )}
              <BulletField bulletId={b.id} entryId={entry.id} content={b.content} mode={mode} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
