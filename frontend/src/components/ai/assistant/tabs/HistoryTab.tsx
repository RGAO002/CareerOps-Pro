// frontend/src/components/ai/assistant/tabs/HistoryTab.tsx
'use client';
export function HistoryTab() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 200, gap: 14,
      color: 'var(--p-text-mute)', textAlign: 'center', padding: 24,
    }}>
      <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="var(--p-accent-muted)" strokeWidth={1.5} aria-hidden>
        <polygon points="12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5" />
      </svg>
      <span style={{ font: '500 13px/1.4 Inter, sans-serif', color: 'var(--p-text-body)' }}>History · Coming soon</span>
      <span style={{ font: '400 11.5px/1.5 Inter, sans-serif' }}>Past conversations will appear here once enabled.</span>
    </div>
  );
}
