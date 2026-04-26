// frontend/src/components/resume/v2/layout/LayoutEngine.ts
import type { LayoutAtom, AtomId, AtomLayout, EditorId } from '../types';
import type { NormalizedTemplate } from './normalize-template';
import { LAYOUT_STRATEGIES } from './strategies';

export type LayoutResult = {
  atomLayouts: Map<AtomId, AtomLayout>;
  pageCount: number;
};

export type LayoutEngineCallbacks = {
  onLayout: (result: LayoutResult) => void;
};

export class LayoutEngine {
  private composingEditors = new Set<EditorId>();
  private pendingRepaginate = false;
  private callbacks: LayoutEngineCallbacks;
  private latestAtoms: LayoutAtom[] = [];
  private latestHeights = new Map<AtomId, number>();
  private latestTemplate: NormalizedTemplate | null = null;

  constructor(callbacks: LayoutEngineCallbacks) {
    this.callbacks = callbacks;
  }

  setInputs(atoms: LayoutAtom[], heights: Map<AtomId, number>, template: NormalizedTemplate): void {
    this.latestAtoms = atoms;
    this.latestHeights = heights;
    this.latestTemplate = template;
  }

  compositionBegin(editorId: EditorId): void {
    this.composingEditors.add(editorId);
  }

  compositionEnd(editorId: EditorId): void {
    this.composingEditors.delete(editorId);
    if (this.composingEditors.size === 0 && this.pendingRepaginate) {
      this.pendingRepaginate = false;
      this.repaginate();
    }
  }

  requestRepaginate(): void {
    if (this.composingEditors.size > 0) {
      this.pendingRepaginate = true;
      return;
    }
    this.repaginate();
  }

  private repaginate(): void {
    if (!this.latestTemplate) return;
    const strategy = LAYOUT_STRATEGIES[this.latestTemplate.layoutStrategyId];
    if (!strategy) return;
    const result = strategy.computeLayout({
      atoms: this.latestAtoms,
      measuredHeights: this.latestHeights,
      template: this.latestTemplate,
    });
    this.callbacks.onLayout(result);
  }

  isComposing(): boolean { return this.composingEditors.size > 0; }
}
