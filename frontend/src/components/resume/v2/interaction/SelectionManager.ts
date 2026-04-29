// frontend/src/components/resume/v2/interaction/SelectionManager.ts
import type { BlockId } from '../types';

type SelectionState = 'none' | 'tiptap-text' | 'block-selection';
type Listener = (blocks: Set<BlockId>) => void;

export class SelectionManager {
  state: SelectionState = 'none';
  blockSelection: Set<BlockId> = new Set();
  private listeners: Listener[] = [];

  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => { this.listeners = this.listeners.filter(x => x !== l); };
  }

  selectSingleBlock(id: BlockId): void {
    this.blockSelection = new Set([id]);
    this.state = 'block-selection';
    this.emit();
  }

  toggleBlock(id: BlockId): void {
    const next = new Set(this.blockSelection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.blockSelection = next;
    this.state = next.size > 0 ? 'block-selection' : 'none';
    this.emit();
  }

  extendBlockSelection(id: BlockId, allBlockIdsInOrder: BlockId[]): void {
    if (this.blockSelection.size === 0) {
      this.selectSingleBlock(id);
      return;
    }
    const last = Array.from(this.blockSelection).pop()!;
    const lastIdx = allBlockIdsInOrder.indexOf(last);
    const newIdx = allBlockIdsInOrder.indexOf(id);
    if (lastIdx < 0 || newIdx < 0) return;
    const [a, b] = lastIdx < newIdx ? [lastIdx, newIdx] : [newIdx, lastIdx];
    this.blockSelection = new Set(allBlockIdsInOrder.slice(a, b + 1));
    this.state = 'block-selection';
    this.emit();
  }

  clear(): void {
    if (this.blockSelection.size === 0) return;
    this.blockSelection = new Set();
    this.state = 'none';
    this.emit();
  }

  hasBlockSelection(): boolean { return this.blockSelection.size > 0; }
  getBlocks(): BlockId[] { return Array.from(this.blockSelection); }

  notifyTipTapFocus(): void {
    // Block selection now coexists with TipTap text-editing focus — this
    // supports the "click anywhere in a section selects the section AND keeps
    // text editable" pattern. Just record the focus state; do not clear blocks.
    this.state = 'tiptap-text';
  }

  private emit(): void {
    for (const l of this.listeners) l(this.blockSelection);
  }
}

export const selectionManager = new SelectionManager();
