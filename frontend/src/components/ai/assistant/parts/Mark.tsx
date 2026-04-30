// frontend/src/components/ai/assistant/parts/Mark.tsx
'use client';
/**
 * The assistant mark — a 24×24 rounded square with the accent-warm sparkle SVG.
 * Per design_handoff_ai_sidebar/README.md §A and §B.
 */
export function Mark({ size = 24 }: { size?: number }) {
  const inner = Math.round((size * 13) / 24);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        background: 'var(--p-accent-muted)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 24 24" width={inner} height={inner} fill="none" stroke="var(--p-accent-warm)" strokeWidth={1.5}>
        <polygon points="12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5" />
      </svg>
    </span>
  );
}
