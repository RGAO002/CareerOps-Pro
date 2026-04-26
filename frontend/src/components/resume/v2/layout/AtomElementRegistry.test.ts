// frontend/src/components/resume/v2/layout/AtomElementRegistry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AtomElementRegistry } from './AtomElementRegistry';

describe('AtomElementRegistry', () => {
  it('register sets data-atom-id on element', () => {
    const reg = new AtomElementRegistry(vi.fn());
    const el = document.createElement('div');
    reg.register('a1', el);
    expect(el.dataset.atomId).toBe('a1');
    reg.destroy();
  });
  it('register null unregisters', () => {
    const reg = new AtomElementRegistry(vi.fn());
    const el = document.createElement('div');
    reg.register('a1', el);
    reg.register('a1', null);
    const heights = reg.measureAll();
    expect(heights.has('a1')).toBe(false);
    reg.destroy();
  });
  it('replacing element with new ref unobserves old', () => {
    const reg = new AtomElementRegistry(vi.fn());
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    reg.register('a1', el1);
    reg.register('a1', el2);
    expect(el2.dataset.atomId).toBe('a1');
    reg.destroy();
  });
  it('measureAll returns map of heights', () => {
    const reg = new AtomElementRegistry(vi.fn());
    const el = document.createElement('div');
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ height: 42, width: 100, top: 0, left: 0, right: 100, bottom: 42, x: 0, y: 0, toJSON: () => ({}) }),
    });
    reg.register('a1', el);
    const heights = reg.measureAll();
    expect(heights.get('a1')).toBe(42);
    reg.destroy();
  });
});
