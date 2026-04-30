// frontend/src/components/ai/assistant/parts/AgentChips.tsx
'use client';
import { useAssistantStore } from '@/stores/assistant';

type ChipKey = 'all' | 'recruit' | 'hm' | 'coach';
const CHIPS: Array<{ key: ChipKey; label: string; dotVar: string | null }> = [
  { key: 'all',     label: 'All agents',  dotVar: null },
  { key: 'recruit', label: 'Recruiter',   dotVar: 'var(--p-recruit)' },
  { key: 'hm',      label: 'HM',          dotVar: 'var(--p-hm)' },
  { key: 'coach',   label: 'Coach',       dotVar: 'var(--p-coach)' },
];

/**
 * Per design (.targets / .tgt): pill chips, hairline border, 5×5 dot for
 * persona color, hover lifts text + border, active uses surface-hi bg with
 * brighter text. Caller-side "Ask:" label hidden by design (labels none).
 *
 * Multi-select: individual agent chips toggle independently and drive the
 * FluidCanvas orb visibility. Auto-promote-to-all kicks in when the user
 * has all 3 individual chips on (handled in store.toggleAgent).
 */
export function AgentChips() {
  const agentMode = useAssistantStore((s) => s.agentMode);
  const agentMask = useAssistantStore((s) => s.agentMask);
  const selectAllAgents = useAssistantStore((s) => s.selectAllAgents);
  const toggleAgent = useAssistantStore((s) => s.toggleAgent);

  const isActive = (k: ChipKey): boolean => {
    if (k === 'all') return agentMode === 'all';
    if (agentMode === 'all') return false;
    return agentMask[k];
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {CHIPS.map((c) => {
        const active = isActive(c.key);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              if (c.key === 'all') selectAllAgents();
              else toggleAgent(c.key);
            }}
            aria-pressed={active}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px',
              borderRadius: 999,
              border: `1px solid ${active ? 'var(--p-border2)' : 'var(--p-border)'}`,
              background: active ? 'var(--p-surface-hi)' : 'transparent',
              color: active ? 'var(--p-text)' : 'var(--p-text-mute)',
              font: 'var(--ai-w-ui) 11px/1 var(--ai-font)',
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
