// frontend/src/components/ai/assistant/tabs/SuggestionsTab.tsx
'use client';
import { useState } from 'react';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { applySuggestions } from '@/components/ai/applySuggestion';
import { DiffCard } from '../parts/DiffCard';

export function SuggestionsTab() {
  const byId = useSuggestionStore((s) => s.byId);
  const all = Object.values(byId) as Suggestion[];
  const pending = all.filter((s) => s.status === 'pending' || s.status === 'streaming');
  const [working, setWorking] = useState(false);

  const onAcceptAll = async () => {
    setWorking(true);
    try { await applySuggestions(pending.map((s) => s.id)); } finally { setWorking(false); }
  };
  const onRejectAll = async () => {
    setWorking(true);
    try {
      for (const s of pending) {
        useSuggestionStore.getState().markStatusLocally(s.id, 'rejected');
        await useSuggestionStore.getState().postStatusToBackend(s.id, 'rejected');
      }
    } finally { setWorking(false); }
  };

  if (pending.length === 0) {
    return (
      <p style={{ color: 'var(--p-text-mute)', font: 'var(--ai-w-body) 12px/1.5 var(--ai-font)' }}>
        No pending changes.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderRadius: 10,
        background: 'var(--p-surface)', border: '1px solid var(--p-border)',
        font: 'var(--ai-w-ui) 12px/1 var(--ai-font)', color: 'var(--p-text-body)',
      }}>
        <span>{pending.length} pending</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={onAcceptAll} disabled={working}
            style={{ background: 'var(--p-accent)', color: 'oklch(0.99 0.003 70)', border: 0, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', font: 'var(--ai-w-ui) 11px/1 var(--ai-font)' }}>
            Accept all
          </button>
          <button type="button" onClick={onRejectAll} disabled={working}
            style={{ background: 'transparent', color: 'var(--p-text-mute)', border: '1px solid var(--p-border)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', font: 'var(--ai-w-ui) 11px/1 var(--ai-font)' }}>
            Reject all
          </button>
        </span>
      </div>

      {pending.map((s) => <DiffCard key={s.id} suggestionId={s.id} />)}
    </div>
  );
}
