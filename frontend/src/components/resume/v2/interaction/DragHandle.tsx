// frontend/src/components/resume/v2/interaction/DragHandle.tsx
'use client';
import { useRef } from 'react';
import { startDrag, type DropIndicatorPayload } from './DragController';
import type { SelectableBlock } from '../types';

interface Props {
  block: SelectableBlock;
  onDropIndicator: (p: DropIndicatorPayload) => void;
  onDoubleClick?: React.MouseEventHandler<HTMLButtonElement>;
  /** Fires only on a click (mouseup with no drag movement). Used by callers
   *  that want a tap-to-select affordance on top of drag (e.g. selecting a
   *  section when its 6-dot handle is clicked without dragging). */
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  style?: React.CSSProperties;
}

export function DragHandle({ block, onDropIndicator, onDoubleClick, onClick, style }: Props) {
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
      onClick={onClick}
      style={{
        ...style,
        cursor: 'grab', touchAction: 'none', border: 0, background: 'transparent',
        padding: '0 3px', color: '#aaa',
        // 6-dot grid per design_handoff_ai_sidebar/README.md (.r-handle).
        // Total box must fit a single text line (~20px) so the handle aligns
        // visually with the bullet/entry text it sits beside. Border-box keeps
        // padding inside the declared 16x18 outer dim.
        width: 16, height: 18,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 2px)',
        gridTemplateRows: 'repeat(3, 2px)',
        gap: 2,
        alignContent: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        borderRadius: 4,
        flexShrink: 0,
      }}
      aria-label="Drag to reorder"
    >
      <i style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }} />
      <i style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }} />
      <i style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }} />
      <i style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }} />
      <i style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }} />
      <i style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }} />
    </button>
  );
}
