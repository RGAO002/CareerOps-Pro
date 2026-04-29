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
  const byKey = new Map(atomFocusManager.editorsInOrder().map(item => [item.key, item.editor]));
  const rects: DOMRect[] = [];

  for (const range of crossEditorSelection.getRanges()) {
    const editor = byKey.get(range.key);
    if (!editor) continue;
    const domRange = domRangeForEditorRange(editor, range.from, range.to);
    if (!domRange) continue;
    for (const rect of Array.from(domRange.getClientRects())) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      rects.push(new DOMRect(
        rect.left - rootRect.left,
        rect.top - rootRect.top,
        rect.width,
        rect.height,
      ));
    }
  }

  return rects;
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
