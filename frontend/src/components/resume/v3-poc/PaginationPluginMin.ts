import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { computeLayout, type LayoutOutput, type PageGeometry } from './layout-min';

export const paginationPluginKey = new PluginKey<PaginationPluginState>('paginationPluginMin');

export interface PaginationPluginState {
  pageGeometries: PageGeometry[];
  decorations: DecorationSet;
}

const PAGE_HEIGHT_PX = 11 * 96;   // 11in @ 96 dpi (rough; actual measurement uses real DPI)

function getMarginPx(canvasRoot: HTMLElement, varName: string): number {
  const v = getComputedStyle(canvasRoot).getPropertyValue(varName).trim();
  if (v.endsWith('in')) return parseFloat(v) * 96;
  if (v.endsWith('px')) return parseFloat(v);
  return parseFloat(v) || 0;
}

export function createPaginationPluginMin() {
  return new Plugin<PaginationPluginState>({
    key: paginationPluginKey,
    state: {
      init: () => ({ pageGeometries: [], decorations: DecorationSet.empty }),
      apply(tr, oldState) {
        // Plugin state updates only via meta from view.update (see view spec below).
        const next = tr.getMeta(paginationPluginKey) as PaginationPluginState | undefined;
        return next ?? oldState;
      },
    },
    view(view) {
      let scheduled = false;
      let retries = 0;
      const MAX_RETRIES = 30;     // 30 frames ≈ 500ms at 60fps; enough for fonts/measurement

      const stampDebug = (rowCount: number, breakCount: number, error?: string) => {
        const canvasRoot = view.dom.closest('.poc-canvas-root') as HTMLElement | null;
        if (!canvasRoot) return;
        canvasRoot.setAttribute('data-row-count', String(rowCount));
        canvasRoot.setAttribute('data-break-count', String(breakCount));
        if (error !== undefined) canvasRoot.setAttribute('data-layout-error', error);
        else canvasRoot.removeAttribute('data-layout-error');
      };

      const recompute = () => {
        scheduled = false;
        const canvasRoot = view.dom.closest('.poc-canvas-root') as HTMLElement | null;
        if (!canvasRoot) {
          // Editor mounted but canvas root not yet in tree. Retry.
          if (retries++ < MAX_RETRIES) { schedule(); return; }
          return;
        }
        const marginTopPx = getMarginPx(canvasRoot, '--page-margin-top');
        const marginBottomPx = getMarginPx(canvasRoot, '--page-margin-bottom');
        const screenGapPx = getMarginPx(canvasRoot, '--page-break-screen-gap');

        // ReactNodeViewRenderer wraps each node in a .react-renderer div, so
        // rows are one level deeper: :scope > div > .row
        const rowElements = Array.from(view.dom.querySelectorAll(':scope > div > .row')) as HTMLElement[];

        // Retry if rows aren't rendered yet, or any row has 0 height (not yet laid out).
        if (rowElements.length === 0 || rowElements.some((r) => r.getBoundingClientRect().height === 0)) {
          if (retries++ < MAX_RETRIES) {
            schedule();
            return;
          }
          // Give up after MAX_RETRIES; stamp error so /print test can see it.
          stampDebug(rowElements.length, 0, 'rows-not-measured');
          return;
        }

        retries = 0;     // reset on successful read

        const layout: LayoutOutput = computeLayout({
          rowElements,
          pageHeightPx: PAGE_HEIGHT_PX,
          marginTopPx,
          marginBottomPx,
          screenGapPx,
        });

        // Map afterRowIndex → PM doc position (after that row's node).
        let posAtRowEnd: number[] = [];
        let cursor = 0;
        view.state.doc.forEach((node) => {
          cursor += node.nodeSize;
          posAtRowEnd.push(cursor);
        });

        const decorations = layout.pageBreaks.map((b) => {
          const pos = posAtRowEnd[b.afterRowIndex];
          return Decoration.widget(pos, () => {
            const el = document.createElement('div');
            el.className = 'pagination-break';
            el.setAttribute('contenteditable', 'false');
            el.setAttribute('aria-hidden', 'true');
            el.style.height = `${b.screenHeightPx}px`;
            return el;
          }, { side: 1, key: `break-${b.pageIndex}` });
        });

        stampDebug(rowElements.length, layout.pageBreaks.length);

        const tr = view.state.tr.setMeta(paginationPluginKey, {
          pageGeometries: layout.pageGeometries,
          decorations: DecorationSet.create(view.state.doc, decorations),
        } satisfies PaginationPluginState);
        tr.setMeta('addToHistory', false);
        view.dispatch(tr);
      };

      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(recompute);
      };

      // Hardened initial layout: wait for canvas + fonts + 2× rAF before first measurement.
      void (async () => {
        // Wait for canvas root to appear in DOM.
        for (let i = 0; i < 30; i++) {
          if (view.dom.closest('.poc-canvas-root')) break;
          await new Promise(r => requestAnimationFrame(r));
        }
        await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));
        schedule();
      })();

      return {
        update(view, prevState) {
          if (view.state.doc !== prevState.doc) schedule();
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
