// frontend/src/components/ai/assistant/parts/ScopePill.tsx
'use client';
import { useAssistantStore } from '@/stores/assistant';

/** Renders nothing if scope is null. Click pill → emit scroll-to-section
 *  custom event (resume editor listens). Click ✕ → clear scope. */
export function ScopePill() {
  const scope = useAssistantStore((s) => s.scope);
  const clearScope = useAssistantStore((s) => s.clearScope);
  if (!scope) return null;
  return (
    <div
      onClick={() => {
        // The resume editor listens for this and scrolls + flashes.
        window.dispatchEvent(new CustomEvent('assistant:scroll-to-block', { detail: { blockId: scope.blockId } }));
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '5px 6px 5px 10px',
        borderRadius: 7,
        background: 'transparent',
        border: '1px solid var(--p-border)',
        font: '500 11px/1.2 Inter, sans-serif',
        color: 'var(--p-text-body)',
        maxWidth: 'fit-content',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--p-surface)'; e.currentTarget.style.borderColor = 'var(--p-border2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--p-border)'; }}
    >
      <span style={{
        font: '500 9px/1 Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.13em',
        color: 'var(--p-text-dim)',
      }}>Scope</span>
      <span>{scope.label}</span>
      <button
        type="button" aria-label="Clear scope"
        onClick={(e) => { e.stopPropagation(); clearScope(); }}
        style={{
          marginLeft: 2, width: 18, height: 18, borderRadius: 5,
          background: 'transparent', border: 0, display: 'grid', placeItems: 'center',
          cursor: 'pointer', color: 'var(--p-text-mute)',
        }}
      >×</button>
    </div>
  );
}
