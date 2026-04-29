import type { Editor } from '@tiptap/core';
import { atomFocusManager } from './AtomFocusManager';

export type CrossEditorRange = {
  key: string;
  from: number;
  to: number;
};

type Listener = () => void;

class CrossEditorSelection {
  private ranges: CrossEditorRange[] = [];
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getRanges(): CrossEditorRange[] {
    return this.ranges;
  }

  hasSelection(): boolean {
    return this.ranges.length > 0;
  }

  setRanges(ranges: CrossEditorRange[]): void {
    this.ranges = ranges.filter(r => r.from !== r.to);
    this.emit();
  }

  clear(): void {
    if (this.ranges.length === 0) return;
    this.ranges = [];
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const crossEditorSelection = new CrossEditorSelection();

export function editorRangesForKeys(keys: string[]): CrossEditorRange[] {
  const keySet = new Set(keys);
  return atomFocusManager.editorsInOrder()
    .filter(({ key }) => keySet.has(key))
    .map(({ key, editor }) => ({
      key,
      from: 0,
      to: editor.state.doc.content.size,
    }));
}

export function editorRangesBetween(
  start: { key: string; pos: number },
  end: { key: string; pos: number },
): CrossEditorRange[] {
  const editors = atomFocusManager.editorsInOrder();
  const startIndex = editors.findIndex(e => e.key === start.key);
  const endIndex = editors.findIndex(e => e.key === end.key);
  if (startIndex < 0 || endIndex < 0) return [];

  if (startIndex === endIndex) {
    const [from, to] = normalizeRange(start.pos, end.pos, editors[startIndex].editor);
    return from === to ? [] : [{ key: start.key, from, to }];
  }

  const forward = startIndex < endIndex;
  const [a, b] = forward ? [startIndex, endIndex] : [endIndex, startIndex];
  const out: CrossEditorRange[] = [];

  for (let i = a; i <= b; i += 1) {
    const { key, editor } = editors[i];
    const docEnd = editor.state.doc.content.size;
    let from = 0;
    let to = docEnd;

    if (i === startIndex) {
      if (forward) from = start.pos;
      else to = start.pos;
    }
    if (i === endIndex) {
      if (forward) to = end.pos;
      else from = end.pos;
    }

    [from, to] = normalizeRange(from, to, editor);
    if (from !== to) out.push({ key, from, to });
  }

  return out;
}

export function editorPointFromViewport(x: number, y: number): { key: string; pos: number } | null {
  const editors = atomFocusManager.editorsInOrder();

  // Pass 1: cursor's Y is INSIDE some editor's bounding rect — use posAtCoords.
  for (const { key, editor } of editors) {
    const rect = editor.view.dom.getBoundingClientRect();
    if (y < rect.top || y > rect.bottom) continue;
    const left = Math.max(rect.left + 1, Math.min(x, rect.right - 1));
    const top = Math.max(rect.top + 1, Math.min(y, rect.bottom - 1));
    const hit = editor.view.posAtCoords({ left, top });
    if (!hit) continue;
    return { key, pos: clampPos(hit.pos, editor) };
  }

  // Pass 2: cursor sits in a vertical gap between editors (e.g. the
  // margin-bottom between an entry's title/meta and the next bullet, or
  // the gap between a section heading and the first entry). Without this
  // fallback, drag-select selection stops growing while the cursor is in
  // the gap — the user sees the selection not extending through subtitle
  // / date rows. Snap to the NEAREST editor's start (cursor above) or end
  // (cursor below) so the selection tracks smoothly across gaps.
  let nearestKey: string | null = null;
  let nearestEditor: Editor | null = null;
  let nearestPos = 0;
  let bestDist = Infinity;
  for (const { key, editor } of editors) {
    const rect = editor.view.dom.getBoundingClientRect();
    if (y < rect.top) {
      const d = rect.top - y;
      if (d < bestDist) {
        bestDist = d;
        nearestKey = key;
        nearestEditor = editor;
        nearestPos = 0;
      }
    } else if (y > rect.bottom) {
      const d = y - rect.bottom;
      if (d < bestDist) {
        bestDist = d;
        nearestKey = key;
        nearestEditor = editor;
        nearestPos = editor.state.doc.content.size;
      }
    }
  }
  if (!nearestKey || !nearestEditor) return null;
  return { key: nearestKey, pos: clampPos(nearestPos, nearestEditor) };
}

export function crossEditorSelectionClientRects(root: HTMLElement): DOMRect[] {
  const rootRect = root.getBoundingClientRect();
  const ordered = atomFocusManager.editorsInOrder();
  const indexByKey = new Map(ordered.map((item, i) => [item.key, i] as const));
  const editorByKey = new Map(ordered.map(item => [item.key, item.editor]));

  // Sort ranges by document order so we can fill gaps between consecutive
  // selected editors (margin between e.g. an entry's meta row and the next
  // bullet) and produce one continuous highlight band.
  const sortedRanges = crossEditorSelection.getRanges()
    .slice()
    .sort((a, b) => (indexByKey.get(a.key) ?? 0) - (indexByKey.get(b.key) ?? 0));

  // Build one rect per editor in the selection. For fully-selected editors
  // (from=0, to=docEnd), use the editor's own bbox so the highlight spans
  // the full visual line (including line-height padding) rather than the
  // glyph-tight client rects from the DOM Range. Partial editors (start/end
  // of the drag) fall back to the Range bbox.
  type PerEditor = { key: string; rect: DOMRect; index: number };
  const perEditor: PerEditor[] = [];
  for (const range of sortedRanges) {
    const editor = editorByKey.get(range.key);
    const index = indexByKey.get(range.key);
    if (!editor || index == null) continue;
    const docEnd = editor.state.doc.content.size;
    const isFull = range.from <= 0 && range.to >= docEnd;

    let absRect: DOMRect | null = null;
    if (isFull) {
      const r = editor.view.dom.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        absRect = new DOMRect(r.left, r.top, r.width, r.height);
      }
    } else {
      const domRange = domRangeForEditorRange(editor, range.from, range.to);
      if (domRange) {
        // Union all client rects (covers wrapped lines as one band).
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        for (const cr of Array.from(domRange.getClientRects())) {
          if (cr.width <= 0 || cr.height <= 0) continue;
          l = Math.min(l, cr.left);
          t = Math.min(t, cr.top);
          r = Math.max(r, cr.right);
          b = Math.max(b, cr.bottom);
        }
        if (isFinite(l)) absRect = new DOMRect(l, t, r - l, b - t);
      }
    }
    if (absRect) perEditor.push({ key: range.key, rect: absRect, index });
  }

  // Fill vertical gaps between consecutive selected editors so the band is
  // visually continuous (handles CSS margin-bottom on entry.meta / between
  // bullets / etc).
  const out: DOMRect[] = [];
  perEditor.sort((a, b) => a.index - b.index);
  for (let i = 0; i < perEditor.length; i++) {
    const cur = perEditor[i].rect;
    out.push(toLocal(cur, rootRect));

    const next = perEditor[i + 1];
    if (!next) continue;
    if (next.index !== perEditor[i].index + 1) continue; // non-adjacent → don't bridge
    const gapTop = cur.bottom;
    const gapBottom = next.rect.top;
    if (gapBottom <= gapTop + 0.5) continue; // no visible gap
    // Bridge spans from the wider rect's left to the wider rect's right so
    // the bridge looks like a continuation rather than a pinched stripe.
    const left = Math.min(cur.left, next.rect.left);
    const right = Math.max(cur.right, next.rect.right);
    out.push(toLocal(new DOMRect(left, gapTop, right - left, gapBottom - gapTop), rootRect));
  }

  return out;
}

function toLocal(rect: DOMRect, rootRect: DOMRect): DOMRect {
  return new DOMRect(rect.left - rootRect.left, rect.top - rootRect.top, rect.width, rect.height);
}

function domRangeForEditorRange(editor: Editor, from: number, to: number): Range | null {
  try {
    const docEnd = editor.state.doc.content.size;
    const safeFrom = Math.max(0, Math.min(from, docEnd));
    const safeTo = Math.max(0, Math.min(to, docEnd));
    const a = editor.view.domAtPos(safeFrom);
    const b = editor.view.domAtPos(safeTo);
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    return range;
  } catch {
    return null;
  }
}

function normalizeRange(a: number, b: number, editor: Editor): [number, number] {
  const from = clampPos(Math.min(a, b), editor);
  const to = clampPos(Math.max(a, b), editor);
  return [from, to];
}

function clampPos(pos: number, editor: Editor): number {
  return Math.max(0, Math.min(pos, editor.state.doc.content.size));
}
