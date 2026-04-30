// frontend/src/components/resume/v2/interaction/DropIndicator.tsx
'use client';
import type { DropTarget } from './DragController';

interface Props {
  target: DropTarget | null;
  y: number;
}

export function DropIndicator({ target, y }: Props) {
  if (!target) return null;
  return (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, top: y,
        height: 2, background: '#3b82f6', pointerEvents: 'none', zIndex: 9998,
      }}
    />
  );
}
