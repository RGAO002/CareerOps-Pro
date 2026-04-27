// frontend/src/components/resume/v2/interaction/HoverAffordance.tsx
'use client';
import { useState } from 'react';
import { insertEntry, insertBullet } from '../store/actions/insertBlock';
import { deleteEntry, deleteBullet, deleteSection } from '../store/actions/deleteBlock';
import { makeOrigin } from '../store/source-of-truth';
import type { SelectableBlock } from '../types';

interface Props {
  block: SelectableBlock;
  style?: React.CSSProperties;
}

export function HoverAffordance({ block, style }: Props) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      data-edit-only
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...style, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s', pointerEvents: 'auto' }}
    >
      <button
        title="Add below"
        onClick={() => {
          if (block.kind === 'bullet') insertBullet(block.entryId, 9999, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('tiptap'));
          else if (block.kind === 'entry') insertEntry(block.sectionId, 9999, makeOrigin('tiptap'));
        }}
        style={{ marginRight: 4 }}
      >+</button>
      <button
        title="Delete"
        onClick={() => {
          if (block.kind === 'bullet') deleteBullet(block.id, makeOrigin('tiptap'));
          else if (block.kind === 'entry') deleteEntry(block.id, makeOrigin('tiptap'));
          else if (block.kind === 'section') deleteSection(block.id, makeOrigin('tiptap'));
        }}
      >×</button>
    </div>
  );
}
