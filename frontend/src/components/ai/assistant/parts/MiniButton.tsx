// frontend/src/components/ai/assistant/parts/MiniButton.tsx
'use client';
import type { ReactNode, MouseEventHandler } from 'react';
/**
 * 28×28 rounded-square ghost icon button. Used in the sidebar header
 * (+ / dock / minimize) and as the BarPose / SidebarPose send button.
 * Variants:
 *   - 'ghost' (default): transparent → surface on hover
 *   - 'solid': filled with accent (the send buttons)
 */
export function MiniButton({
  ariaLabel, onClick, children, variant = 'ghost',
}: {
  ariaLabel: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  variant?: 'ghost' | 'solid';
}) {
  const isSolid = variant === 'solid';
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        display: 'grid',
        placeItems: 'center',
        background: isSolid ? 'var(--p-accent)' : 'transparent',
        color: isSolid ? 'oklch(0.99 0.003 70)' : 'var(--p-text-mute)',
        border: 0,
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s, filter 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (isSolid) (e.currentTarget.style.filter = 'brightness(1.08)');
        else { e.currentTarget.style.background = 'var(--p-surface)'; e.currentTarget.style.color = 'var(--p-text-body)'; }
      }}
      onMouseLeave={(e) => {
        if (isSolid) (e.currentTarget.style.filter = '');
        else { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--p-text-mute)'; }
      }}
    >
      {children}
    </button>
  );
}
