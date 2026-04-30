// frontend/src/components/resume/v3/interaction/SelectionManager.ts
//
// v3 SelectionManager — adapted from v2 SelectionManager.
// Key type generalized from `BlockId` to `RowId | GroupId` so the same
// manager can track row-level selections (rows in the v3 doc) and
// group-level selections (semantic groups). Public API mirrors v2:
//   subscribe / select / toggle / extend / clear (+ setKeys, hasSelection,
//   getKeys, notifyTipTapFocus). The v2 method names ending in "Block" are
//   renamed to be selection-key agnostic (select, toggle, extend, getKeys).

import type { RowId, GroupId } from '../schema/types';

export type SelectionKey = RowId | GroupId;
export type SelectionState = 'none' | 'tiptap-text' | 'block-selection';
export type SelectionListener = (selection: Set<SelectionKey>) => void;

export class SelectionManager {
  state: SelectionState = 'none';
  selection: Set<SelectionKey> = new Set();
  private listeners: SelectionListener[] = [];

  subscribe(l: SelectionListener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter(x => x !== l);
    };
  }

  /** Replace the current selection with a single key. */
  select(id: SelectionKey): void {
    this.selection = new Set([id]);
    this.state = 'block-selection';
    this.emit();
  }

  /** Replace the selection with the given keys. Used by document-level
   *  "select all" (Cmd+A escalation). */
  setKeys(ids: SelectionKey[]): void {
    this.selection = new Set(ids);
    this.state = ids.length > 0 ? 'block-selection' : 'none';
    this.emit();
  }

  /** Add the key if absent, remove it if present. */
  toggle(id: SelectionKey): void {
    const next = new Set(this.selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selection = next;
    this.state = next.size > 0 ? 'block-selection' : 'none';
    this.emit();
  }

  /** Extend the current selection to cover the inclusive range between the
   *  most recently added key and `id`, using `allKeysInOrder` as the linear
   *  order. If selection is empty, falls back to `select(id)`. */
  extend(id: SelectionKey, allKeysInOrder: SelectionKey[]): void {
    if (this.selection.size === 0) {
      this.select(id);
      return;
    }
    const last = Array.from(this.selection).pop()!;
    const lastIdx = allKeysInOrder.indexOf(last);
    const newIdx = allKeysInOrder.indexOf(id);
    if (lastIdx < 0 || newIdx < 0) return;
    const [a, b] = lastIdx < newIdx ? [lastIdx, newIdx] : [newIdx, lastIdx];
    this.selection = new Set(allKeysInOrder.slice(a, b + 1));
    this.state = 'block-selection';
    this.emit();
  }

  clear(): void {
    if (this.selection.size === 0) return;
    this.selection = new Set();
    this.state = 'none';
    this.emit();
  }

  hasSelection(): boolean {
    return this.selection.size > 0;
  }

  getKeys(): SelectionKey[] {
    return Array.from(this.selection);
  }

  /** Block selection coexists with TipTap text-editing focus — this supports
   *  the "click anywhere in a section selects the section AND keeps text
   *  editable" pattern. Just record the focus state; do not clear selection. */
  notifyTipTapFocus(): void {
    this.state = 'tiptap-text';
  }

  private emit(): void {
    for (const l of this.listeners) l(this.selection);
  }
}

export const selectionManager = new SelectionManager();
