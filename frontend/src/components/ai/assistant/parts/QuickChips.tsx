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
            padding: '4px 8px', borderRadius: 999,
            border: '1px solid var(--p-border)', background: 'transparent',
            color: 'var(--p-text-mute)',
            font: '500 10.5px/1 Inter, sans-serif',
            cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--p-surface)'; e.currentTarget.style.color = 'var(--p-text-body)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--p-text-mute)'; }}
        >{c}</button>
      ))}
    </div>
  );
}
