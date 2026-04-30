// T35 — M5 PaginationPlugin performance budget test.
//
// Goal: assert layout p50 stays under budget for a realistic 50-row doc with
// 60 transactions/sec (≈ 1 second of sustained typing). The strict target is
// 16ms p50 (one frame at 60Hz) but jsdom has no real layout/paint, so timing
// here is noisier and dominated by V8 + plugin scheduling overhead.
//
// CI threshold: 50ms p50 — same shape as the smoke in PaginationPlugin.test.ts
// (T32) but with a richer fixture (variable inter-row margins) to exercise the
// F3 position-based measurement path. The strict 16ms target is enforced in
// real Chromium via Playwright (T35 PDF e2e + manual perf runs).
//
// Reality check (intentionally documented):
//   - jsdom timing is NOT representative of real browser layout cost.
//   - The plugin uses __testRowHeights to skip getBoundingClientRect, so this
//     test measures plugin orchestration + layout math, not DOM measurement.
//   - p50 in real Chromium for a 50-row doc is typically <2ms; the 16ms
//     budget is the frame budget, enforced manually for now.

import { describe, it, expect, afterEach } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';

import {
  createPaginationPlugin,
  paginationPluginKey,
} from '../PaginationPlugin';

// --- helpers ----------------------------------------------------------------

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

function makeRow(id: string, text = ' ') {
  return schema.nodes.row.create({ id }, schema.text(text));
}

interface PerfEditor {
  view: EditorView;
  layoutCalls: Array<{ ranLayout: boolean; layoutMs: number }>;
  destroy: () => void;
}

function bootEditor(rowCount: number, rowHeights: Map<string, number>): PerfEditor {
  const place = document.createElement('div');
  document.body.appendChild(place);

  const layoutCalls: PerfEditor['layoutCalls'] = [];
  const rows = Array.from({ length: rowCount }, (_, i) => makeRow(`r${i}`, `row${i}`));
  const doc = schema.node('doc', null, rows);

  const state = EditorState.create({
    schema,
    doc,
    plugins: [
      createPaginationPlugin({
        pageHeightPx: 1000,
        __syncSchedule: true,
        __testRowHeights: rowHeights,
        __testMargins: { marginTopPx: 100, marginBottomPx: 100, screenGapPx: 32 },
        __onLayout: (_out, info) => {
          layoutCalls.push({ ranLayout: info.ranLayout, layoutMs: info.layoutMs });
        },
      }),
    ],
  });

  const view = new EditorView(place, { state });
  return {
    view,
    layoutCalls,
    destroy: () => { view.destroy(); place.remove(); },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// --- test -------------------------------------------------------------------

describe('PaginationPlugin perf budget (T35)', () => {
  let editor: PerfEditor | undefined;
  afterEach(() => { editor?.destroy(); editor = undefined; });

  it('50-row doc + 60 tx/sec → p50 layout < 50ms (CI); strict 16ms target via real-browser Playwright', async () => {
    // 50 rows with varied heights so position-based measurement (F3) is exercised
    // (rows of different heights produce non-uniform inter-row offsets).
    const ROW_COUNT = 50;
    const heights = new Map<string, number>();
    for (let i = 0; i < ROW_COUNT; i++) {
      // Cycle through 24/30/40/52 to mimic header/meta/bullet/title rows.
      const cycle = [24, 30, 40, 52];
      heights.set(`r${i}`, cycle[i % cycle.length]);
    }
    editor = bootEditor(ROW_COUNT, heights);
    await flush();

    // Reset and dispatch 60 forced layout passes (worst-case ranLayout=true on
    // every transaction). Wall-clock approximates 1 second of 60Hz typing.
    editor.layoutCalls.length = 0;
    const N = 60;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const tr = editor.view.state.tr
        .setMeta('forceLayout', true)
        .setMeta('addToHistory', false);
      editor.view.dispatch(tr);
      await flush();
    }
    const totalMs = performance.now() - t0;

    const ranPasses = editor.layoutCalls.filter((c) => c.ranLayout);
    expect(ranPasses.length).toBe(N);

    const samples = ranPasses.map((c) => c.layoutMs).sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length / 2)];
    const p95 = samples[Math.floor(samples.length * 0.95)];

    // Sanity: state was actually populated (paginated → ≥1 page geometry).
    const s = paginationPluginKey.getState(editor.view.state)!;
    expect(s.pageGeometries.length).toBeGreaterThanOrEqual(1);

    // CI threshold: 50ms p50. Strict 16ms (1-frame) target enforced in real
    // Chromium — see comment block at top of file.
    expect(p50).toBeLessThan(50);
    // p95 also reasonable — guard against pathological tail.
    expect(p95).toBeLessThan(100);
    // Wall-clock for 60 passes shouldn't exceed a few seconds in CI.
    expect(totalMs).toBeLessThan(10_000);
  });
});
