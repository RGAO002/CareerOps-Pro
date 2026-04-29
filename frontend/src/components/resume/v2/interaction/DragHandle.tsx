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
        padding: '4px 2px', color: '#999',
        // 6-dot grid per design_handoff_ai_sidebar/README.md (.r-handle)
        width: 16, height: 20,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 3px)',
        gridTemplateRows: 'repeat(3, 3px)',
        gap: 2,
        alignContent: 'center',
        justifyContent: 'center',
        boxSizing: 'content-box',
        borderRadius: 4,
      }}
      aria-label="Drag to reorder"
    >
      <i style={{ width: 3, height: 3, borderRadius: 999, background: 'currentColor' }} />
      <i style={{ width: 3, height: 3, borderRadius: 999, background: 'currentColor' }} />
      <i style={{ width: 3, height: 3, borderRadius: 999, background: 'currentColor' }} />
      <i style={{ width: 3, height: 3, borderRadius: 999, background: 'currentColor' }} />
      <i style={{ width: 3, height: 3, borderRadius: 999, background: 'currentColor' }} />
      <i style={{ width: 3, height: 3, borderRadius: 999, background: 'currentColor' }} />
    </button>
  );
}
