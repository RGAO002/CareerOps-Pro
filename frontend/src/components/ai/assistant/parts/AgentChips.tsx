// frontend/src/components/ai/assistant/parts/AgentChips.tsx
'use client';
import { useAssistantStore, type AssistantTargetAgent } from '@/stores/assistant';

const CHIPS: Array<{ key: AssistantTargetAgent; label: string; dotVar: string | null }> = [
  { key: 'all',     label: 'All agents',  dotVar: null },
  { key: 'recruit', label: 'Recruiter',   dotVar: 'var(--p-recruit)' },
  { key: 'hm',      label: 'HM',          dotVar: 'var(--p-hm)' },
  { key: 'coach',   label: 'Coach',       dotVar: 'var(--p-coach)' },
];

/**
 * Per design (.targets / .tgt): pill chips, hairline border, 5×5 dot for
 * persona color, hover lifts text + border, active uses surface-hi bg with
 * brighter text. Caller-side "Ask:" label hidden by design (labels none).
 */
export function AgentChips() {
  const target = useAssistantStore((s) => s.targetAgent);
  const setTargetAgent = useAssistantStore((s) => s.setTargetAgent);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {CHIPS.map((c) => {
        const active = target === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => setTargetAgent(c.key)}
            aria-pressed={active}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px',
              borderRadius: 999,
              border: `1px solid ${active ? 'var(--p-border2)' : 'var(--p-border)'}`,
              background: active ? 'var(--p-surface-hi)' : 'transparent',
              color: active ? 'var(--p-text)' : 'var(--p-text-mute)',
              font: '500 11px/1 Inter, sans-serif',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (active) return;
              e.currentTarget.style.color = 'var(--p-text-body)';
              e.currentTarget.style.borderColor = 'var(--p-border2)';
            }}
            onMouseLeave={(e) => {
              if (active) return;
              e.currentTarget.style.color = 'var(--p-text-mute)';
              e.currentTarget.style.borderColor = 'var(--p-border)';
            }}
          >
            {c.dotVar && <i style={{ width: 5, height: 5, borderRadius: 999, background: c.dotVar }} />}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
