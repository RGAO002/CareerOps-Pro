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
    expect((last as Set<string> | null)?.has('x')).toBe(true);
  });
  it('notifyTipTapFocus preserves block selection (they coexist now)', () => {
    mgr.selectSingleBlock('a');
    mgr.notifyTipTapFocus();
    // Block selection survives — section + TipTap text-edit focus are
    // intentionally allowed to coexist (click anywhere in section selects it
    // AND keeps text editable).
    expect(mgr.getBlocks()).toEqual(['a']);
    expect(mgr.state).toBe('tiptap-text');
  });
});
