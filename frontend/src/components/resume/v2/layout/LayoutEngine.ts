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

  /**
   * Run the same pagination strategy on a hypothetical atom list (e.g. the
   * post-drop atom order during a drag preview) WITHOUT mutating engine state
   * or firing onLayout. Returns just the atomLayouts map.
   *
   * Used by DragController to compute the true post-drop layout per drag tick,
   * so AtomContentLayer can shift atoms to their actual destination instead of
   * a local +H/-H stub (which is wrong across page boundaries).
   *
   * Reuses the engine's latest measured heights — heights for hypothetical
   * atoms that weren't measured yet just default to 0, which is the same
   * conservative behavior the live engine uses.
   */
  previewLayout(hypotheticalAtoms: LayoutAtom[]): Map<AtomId, AtomLayout> {
    if (!this.latestTemplate) return new Map();
    const strategy = LAYOUT_STRATEGIES[this.latestTemplate.layoutStrategyId];
    if (!strategy) return new Map();
    const result = strategy.computeLayout({
      atoms: hypotheticalAtoms,
      measuredHeights: this.latestHeights,
      template: this.latestTemplate,
    });
    return result.atomLayouts;
  }

  isComposing(): boolean { return this.composingEditors.size > 0; }
}
