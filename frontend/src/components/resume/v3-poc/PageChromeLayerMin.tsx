'use client';
import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { paginationPluginKey, type PaginationPluginState } from './PaginationPluginMin';

interface Props { editor: Editor | null }

export function PageChromeLayerMin({ editor }: Props) {
  const [state, setState] = useState<PaginationPluginState | null>(null);

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const s = paginationPluginKey.getState(editor.state);
      if (s) setState({ ...s });
    };
    handler();                             // initial
    editor.on('update', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('update', handler);
      editor.off('transaction', handler);
    };
  }, [editor]);

  if (!state) return null;
  return (
    <div className="page-chrome-layer" aria-hidden>
      {state.pageGeometries.map((g) => (
        <div
          key={g.pageIndex}
          className="page-card"
          // Data attributes record the plugin-source geometry verbatim so PoC C
          // can verify PageChromeLayer is a pure pass-through (C3 single SoT).
          // The CSS position values come from the SAME numbers — any drift
          // indicates the chrome is doing its own math, which violates contract.
          data-plugin-top={g.topPx}
          data-plugin-height={g.heightPx}
          style={{
            position: 'absolute',
            top: g.topPx,
            height: g.heightPx,
            left: 0,
            right: 0,
          }}
        />
      ))}
    </div>
  );
}
