// PaginationPlugin + LayoutEngine unit tests (T32).
//
// Covers:
//   - LayoutEngine F3 position-based measurement (the M1 PoC finding).
//   - Fixed-grid pageGeometries.
//   - PaginationPlugin emits widget BreakDecorations matching pageBreaks.
//   - tr.docChanged + tr.getMeta('forceLayout') trigger re-layout.
//   - rAF debounce: multi-tx-per-frame collapses to one pass.
//   - Incremental diff: typing inside an existing row (same nodeSize/kind)
//     does NOT trigger a layout pass.
//   - F1 selector contract: row walk uses ':scope > div > .row'.
//   - Performance smoke: 50-row doc + 60 transactions/sec runs reasonably.

import { describe, it, expect, afterEach } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';

import { computeLayout } from '../../layout/LayoutEngine';
import {
  createPaginationPlugin,
  paginationPluginKey,
  requestPaginationLayout,
} from '../PaginationPlugin';

// --- helpers ----------------------------------------------------------------

function makeRowEl(heightPx: number, topPx: number = 0): HTMLElement {
  const el = document.createElement('div');
  el.className = 'row';
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      height: heightPx,
      top: topPx,
      bottom: topPx + heightPx,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: topPx,
      toJSON: () => ({}),
    }),
  });
  return el;
}

// Minimal schema: a single 'row' node with id attr; doc = row+.
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

function makeRow(id: string, text = ' '): ReturnType<typeof schema.nodes.row.create> {
  return schema.nodes.row.create({ id }, schema.text(text));
}

function makeDoc(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, i) => makeRow(`r${i}`, `row${i}`));
  return schema.node('doc', null, rows);
}

interface TestEditor {
  view: EditorView;
  layoutCalls: Array<{ ranLayout: boolean; layoutMs: number; pageBreaksLen: number }>;
  destroy: () => void;
}

function bootEditor(opts: {
  rowCount: number;
  rowHeights: Map<string, number>;
  pageHeightPx?: number;
  syncSchedule?: boolean;
}): TestEditor {
  const place = document.createElement('div');
  document.body.appendChild(place);

  const layoutCalls: TestEditor['layoutCalls'] = [];

  const state = EditorState.create({
    schema,
    doc: makeDoc(opts.rowCount),
    plugins: [
      createPaginationPlugin({
        pageHeightPx: opts.pageHeightPx ?? 1000,
        __syncSchedule: opts.syncSchedule ?? true,
        __testRowHeights: opts.rowHeights,
        __testMargins: { marginTopPx: 100, marginBottomPx: 100, screenGapPx: 32 },
        __onLayout: (out, info) => {
          layoutCalls.push({
            ranLayout: info.ranLayout,
            layoutMs: info.layoutMs,
            pageBreaksLen: out.pageBreaks.length,
          });
        },
      }),
    ],
  });

  const view = new EditorView(place, { state });

  return {
    view,
    layoutCalls,
    destroy: () => {
      view.destroy();
      place.remove();
    },
  };
}

// Microtask drain — when __syncSchedule:true the plugin uses queueMicrotask,
// so awaiting a resolved Promise twice flushes the pending layout pass.
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// --- LayoutEngine -----------------------------------------------------------

describe('LayoutEngine.computeLayout', () => {
  const baseInput = { pageHeightPx: 1000, marginTopPx: 100, marginBottomPx: 100, screenGapPx: 32 };

  it('returns pageBreaks=[] and one pageGeometry when all rows fit on a single page', () => {
    const rows = [makeRowEl(100, 0), makeRowEl(200, 100), makeRowEl(300, 300)];
    const out = computeLayout({ ...baseInput, rowElements: rows });
    expect(out.pageBreaks).toEqual([]);
    expect(out.pageGeometries).toEqual([{ pageIndex: 0, topPx: 0, heightPx: 1000 }]);
  });

  it('produces fixed-grid pageGeometries: topPx = pageIndex * (pageHeight + screenGap)', () => {
    // 6 rows of 400 stacked at top=0,400,800,1200,1600,2000. contentHeight=800.
    const rows = [0, 400, 800, 1200, 1600, 2000].map((t) => makeRowEl(400, t));
    const out = computeLayout({ ...baseInput, rowElements: rows });
    expect(out.pageGeometries.map((g) => g.topPx)).toEqual([0, 1032, 2064]);
    expect(out.pageGeometries.every((g) => g.heightPx === 1000)).toBe(true);
  });

  // F3 PROOF — position-based measurement honors inter-row margins.
  // Setup: 3 rows of height=300 each. Without margins the doc total = 900,
  // which fits in contentHeight=800 with one break (sum = 900 → break before
  // row 2 since 600+300>800). Now ADD a 100px margin between row 0 and row 1
  // (manifested in row 1's rect.top = 400 instead of 300). Sum-of-heights
  // would still see 900 and break before row 2. Position math sees row 1's
  // bottom at 400+300=700 (fits), and row 2's top at 800 → row 2 bottom is
  // 800+300=1100 > 800, so break BEFORE row 2 — but the *remaining-space*
  // at the breaking page is now 800-800=0 (vs 800-600=200 for sum-math).
  // The screenHeightPx differs:
  //   sum-math:      remaining=200; screenHeightPx = 200+100+32+100 = 432
  //   position-math: remaining=0;   screenHeightPx = 0+100+32+100   = 232
  // So we can detect F3 encoding by asserting screenHeightPx == 232.
  it('position-based measurement honors inter-row margins (F3 contract)', () => {
    const rows = [
      makeRowEl(300, 0),     // row 0: top=0
      makeRowEl(300, 400),   // row 1: top=400 (100px margin gap before it)
      makeRowEl(300, 800),   // row 2: top=800 (would overflow; break before)
    ];
    const out = computeLayout({ ...baseInput, rowElements: rows });
    expect(out.pageBreaks).toHaveLength(1);
    expect(out.pageBreaks[0].afterRowIndex).toBe(1);
    // Position-math evidence: remaining-space at break = 0 (row 1 bottom at
    // 700, row 2 top at 800 → contentHeight−800=0; row 2 must move).
    // Wait — our anchor is firstRowTop=0 so contentHeight budget is 800,
    // row 2 top=800, remaining = 800-800 = 0 → screen height 232.
    // Sum-math (incorrect) would yield 432 because it misses the 100px gap.
    expect(out.pageBreaks[0].screenHeightPx).toBe(232);
  });

  it('handles single tall row that exceeds page (no break, no infinite loop)', () => {
    const rows = [makeRowEl(2000, 0)];
    const out = computeLayout({ ...baseInput, rowElements: rows });
    expect(out.pageBreaks).toEqual([]);
    expect(out.pageGeometries).toHaveLength(1);
  });
});

// --- PaginationPlugin -------------------------------------------------------

describe('PaginationPlugin', () => {
  let editor: TestEditor;

  afterEach(() => {
    editor?.destroy?.();
  });

  it('initial mount produces pageGeometries + decorations matching pageBreaks', async () => {
    // 3 rows × 400 height → contentHeight=800 → break after row 1 → 2 pages.
    const heights = new Map([['r0', 400], ['r1', 400], ['r2', 400]]);
    editor = bootEditor({ rowCount: 3, rowHeights: heights });
    await flush();

    const s = paginationPluginKey.getState(editor.view.state)!;
    expect(s.pageGeometries).toHaveLength(2);
    expect(s.pageGeometries[1].topPx).toBe(1032);
    // One break decoration emitted.
    const dec = s.decorations.find();
    expect(dec).toHaveLength(1);
  });

  it('subscribes to tr.docChanged: a doc-changing tx triggers re-layout', async () => {
    const heights = new Map([['r0', 400], ['r1', 400]]);
    editor = bootEditor({ rowCount: 2, rowHeights: heights });
    await flush();
    const beforeCount = editor.layoutCalls.length;

    // Append a 3rd row that overflows page 1.
    heights.set('r2', 400);
    const tr = editor.view.state.tr.replaceWith(
      editor.view.state.doc.content.size,
      editor.view.state.doc.content.size,
      makeRow('r2', 'three'),
    );
    editor.view.dispatch(tr);
    await flush();

    expect(editor.layoutCalls.length).toBeGreaterThan(beforeCount);
    const last = editor.layoutCalls[editor.layoutCalls.length - 1];
    expect(last.ranLayout).toBe(true);
    expect(last.pageBreaksLen).toBe(1);
  });

  it("subscribes to tr.getMeta('forceLayout'): forces a layout pass even with no doc change", async () => {
    const heights = new Map([['r0', 100]]);
    editor = bootEditor({ rowCount: 1, rowHeights: heights });
    await flush();
    const beforeCount = editor.layoutCalls.length;

    requestPaginationLayout(editor.view);
    await flush();

    const newCalls = editor.layoutCalls.length - beforeCount;
    expect(newCalls).toBeGreaterThanOrEqual(1);
    // Force always runs layout (ranLayout=true) even though sigs are unchanged.
    expect(editor.layoutCalls[editor.layoutCalls.length - 1].ranLayout).toBe(true);
  });

  it('debounces multi-tx-per-frame: 5 sync dispatches → at most 1 layout pass', async () => {
    const heights = new Map([['r0', 400], ['r1', 400]]);
    editor = bootEditor({ rowCount: 2, rowHeights: heights });
    await flush();
    const beforeCount = editor.layoutCalls.length;

    // 5 dispatches in same microtask — all collapse into one scheduled pass.
    for (let i = 0; i < 5; i++) {
      const tr = editor.view.state.tr.setMeta('forceLayout', true).setMeta('addToHistory', false);
      editor.view.dispatch(tr);
    }
    await flush();

    const passes = editor.layoutCalls.length - beforeCount;
    expect(passes).toBe(1);
  });

  it('incremental diff: editing inside a row without changing nodeSize/kind skips layout', async () => {
    const heights = new Map([['r0', 100], ['r1', 100]]);
    editor = bootEditor({ rowCount: 2, rowHeights: heights });
    await flush();
    const beforeCount = editor.layoutCalls.length;

    // Replace text inside row 0 with text of the SAME length so nodeSize is
    // unchanged. The plugin should compute structural row sigs as identical
    // and SKIP the layout pass (ranLayout=false).
    const doc = editor.view.state.doc;
    let r0Start = -1;
    let r0End = -1;
    let pos = 0;
    doc.forEach((node) => {
      if (node.attrs.id === 'r0') {
        r0Start = pos + 1; // inside row content
        r0End = pos + node.nodeSize - 1;
      }
      pos += node.nodeSize;
    });
    expect(r0Start).toBeGreaterThan(0);
    // Existing content is "row0" (4 chars). Replace with "ROWX" (also 4 chars).
    const tr = editor.view.state.tr.replaceWith(r0Start, r0End, schema.text('ROWX'));
    editor.view.dispatch(tr);
    await flush();

    const newPasses = editor.layoutCalls.slice(beforeCount);
    expect(newPasses.length).toBeGreaterThan(0);
    // All new passes should report ranLayout=false (skip).
    expect(newPasses.every((c) => c.ranLayout === false)).toBe(true);
  });

  it("F1 wrapper-aware selector: row walk uses ':scope > div > .row' (encoded in source)", async () => {
    // Read the production file at runtime and assert the selector is present
    // and that the bare ':scope > .row' pattern is NOT used. This catches
    // accidental regressions in future edits.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const here = path.dirname(new URL(import.meta.url).pathname);
    const src = await fs.readFile(path.resolve(here, '..', 'PaginationPlugin.ts'), 'utf-8');
    expect(src).toContain(":scope > div > .row");
    // Bare ':scope > .row' (without the wrapper div) must not appear.
    expect(src).not.toMatch(/:scope\s*>\s*\.row/);
  });

  it('measurement pass hides stale pagination-break widgets before reading row rects', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const here = path.dirname(new URL(import.meta.url).pathname);
    const pluginSrc = await fs.readFile(path.resolve(here, '..', 'PaginationPlugin.ts'), 'utf-8');
    const cssSrc = await fs.readFile(path.resolve(here, '..', '..', 'EditorPageV3.css'), 'utf-8');

    expect(pluginSrc).toContain('v3-pagination-measuring');
    expect(pluginSrc).toContain('classList.add(MEASURING_CLASS)');
    expect(pluginSrc).toContain('classList.remove(MEASURING_CLASS)');
    expect(cssSrc).toContain('.v3-editor-canvas-root .v3-pagination-measuring .pagination-break');
    expect(cssSrc).toContain('display: none !important');
  });

  it('perf smoke: 50-row doc + 60 transactions/sec → p50 layout < 50ms (CI threshold; T35 enforces 16ms)', async () => {
    const rowCount = 50;
    const heights = new Map<string, number>();
    for (let i = 0; i < rowCount; i++) heights.set(`r${i}`, 30);
    editor = bootEditor({ rowCount, rowHeights: heights });
    await flush();

    // Reset and capture only forced passes (each tx is forceLayout to ensure
    // ranLayout=true, simulating worst-case 60Hz layout).
    editor.layoutCalls.length = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const tr = editor.view.state.tr.setMeta('forceLayout', true).setMeta('addToHistory', false);
      editor.view.dispatch(tr);
      await flush();
    }
    const ranPasses = editor.layoutCalls.filter((c) => c.ranLayout);
    expect(ranPasses.length).toBe(N);
    const sorted = ranPasses.map((c) => c.layoutMs).sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length / 2)];
    // Relaxed CI threshold; strict 16ms is enforced by Playwright in T35.
    expect(p50).toBeLessThan(50);
  });
});
