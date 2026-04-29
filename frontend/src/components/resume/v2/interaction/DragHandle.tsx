// frontend/src/components/resume/v2/interaction/DragHandle.tsx
'use client';
import { useRef } from 'react';
import { startDrag, type DropIndicatorPayload } from './DragController';
import type { SelectableBlock } from '../types';

interface Props {
  block: SelectableBlock;
  onDropIndicator: (p: DropIndicatorPayload) => void;
  onDoubleClick?: React.MouseEventHandler<HTMLButtonElement>;
  style?: React.CSSProperties;
}

export function DragHandle({ block, onDropIndicator, onDoubleClick, style }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      data-edit-only
      onPointerDown={(e) => {
        if (!ref.current) return;
        startDrag(e.nativeEvent, ref.current, block, onDropIndicator);
      }}
      onDoubleClick={onDoubleClick}
      style={{
        ...style,
        cursor: 'grab', touchAction: 'none', border: 0, background: 'transparent',
        padding: '0 4px', color: '#999',
      }}
      aria-label="Drag to reorder"
    >⋮⋮</button>
  );
}
