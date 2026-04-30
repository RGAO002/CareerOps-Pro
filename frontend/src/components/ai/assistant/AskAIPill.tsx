// frontend/src/components/ai/assistant/AskAIPill.tsx
'use client';
import { useAssistantStore } from '@/stores/assistant';

interface Props { blockId: string; label: string }

/** Hover-revealed pill that lives inside the v2 InteractionLayer for section
 *  blocks (top-right). Clicking opens the sidebar with that section as scope. */
export function AskAIPill({ blockId, label }: Props) {
  return (
    <button
      type="button"
      aria-label={`Ask AI about ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        useAssistantStore.getState().openSidebarWithScope({ blockId, label });
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 8px', borderRadius: 999,
        border: '1px solid var(--p-border)',
        background: 'oklch(0.18 0.022 34 / 0.55)',
        color: 'var(--p-text-mute)',
        font: 'var(--ai-w-ui) 10.5px/1 var(--ai-font)',
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
        pointerEvents: 'auto',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--p-surface-hi)'; e.currentTarget.style.color = 'var(--p-text-body)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'oklch(0.18 0.022 34 / 0.55)'; e.currentTarget.style.color = 'var(--p-text-mute)'; }}
    >
      <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2}>
        <polygon points="12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5" />
      </svg>
      Ask AI
    </button>
  );
}
