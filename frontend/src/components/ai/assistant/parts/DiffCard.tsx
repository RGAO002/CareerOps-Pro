// frontend/src/components/ai/assistant/parts/DiffCard.tsx
'use client';
import { useState } from 'react';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { applySuggestions } from '@/components/ai/applySuggestion';

interface Props { suggestionId: string }

/**
 * Single shared card used by both Chat (inline diff) and Suggestions tab.
 * Renders an op-aware before/after summary for `update` (others get a one-liner
 * scope summary, no strikethrough — v0).
 */
export function DiffCard({ suggestionId }: Props) {
  const sug = useSuggestionStore((s) => s.byId[suggestionId]) as Suggestion | undefined;
  const [working, setWorking] = useState(false);
  if (!sug) return null;

  const isPending = sug.status === 'pending' || sug.status === 'streaming';

  const onAccept = async () => {
    setWorking(true);
    try { await applySuggestions([sug.id]); } finally { setWorking(false); }
  };
  const onReject = async () => {
    setWorking(true);
    try {
      useSuggestionStore.getState().markStatusLocally(sug.id, 'rejected');
      await useSuggestionStore.getState().postStatusToBackend(sug.id, 'rejected');
    } finally { setWorking(false); }
  };

  const scopeLabel = labelForSuggestion(sug);

  return (
    <div style={{
      background: 'var(--p-surface)', border: '1px solid var(--p-border)',
      borderRadius: 10, overflow: 'hidden', marginTop: 6,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--p-border)' }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', font: '500 11px/1 Inter, sans-serif', color: 'var(--p-text-body)' }}>
          <i style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--p-accent)' }} />
          <span>AI</span>
          <small style={{ color: 'var(--p-text-mute)', fontWeight: 400 }}>· {scopeLabel}</small>
        </div>
        <span style={{
          font: '500 9.5px/1 Inter, sans-serif',
          padding: '3px 7px', borderRadius: 999,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          background: 'var(--p-accent-muted)', color: 'var(--p-accent-warm)',
        }}>{labelForOp(sug)}</span>
      </div>

      {/* Body */}
      <div style={{ padding: '11px 12px', font: '400 12.5px/1.6 Inter, sans-serif', color: 'var(--p-text-body)' }}>
        {sug.op === 'update' && (
          <>
            <span style={{
              display: 'block', color: 'var(--p-text-dim)',
              textDecorationLine: 'line-through', textDecorationColor: 'var(--p-text-dim)',
              textDecorationThickness: 1, marginBottom: 6,
            }}>{stringify(sug.before)}</span>
            <span style={{ display: 'block', color: 'var(--p-text)' }}>{stringify(sug.after)}</span>
          </>
        )}
        {sug.op === 'insert' && <span>Insert a new {sug.insertedBlock.kind}.</span>}
        {sug.op === 'delete' && <span>Delete the {sug.deletedBlock.kind}.</span>}
        {sug.op === 'move'   && <span>Move block.</span>}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '8px 12px', borderTop: '1px solid var(--p-border)' }}>
        {isPending ? (
          <>
            <button type="button" onClick={onAccept} disabled={working}
              style={{ background: 'var(--p-accent)', color: 'oklch(0.99 0.003 70)', border: 0, padding: '5px 12px', borderRadius: 6, font: '500 11.5px/1 Inter, sans-serif', cursor: 'pointer' }}>
              Accept
            </button>
            <button type="button" onClick={() => { /* v0: noop, hook in tweak flow later */ }} disabled
              style={{ background: 'transparent', color: 'var(--p-text-mute)', border: '1px solid var(--p-border)', padding: '5px 12px', borderRadius: 6, font: '500 11.5px/1 Inter, sans-serif', cursor: 'not-allowed', opacity: 0.6 }}>
              Tweak
            </button>
            <button type="button" onClick={onReject} disabled={working}
              style={{ background: 'transparent', color: 'var(--p-text-mute)', border: 0, padding: '5px 8px', borderRadius: 6, font: '500 11.5px/1 Inter, sans-serif', cursor: 'pointer' }}>
              Reject
            </button>
          </>
        ) : (
          <span style={{ color: 'var(--p-text-mute)', font: '500 11px/1 Inter, sans-serif' }}>{sug.status}</span>
        )}
      </div>
    </div>
  );
}

function labelForOp(s: Suggestion): string {
  switch (s.op) { case 'update': return 'Rewrite'; case 'insert': return 'Insert'; case 'delete': return 'Delete'; case 'move': return 'Move'; }
}
function labelForSuggestion(s: Suggestion): string {
  if (s.op === 'update' && 'kind' in s.field) return `${s.field.kind}`;
  if (s.op === 'insert') return `into ${s.parentId.slice(0, 6)}…`;
  if (s.op === 'delete') return `${s.deletedBlock.kind}`;
  if (s.op === 'move')   return `block ${s.blockId.slice(0, 6)}…`;
  return '';
}
function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
