// frontend/src/components/ai/assistant/parts/AgentChips.tsx
'use client';
import { useAssistantStore, type AssistantTargetAgent } from '@/stores/assistant';

const CHIPS: Array<{ key: AssistantTargetAgent; label: string; dotVar: string | null }> = [
  { key: 'all',     label: 'All agents',  dotVar: null },
  { key: 'recruit', label: 'Recruiter',   dotVar: 'var(--p-recruit)' },
  { key: 'hm',      label: 'HM',          dotVar: 'var(--p-hm)' },
  { key: 'coach',   label: 'Coach',       dotVar: 'var(--p-coach)' },
];

export function AgentChips() {
  const target = useAssistantStore((s) => s.targetAgent);
  const setTargetAgent = useAssistantStore((s) => s.setTargetAgent);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', font: '500 10.5px/1 Inter, sans-serif' }}>
      <span style={{ color: 'var(--p-text-mute)', marginRight: 2 }}>Ask:</span>
      {CHIPS.map((c) => {
        const active = target === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => setTargetAgent(c.key)}
            aria-pressed={active}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 8px',
              borderRadius: 999,
              border: '1px solid var(--p-border)',
              background: active ? 'var(--p-surface-hi)' : 'transparent',
              color: active ? 'var(--p-text)' : 'var(--p-text-mute)',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
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
