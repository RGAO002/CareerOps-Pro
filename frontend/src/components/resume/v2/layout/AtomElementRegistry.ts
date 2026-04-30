// frontend/src/components/resume/v2/layout/AtomElementRegistry.ts
import type { AtomId } from '../types';

export type ResizeCallback = (atomId: AtomId, height: number) => void;

export class AtomElementRegistry {
  private elements = new Map<AtomId, HTMLElement>();
  private observer: ResizeObserver | null = null;
  private callback: ResizeCallback;

  constructor(onResize: ResizeCallback) {
    this.callback = onResize;
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const id = target.dataset.atomId as AtomId | undefined;
          if (!id) continue;
          this.callback(id, entry.contentRect.height);
        }
      });
    }
  }

  register(atomId: AtomId, el: HTMLElement | null): void {
    const old = this.elements.get(atomId);
    if (old && old !== el) {
      this.observer?.unobserve(old);
      this.elements.delete(atomId);
    }
    if (el) {
      el.dataset.atomId = atomId;
      this.elements.set(atomId, el);
      this.observer?.observe(el);
    }
  }

  measureAll(): Map<AtomId, number> {
    const out = new Map<AtomId, number>();
    for (const [id, el] of this.elements.entries()) {
      out.set(id, el.getBoundingClientRect().height);
    }
    return out;
  }

  destroy(): void {
    this.observer?.disconnect();
    this.elements.clear();
  }
}
