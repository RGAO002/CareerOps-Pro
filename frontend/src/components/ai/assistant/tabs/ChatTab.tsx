// frontend/src/components/ai/assistant/tabs/ChatTab.tsx
'use client';
import { useConversationStore, type Message } from '@/stores/conversation';
import { DiffCard } from '../parts/DiffCard';

export function ChatTab() {
  const messages = useConversationStore((s) => s.messages);
  if (messages.length === 0) {
    return (
      <p style={{ color: 'var(--p-text-mute)', font: 'var(--ai-w-body) 12px/1.5 var(--ai-font)' }}>
        No conversation yet. Type a request below or click <em>Ask AI</em> on a resume section.
      </p>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {messages.map((m) => <MessageRow key={m.id} m={m} />)}
    </div>
  );
}

function MessageRow({ m }: { m: Message }) {
  if (m.kind === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '82%',
          padding: '9px 14px',
          borderRadius: '14px 14px 4px 14px',
          background: 'var(--p-surface-hi)',
          border: '1px solid var(--p-border2)',
          color: 'oklch(0.82 0.012 52)',
          font: 'var(--ai-w-body) 13px/1.55 var(--ai-font)',
          whiteSpace: 'pre-wrap',
        }}>{m.content}</div>
      </div>
    );
  }
  if (m.kind === 'ai-text') {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <i style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 999, background: 'var(--p-accent)', marginTop: 7 }} />
        <div style={{ font: 'var(--ai-w-body) 13px/1.65 var(--ai-font)', color: 'var(--p-text-body)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
      </div>
    );
  }
  // ai-diff
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <i style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 999, background: 'var(--p-accent)', marginTop: 7 }} />
      <div style={{ flex: 1 }}><DiffCard suggestionId={m.suggestionId} /></div>
    </div>
  );
}
