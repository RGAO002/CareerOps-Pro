import { describe, it, expect, vi } from 'vitest';
import { LayoutEngine } from './LayoutEngine';
import { normalizeTemplate } from './normalize-template';
import type { LayoutAtom } from '../types';

const TEMPLATE = normalizeTemplate({
  id: 'fix', layoutStrategyId: 'single-column',
  page: { width: '8.5in', height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' } },
  theme: {} as any,
});

const atoms: LayoutAtom[] = [
  { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false },
];

describe('LayoutEngine', () => {
  it('requestRepaginate immediately calls onLayout when not composing', () => {
    const onLayout = vi.fn();
    const engine = new LayoutEngine({ onLayout });
    engine.setInputs(atoms, new Map([['h', 100]]), TEMPLATE);
    engine.requestRepaginate();
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('queues repaginate during composition, flushes on compositionend', () => {
    const onLayout = vi.fn();
    const engine = new LayoutEngine({ onLayout });
    engine.setInputs(atoms, new Map([['h', 100]]), TEMPLATE);
    engine.compositionBegin('ed-1');
    engine.requestRepaginate();
    expect(onLayout).not.toHaveBeenCalled();
    engine.compositionEnd('ed-1');
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('does not flush when other editors still composing', () => {
    const onLayout = vi.fn();
    const engine = new LayoutEngine({ onLayout });
    engine.setInputs(atoms, new Map([['h', 100]]), TEMPLATE);
    engine.compositionBegin('ed-1');
    engine.compositionBegin('ed-2');
    engine.requestRepaginate();
    engine.compositionEnd('ed-1');
    expect(onLayout).not.toHaveBeenCalled();
    engine.compositionEnd('ed-2');
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('isComposing reflects state', () => {
    const engine = new LayoutEngine({ onLayout: vi.fn() });
    expect(engine.isComposing()).toBe(false);
    engine.compositionBegin('ed-1');
    expect(engine.isComposing()).toBe(true);
    engine.compositionEnd('ed-1');
    expect(engine.isComposing()).toBe(false);
  });
});
