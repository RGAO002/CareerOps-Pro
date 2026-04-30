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
      const recompute = () => {
        scheduled = false;
        const canvasRoot = view.dom.closest('.poc-canvas-root') as HTMLElement | null;
        if (!canvasRoot) return;
        const marginTopPx = getMarginPx(canvasRoot, '--page-margin-top');
        const marginBottomPx = getMarginPx(canvasRoot, '--page-margin-bottom');
        const screenGapPx = getMarginPx(canvasRoot, '--page-break-screen-gap');

        const rowElements = Array.from(view.dom.querySelectorAll(':scope > .row')) as HTMLElement[];
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
          // Per-break height: dynamic, set as inline style. Print CSS forces 0 via !important.
          return Decoration.widget(pos, () => {
            const el = document.createElement('div');
            el.className = 'pagination-break';
            el.setAttribute('contenteditable', 'false');
            el.setAttribute('aria-hidden', 'true');
            el.style.height = `${b.screenHeightPx}px`;
            return el;
          }, { side: 1, key: `break-${b.pageIndex}` });
        });

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

      // Initial layout.
      schedule();
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
