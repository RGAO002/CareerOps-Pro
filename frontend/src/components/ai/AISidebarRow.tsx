// frontend/src/components/ai/AISidebarRow.tsx
'use client';
import { useState } from 'react';
import type { Suggestion } from '@/stores/aiSuggestion';
import { applySuggestion } from './applySuggestion';
import { useSuggestionStore } from '@/stores/aiSuggestion';

interface Props {
  suggestion: Suggestion;
}

export function AISidebarRow({ suggestion: s }: Props) {
  const [working, setWorking] = useState(false);
  const isStreaming = s.status === 'streaming';
  const isSuperseded = s.status === 'superseded';

  async function onAccept() {
    setWorking(true);
    try { await applySuggestion(s.id); } finally { setWorking(false); }
  }
  async function onReject() {
    setWorking(true);
    try {
      useSuggestionStore.getState().markStatusLocally(s.id, 'rejected');
      await useSuggestionStore.getState().postStatusToBackend(s.id, 'rejected');
    } finally { setWorking(false); }
  }

  return (
    <div
      data-testid={`ai-row-${s.id}`}
      style={{
        background: '#fff',
        border: '1px solid #e0d8c9',
        borderRadius: 4,
        padding: '8px 10px',
        marginBottom: 6,
        opacity: isSuperseded ? 0.5 : 1,
      }}
    >
      <div style={{ fontSize: 11, color: '#6b6258', marginBottom: 4 }}>
        {_blockPathLabel(s)} · {s.agentId}
      </div>
      <div style={{ fontSize: 12 }}>
        {_renderDiff(s)}
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
        <button
          onClick={onAccept}
          disabled={working || isStreaming || isSuperseded}
          style={_btnStyle(false)}
        >
          {isStreaming ? '✦ generating…' : '✓ Accept'}
        </button>
        <button
          onClick={onReject}
          disabled={working || isStreaming}
          style={_btnStyle(true)}
        >
          ✗ Reject
        </button>
      </div>
      {isSuperseded && (
        <div style={{ marginTop: 4, fontSize: 11, color: '#aa3333' }}>
          已被你修改 — 跳过
        </div>
      )}
    </div>
  );
}

function _renderDiff(s: Suggestion): string {
  switch (s.op) {
    case 'update':
      return `${_short(s.before)} → ${_short(s.after)}`;
    case 'insert':
      return `+ insert at ${s.parentId}[${s.atIndex}]`;
    case 'delete':
      return `− delete ${s.blockId}`;
    case 'move':
      return `↕ move ${s.blockId}`;
  }
}

function _short(v: unknown): string {
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  return JSON.stringify(v).slice(0, 60);
}

function _blockPathLabel(s: Suggestion): string {
  if (s.op === 'update') {
    if ('id' in s.field) return `${s.field.kind}:${s.field.id}`;
    return s.field.kind;
  }
  if (s.op === 'insert') return `insert into ${s.parentId}`;
  if (s.op === 'delete') return `delete ${s.blockId}`;
  return `move ${s.blockId}`;
}

function _btnStyle(reject: boolean): React.CSSProperties {
  return {
    background: reject ? '#aa3333' : '#1c6b1c',
    color: '#fff',
    border: 'none',
    borderRadius: 3,
    padding: '3px 8px',
    fontSize: 11,
    cursor: 'pointer',
  };
}
