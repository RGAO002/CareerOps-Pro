'use client';
import { useEffect, useState } from 'react';
import type { SlashItem } from '../extensions/SlashCommand';

type State = {
  visible: boolean;
  items: SlashItem[];
  onSelect: ((item: SlashItem) => void) | null;
  anchor: { x: number; y: number };
};

let setStateExternal: ((s: State) => void) | null = null;

export function showSlashMenu(items: SlashItem[], onSelect: (item: SlashItem) => void): void {
  const sel = window.getSelection();
  let anchor = { x: 100, y: 100 };
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    anchor = { x: rect.left, y: rect.bottom + 4 };
  }
  setStateExternal?.({ visible: true, items, onSelect, anchor });
}

export function hideSlashMenu(): void {
  setStateExternal?.({ visible: false, items: [], onSelect: null, anchor: { x: 0, y: 0 } });
}

export function SlashMenu() {
  const [state, setState] = useState<State>({ visible: false, items: [], onSelect: null, anchor: { x: 0, y: 0 } });
  useEffect(() => { setStateExternal = setState; return () => { setStateExternal = null; }; }, []);
  if (!state.visible) return null;
  return (
    <div
      style={{
        position: 'fixed', top: state.anchor.y, left: state.anchor.x,
        background: 'white', border: '1px solid #ccc', borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: 4, zIndex: 9999,
      }}
    >
      {state.items.map(item => (
        <button
          key={item.id}
          onClick={() => state.onSelect?.(item)}
          style={{ display: 'block', width: '100%', padding: '6px 12px', textAlign: 'left', border: 0, background: 'transparent' }}
        >
          <div style={{ fontWeight: 500 }}>{item.title}</div>
          <div style={{ fontSize: 11, color: '#666' }}>{item.hint}</div>
        </button>
      ))}
    </div>
  );
}
