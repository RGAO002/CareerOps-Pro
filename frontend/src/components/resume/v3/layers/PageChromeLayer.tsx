// frontend/src/components/resume/v3/layers/PageChromeLayer.tsx
//
// T33 — Production PageChromeLayer.
//
// Paint-only paper-card chrome (C3 strict). This component:
//   - Reads pageGeometries from PaginationPlugin via getPaginationState(state)
//   - Subscribes to editor transactions via editor.on('transaction', ...)
//   - Renders absolute-positioned page cards using the geometry verbatim
//   - NEVER calls a layout function — pure pass-through from plugin state
//
// Spec ref: § 4.4. Reuses the v2/PoC paper card visual treatment
// (white background + soft shadow), and applies @media print { display:none }
// via CSS class so the chrome doesn't double up on the printer's media.

'use client';

import * as React from 'react';
import type { Editor } from '@tiptap/core';

import {
  getPaginationState,
  type PaginationPluginState,
} from '../plugins/PaginationPlugin';

import './PageChromeLayer.css';

interface Props {
  /** TipTap editor instance. Layer subscribes to its transactions. */
  editor: Editor | null;
}

export function PageChromeLayer({ editor }: Props) {
  const [state, setState] = React.useState<PaginationPluginState | null>(() =>
    editor ? getPaginationState(editor.state) : null,
  );

  React.useEffect(() => {
    if (!editor) {
      setState(null);
      return;
    }
    const handler = () => {
      // Pure read — never recompute layout here. C3 contract.
      const s = getPaginationState(editor.state);
      // Spread to ensure React re-renders even when the plugin returns the
      // same object reference across transactions that didn't touch our state.
      setState({ ...s });
    };
    handler(); // initial sync
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  if (!state) return null;

  return (
    <div className="v3-page-chrome-layer" aria-hidden="true">
      {state.pageGeometries.map((g) => (
        <div
          key={g.pageIndex}
          className="v3-page-chrome-card"
          data-v3-page-card
          data-page-index={g.pageIndex}
          // Geometry is taken verbatim from plugin state — single SoT (C3).
          data-plugin-top={g.topPx}
          data-plugin-height={g.heightPx}
          style={{
            top: g.topPx,
            height: g.heightPx,
          }}
        />
      ))}
    </div>
  );
}
