// frontend/src/components/resume/v2/interaction/SelectionManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from './SelectionManager';

let mgr: SelectionManager;
beforeEach(() => { mgr = new SelectionManager(); });

describe('SelectionManager', () => {
  it('selectSingleBlock', () => {
    mgr.selectSingleBlock('a');
    expect(mgr.getBlocks()).toEqual(['a']);
  });
  it('toggleBlock add then remove', () => {
    mgr.toggleBlock('a');
    expect(mgr.getBlocks()).toEqual(['a']);
    mgr.toggleBlock('a');
    expect(mgr.getBlocks()).toEqual([]);
    expect(mgr.state).toBe('none');
  });
  it('extendBlockSelection extends range', () => {
    mgr.selectSingleBlock('a');
    mgr.extendBlockSelection('c', ['a', 'b', 'c', 'd']);
    expect(mgr.getBlocks()).toEqual(['a', 'b', 'c']);
  });
  it('subscribe fires on selection change', () => {
    let last: Set<string> | null = null;
    mgr.subscribe(s => { last = s; });
    mgr.selectSingleBlock('x');
    expect(last?.has('x')).toBe(true);
  });
  it('notifyTipTapFocus clears block selection', () => {
    mgr.selectSingleBlock('a');
    mgr.notifyTipTapFocus();
    expect(mgr.getBlocks()).toEqual([]);
  });
});
