// frontend/src/components/ai/assistant/parts/QuickChips.tsx
'use client';
const CHIPS = ['Add metrics', 'Tighten', 'For Stripe APM', 'More technical'];

export function QuickChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {CHIPS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          style={{
            padding: '5px 10px', borderRadius: 999,
            border: '1px solid var(--p-border)', background: 'transparent',
            color: 'var(--p-text-mute)',
            font: 'var(--ai-w-ui) 11px/1 var(--ai-font)',
            cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--p-surface)'; e.currentTarget.style.color = 'var(--p-text-body)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--p-text-mute)'; }}
        >{c}</button>
      ))}
    </div>
  );
}
