// frontend/src/components/resume/v3/layers/__tests__/PageChromeLayer.test.tsx
//
// T33 — PageChromeLayer tests.
//
// Coverage:
//   - Renders one card per pageGeometry emitted by PaginationPlugin
//   - Each card's top/height matches geometry pixel-perfect
//   - Cards carry the v3-page-chrome-card class so the @media print rule
//     (display: none) applies — checked via CSS-rule introspection on the
//     PageChromeLayer.css module
//   - Does NOT call computeLayout (C3 paint-only contract spot-check)
//   - Re-renders when paginationPluginKey state changes
//   - Empty geometry renders the layer with zero cards (no crash)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as React from 'react';

import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';

// Spy on computeLayout BEFORE importing PageChromeLayer (the layer should
// never call it; this is the C3 paint-only spot-check).
import * as LayoutEngineModule from '../../layout/LayoutEngine';
const computeLayoutSpy = vi.spyOn(LayoutEngineModule, 'computeLayout');

import { PageChromeLayer } from '../PageChromeLayer';
import {
  paginationPluginKey,
  type PaginationPluginState,
} from '../../plugins/PaginationPlugin';
import type { PageGeometry } from '../../layout/LayoutEngine';

// --- helpers ---------------------------------------------------------------

// Minimal schema (matches PaginationPlugin.test.ts).
const schema = new Schema({
  nodes: {
    doc: { content: 'row+' },
    text: {},
    row: {
      attrs: { id: { default: '' } },
      content: 'text*',
      toDOM: () => ['div', { class: 'row' }, 0],
    },
  },
});

function makeDoc() {
  const row = schema.nodes.row.create({ id: 'r0' }, schema.text(' '));
  return schema.node('doc', null, [row]);
}

/**
 * Build a stub plugin that registers under the same paginationPluginKey, so
 * getPaginationState(state) reads our seeded value. We use apply() to swap in
 * geometry from a meta payload, mirroring the production plugin's contract.
 */
function makeStubPlugin(initial: PaginationPluginState) {
  return new Plugin<PaginationPluginState>({
    key: paginationPluginKey,
    state: {
      init: () => initial,
      apply(tr, old) {
        const next = tr.getMeta(paginationPluginKey) as
          | Partial<PaginationPluginState>
          | undefined;
        if (!next) return old;
        return {
          pageGeometries: next.pageGeometries ?? old.pageGeometries,
          decorations: next.decorations ?? old.decorations,
          forceLayoutToken: next.forceLayoutToken ?? old.forceLayoutToken,
        };
      },
    },
  });
}

interface TxListener {
  (): void;
}

/**
 * Minimal Editor stub matching the surface PageChromeLayer uses:
 *   - `state` (EditorState)
 *   - `on('transaction', cb)` / `off('transaction', cb)`
 * Plus a helper to push a new state and fire the listener (mirrors what
 * TipTap's Editor would do when a transaction is dispatched).
 */
function makeFakeEditor(initialGeometries: PageGeometry[]) {
  const stubPlugin = makeStubPlugin({
    pageGeometries: initialGeometries,
    decorations: DecorationSet.empty,
    forceLayoutToken: 0,
  });

  let state = EditorState.create({
    schema,
    doc: makeDoc(),
    plugins: [stubPlugin],
  });
  const listeners: TxListener[] = [];

  const editor = {
    get state() {
      return state;
    },
    on(event: string, cb: TxListener) {
      if (event === 'transaction') listeners.push(cb);
    },
    off(event: string, cb: TxListener) {
      if (event !== 'transaction') return;
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    },
  };

  function setGeometries(next: PageGeometry[]) {
    const tr = state.tr.setMeta(paginationPluginKey, {
      pageGeometries: next,
    } satisfies Partial<PaginationPluginState>);
    state = state.apply(tr);
    // Fire all listeners (TipTap fires 'transaction' on every dispatch).
    listeners.slice().forEach((l) => l());
  }

  return { editor, setGeometries, listenerCount: () => listeners.length };
}

// --- tests -----------------------------------------------------------------

beforeEach(() => {
  computeLayoutSpy.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('PageChromeLayer', () => {
  it('renders one .v3-page-chrome-card per pageGeometry', () => {
    const geoms: PageGeometry[] = [
      { pageIndex: 0, topPx: 0, heightPx: 1056 },
      { pageIndex: 1, topPx: 1088, heightPx: 1056 },
      { pageIndex: 2, topPx: 2176, heightPx: 1056 },
    ];
    const { editor } = makeFakeEditor(geoms);

    const { container } = render(
      <PageChromeLayer editor={editor as unknown as never} />,
    );

    const cards = container.querySelectorAll('.v3-page-chrome-card');
    expect(cards.length).toBe(3);
  });

  it("each card's top/height matches geometry pixel-perfect", () => {
    const geoms: PageGeometry[] = [
      { pageIndex: 0, topPx: 0, heightPx: 1056 },
      { pageIndex: 1, topPx: 1088, heightPx: 1056 },
    ];
    const { editor } = makeFakeEditor(geoms);

    const { container } = render(
      <PageChromeLayer editor={editor as unknown as never} />,
    );

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>('.v3-page-chrome-card'),
    );
    expect(cards.length).toBe(2);

    cards.forEach((card, i) => {
      const g = geoms[i];
      expect(card.style.top).toBe(`${g.topPx}px`);
      expect(card.style.height).toBe(`${g.heightPx}px`);
      // Plugin-source data attrs preserved verbatim — proves no chrome math.
      expect(card.getAttribute('data-plugin-top')).toBe(String(g.topPx));
      expect(card.getAttribute('data-plugin-height')).toBe(String(g.heightPx));
    });
  });

  it('does NOT call computeLayout (C3 paint-only spot-check)', () => {
    const geoms: PageGeometry[] = [{ pageIndex: 0, topPx: 0, heightPx: 1056 }];
    const { editor, setGeometries } = makeFakeEditor(geoms);

    render(<PageChromeLayer editor={editor as unknown as never} />);

    // Trigger a state change too — the layer must still not call layout.
    act(() => {
      setGeometries([
        { pageIndex: 0, topPx: 0, heightPx: 1056 },
        { pageIndex: 1, topPx: 1088, heightPx: 1056 },
      ]);
    });

    expect(computeLayoutSpy).not.toHaveBeenCalled();
  });

  it('re-renders when paginationPluginKey state changes', () => {
    const { editor, setGeometries } = makeFakeEditor([
      { pageIndex: 0, topPx: 0, heightPx: 1056 },
    ]);

    const { container } = render(
      <PageChromeLayer editor={editor as unknown as never} />,
    );
    expect(container.querySelectorAll('.v3-page-chrome-card').length).toBe(1);

    act(() => {
      setGeometries([
        { pageIndex: 0, topPx: 0, heightPx: 1056 },
        { pageIndex: 1, topPx: 1088, heightPx: 1056 },
        { pageIndex: 2, topPx: 2176, heightPx: 1056 },
      ]);
    });

    expect(container.querySelectorAll('.v3-page-chrome-card').length).toBe(3);
  });

  it('handles empty geometry gracefully (no cards)', () => {
    const { editor } = makeFakeEditor([]);
    const { container } = render(
      <PageChromeLayer editor={editor as unknown as never} />,
    );
    const layer = container.querySelector('.v3-page-chrome-layer');
    expect(layer).not.toBeNull();
    expect(container.querySelectorAll('.v3-page-chrome-card').length).toBe(0);
  });

  it('renders nothing when editor is null', () => {
    const { container } = render(<PageChromeLayer editor={null} />);
    expect(container.querySelector('.v3-page-chrome-layer')).toBeNull();
  });

  it('detaches transaction listener on unmount', () => {
    const { editor, listenerCount } = makeFakeEditor([
      { pageIndex: 0, topPx: 0, heightPx: 1056 },
    ]);

    const { unmount } = render(
      <PageChromeLayer editor={editor as unknown as never} />,
    );
    expect(listenerCount()).toBe(1);

    unmount();
    expect(listenerCount()).toBe(0);
  });

  it('CSS module declares @media print { display: none } for the layer', async () => {
    // Read the CSS source directly — Vitest doesn't apply @media rules in
    // jsdom/happy-dom, but the contract is that the bundled CSS contains the
    // rule. This proves the rule shipped without relying on the test runner
    // simulating print media.
    const fs = await import('fs');
    const path = await import('path');
    const cssPath = path.resolve(__dirname, '..', 'PageChromeLayer.css');
    const cssText = fs.readFileSync(cssPath, 'utf8');
    // Normalize whitespace and assert both the selector and the display:none.
    const collapsed = cssText.replace(/\s+/g, ' ');
    expect(collapsed).toMatch(
      /@media print \{ \.v3-page-chrome-layer \{ display: none;? \} \}/,
    );
  });
});
