// frontend/src/components/resume/v3/plugins/PaginationPlugin.ts
//
// Production v3 PaginationPlugin (T32). Owns:
//   - Subscribing to tr.docChanged and tr.getMeta('forceLayout') re-runs.
//   - rAF debounce: many tx in one frame collapse to a single layout pass.
//   - Incremental row-cache (F-perf): walk doc.before vs doc.after to
//     determine whether structural row identity changed; skip layout when
//     only inline content within unchanged rows mutated. (Layout still runs
//     on width-affecting changes — we err on the side of recomputing.)
//   - Emits widget BreakDecorations + page geometries via plugin state.
//   - F1 selector contract: row walk uses ':scope > div > .row' so it sees
//     ReactNodeViewRenderer's wrapping <div class="react-renderer">.
//
// Spec ref: § 4.2 (architecture), § 4.5 (page geometry), § 4.7 (perf).
//
// F4: PaginationPlugin reads doc structure only. It does NOT depend on
// GroupsPlugin state and is orphan-tolerant by construction.

import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { computeLayout, type LayoutOutput, type PageGeometry } from '../layout/LayoutEngine';

export interface PaginationPluginState {
  pageGeometries: PageGeometry[];
  decorations: DecorationSet;
  /**
   * Internal counter incremented by every transaction carrying
   * meta('forceLayout', true). The view layer compares old vs new value
   * in update() to detect external force-layout requests.
   */
  forceLayoutToken: number;
}

export const paginationPluginKey = new PluginKey<PaginationPluginState>('paginationPlugin');

const PAGE_HEIGHT_PX_DEFAULT = 11 * 96; // 11in @ 96 dpi (override via opts).

export interface PaginationPluginOptions {
  /**
   * CSS selector for the canvas root (where --page-* CSS vars live).
   * Default '.poc-canvas-root' for parity with M1 PoC; production wiring
   * (T33) will pass '.v3-canvas-root' or whatever the production root uses.
   */
  canvasRootSelector?: string;
  /** Page height in px (defaults to 11in @ 96dpi). */
  pageHeightPx?: number;
  /**
   * Test-only override: synchronous schedule (skip rAF). Used in unit tests
   * to make layout passes deterministic. Production never sets this.
   */
  __syncSchedule?: boolean;
  /**
   * Test-only override: provide a fixed row → height map keyed by row id,
   * used when jsdom/happy-dom returns 0 from getBoundingClientRect. The
   * plugin will synthesize bounding rects from this map. Production never
   * sets this.
   */
  __testRowHeights?: Map<string, number>;
  /**
   * Test-only callback fired on every successful layout pass. Production
   * never sets this.
   */
  __onLayout?: (out: LayoutOutput, info: { layoutMs: number; ranLayout: boolean }) => void;
  /**
   * Test-only override: bypass getComputedStyle CSS-var reads (jsdom/happy-dom
   * doesn't compute CSS) and use these values directly. Production never
   * sets this.
   */
  __testMargins?: { marginTopPx: number; marginBottomPx: number; screenGapPx: number };
}

function readVarPx(rootEl: HTMLElement, varName: string): number {
  const v = getComputedStyle(rootEl).getPropertyValue(varName).trim();
  if (!v) return 0;
  if (v.endsWith('in')) return parseFloat(v) * 96;
  if (v.endsWith('px')) return parseFloat(v);
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Snapshot of structural row identity used to decide whether to re-layout. */
interface RowSig {
  id: string;
  type: string;
  size: number;
}

function rowSignaturesFromState(state: EditorState): RowSig[] {
  const sigs: RowSig[] = [];
  state.doc.forEach((node) => {
    sigs.push({
      id: (node.attrs.id as string) ?? '',
      type: node.type.name,
      size: node.nodeSize,
    });
  });
  return sigs;
}

function rowSigsEqual(a: RowSig[], b: RowSig[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].type !== b[i].type || a[i].size !== b[i].size) return false;
  }
  return true;
}

export function createPaginationPlugin(opts: PaginationPluginOptions = {}) {
  const {
    canvasRootSelector = '.poc-canvas-root',
    pageHeightPx = PAGE_HEIGHT_PX_DEFAULT,
    __syncSchedule = false,
    __testRowHeights,
    __onLayout,
    __testMargins,
  } = opts;

  return new Plugin<PaginationPluginState>({
    key: paginationPluginKey,
    state: {
      init: () => ({ pageGeometries: [], decorations: DecorationSet.empty, forceLayoutToken: 0 }),
      apply(tr: Transaction, oldState: PaginationPluginState): PaginationPluginState {
        // Layout plugin only updates pageGeometries/decorations via meta
        // dispatched from the view (after a layout pass).
        const next = tr.getMeta(paginationPluginKey) as Partial<PaginationPluginState> | undefined;
        const isForce = tr.getMeta('forceLayout') === true;
        let s: PaginationPluginState = oldState;
        if (next) {
          s = {
            pageGeometries: next.pageGeometries ?? s.pageGeometries,
            decorations: next.decorations ?? s.decorations,
            forceLayoutToken: s.forceLayoutToken,
          };
        }
        if (tr.docChanged && !next) {
          // Remap decorations through the doc step so widget positions stay
          // valid until the next layout pass lands.
          s = { ...s, decorations: s.decorations.map(tr.mapping, tr.doc) };
        }
        if (isForce) {
          s = { ...s, forceLayoutToken: s.forceLayoutToken + 1 };
        }
        return s;
      },
    },
    view(view) {
      let scheduled = false;
      let rafHandle: number | null = null;
      let lastSigs: RowSig[] = rowSignaturesFromState(view.state);
      let lastForceLayout = false;
      let destroyed = false;

      const collectRowElements = (): HTMLElement[] => {
        // F1 wrapper-aware selector: ReactNodeViewRenderer wraps each node
        // in a <div class="react-renderer">, so rows are :scope > div > .row.
        return Array.from(view.dom.querySelectorAll(':scope > div > .row')) as HTMLElement[];
      };

      const buildRowElementsForTesting = (): HTMLElement[] => {
        // When __testRowHeights is provided, synthesize HTMLElements with
        // overridden getBoundingClientRect using the doc's row order. This
        // avoids depending on mounted DOM in vitest (happy-dom doesn't lay
        // out CSS). One element per top-level row.
        if (!__testRowHeights) return [];
        const rows: HTMLElement[] = [];
        let yCursor = 0;
        view.state.doc.forEach((node) => {
          const id = (node.attrs.id as string) ?? '';
          const h = __testRowHeights.get(id) ?? 0;
          const top = yCursor;
          yCursor += h;
          const el = document.createElement('div');
          el.className = 'row';
          Object.defineProperty(el, 'getBoundingClientRect', {
            value: () => ({ height: h, top, bottom: top + h, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }),
          });
          rows.push(el);
        });
        return rows;
      };

      const recompute = (forceLayout: boolean) => {
        scheduled = false;
        rafHandle = null;
        if (destroyed) return;

        const start = performance.now();

        // Diff: if structural row signatures didn't change AND no forceLayout
        // request, skip the layout pass. This is the F-perf optimization —
        // typing a character inside a row that doesn't change the row's
        // nodeSize/kind doesn't move any other row, so layout remains valid.
        const currentSigs = rowSignaturesFromState(view.state);
        const sigsChanged = !rowSigsEqual(lastSigs, currentSigs);
        if (!sigsChanged && !forceLayout) {
          __onLayout?.({ pageBreaks: [], pageGeometries: [] }, { layoutMs: performance.now() - start, ranLayout: false });
          return;
        }
        lastSigs = currentSigs;

        // Resolve canvas root: closest ancestor matching canvasRootSelector,
        // OR document root as a fallback (tests often don't have a canvas
        // root mounted).
        const canvasRoot =
          (view.dom.closest(canvasRootSelector) as HTMLElement | null) ??
          (view.dom.parentElement ?? document.documentElement);

        const marginTopPx = __testMargins ? __testMargins.marginTopPx : readVarPx(canvasRoot, '--page-margin-top');
        const marginBottomPx = __testMargins ? __testMargins.marginBottomPx : readVarPx(canvasRoot, '--page-margin-bottom');
        const screenGapPx = __testMargins ? __testMargins.screenGapPx : readVarPx(canvasRoot, '--page-break-screen-gap');

        const rowElements = __testRowHeights
          ? buildRowElementsForTesting()
          : collectRowElements();

        const layout = computeLayout({
          rowElements,
          pageHeightPx,
          marginTopPx,
          marginBottomPx,
          screenGapPx,
        });

        // Map afterRowIndex → PM doc position (after that row's node).
        const posAtRowEnd: number[] = [];
        let cursor = 0;
        view.state.doc.forEach((node) => {
          cursor += node.nodeSize;
          posAtRowEnd.push(cursor);
        });

        const decorations = layout.pageBreaks.map((b) => {
          const pos = posAtRowEnd[b.afterRowIndex];
          return Decoration.widget(
            pos,
            () => {
              const el = document.createElement('div');
              el.className = 'pagination-break';
              el.setAttribute('contenteditable', 'false');
              el.setAttribute('aria-hidden', 'true');
              el.style.height = `${b.screenHeightPx}px`;
              return el;
            },
            { side: 1, key: `break-${b.pageIndex}` },
          );
        });

        const tr = view.state.tr.setMeta(paginationPluginKey, {
          pageGeometries: layout.pageGeometries,
          decorations: DecorationSet.create(view.state.doc, decorations),
        } satisfies Partial<PaginationPluginState>);
        tr.setMeta('addToHistory', false);
        view.dispatch(tr);

        const layoutMs = performance.now() - start;
        __onLayout?.(layout, { layoutMs, ranLayout: true });
      };

      const schedule = (forceLayout: boolean) => {
        if (forceLayout) lastForceLayout = true;
        if (scheduled) return;
        scheduled = true;
        if (__syncSchedule) {
          // Test path: synchronous (still collapses multiple calls per turn
          // because `scheduled` gates re-entry, but runs on microtask tail).
          queueMicrotask(() => {
            const wasForce = lastForceLayout;
            lastForceLayout = false;
            recompute(wasForce);
          });
          return;
        }
        rafHandle = requestAnimationFrame(() => {
          const wasForce = lastForceLayout;
          lastForceLayout = false;
          recompute(wasForce);
        });
      };

      // Initial layout on mount.
      schedule(true);

      return {
        update(updatedView: EditorView, prevState: EditorState) {
          const docChanged = updatedView.state.doc !== prevState.doc;
          // Detect external forceLayout requests via the plugin-state token.
          const prevToken = paginationPluginKey.getState(prevState)?.forceLayoutToken ?? 0;
          const newToken = paginationPluginKey.getState(updatedView.state)?.forceLayoutToken ?? 0;
          const forceRequested = newToken !== prevToken;
          if (docChanged || forceRequested) schedule(forceRequested);
        },
        destroy() {
          destroyed = true;
          if (rafHandle !== null) cancelAnimationFrame(rafHandle);
        },
      };
    },
    props: {
      decorations(state) {
        return paginationPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

/**
 * Request a forced re-layout. Dispatches a no-op transaction with
 * meta('forceLayout', true), which bumps the plugin-state token. The
 * plugin's view.update() handler compares old vs new token and schedules
 * a layout pass on the next rAF tick.
 */
export function requestPaginationLayout(view: EditorView): void {
  const tr = view.state.tr.setMeta('forceLayout', true).setMeta('addToHistory', false);
  view.dispatch(tr);
}

/** Read the current pagination state from EditorState. */
export function getPaginationState(state: EditorState): PaginationPluginState {
  return (
    paginationPluginKey.getState(state) ?? {
      pageGeometries: [],
      decorations: DecorationSet.empty,
      forceLayoutToken: 0,
    }
  );
}
