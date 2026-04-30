// frontend/src/components/resume/v3/interaction/__tests__/SelectionManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager, type SelectionKey } from '../SelectionManager';
import type { RowId, GroupId } from '../../schema/types';

const r = (s: string): RowId => s as RowId;
const g = (s: string): GroupId => s as GroupId;

let mgr: SelectionManager;
beforeEach(() => { mgr = new SelectionManager(); });

describe('SelectionManager (v3)', () => {
  it('select adds a single key', () => {
    mgr.select(r('a'));
    expect(mgr.getKeys()).toEqual([r('a')]);
    expect(mgr.state).toBe('block-selection');
  });

  it('select replaces previous selection', () => {
    mgr.select(r('a'));
    mgr.select(r('b'));
    expect(mgr.getKeys()).toEqual([r('b')]);
  });

  it('toggle add then remove', () => {
    mgr.toggle(r('a'));
    expect(mgr.getKeys()).toEqual([r('a')]);
    mgr.toggle(r('a'));
    expect(mgr.getKeys()).toEqual([]);
    expect(mgr.state).toBe('none');
  });

  it('toggle accepts both RowId and GroupId', () => {
    mgr.toggle(r('row-1'));
    mgr.toggle(g('grp-1'));
    expect(mgr.getKeys()).toHaveLength(2);
  });

  it('extend extends range over ordered list', () => {
    mgr.select(r('a'));
    mgr.extend(r('c'), [r('a'), r('b'), r('c'), r('d')]);
    expect(mgr.getKeys()).toEqual([r('a'), r('b'), r('c')]);
  });

  it('extend on empty selection falls back to single select', () => {
    mgr.extend(r('b'), [r('a'), r('b'), r('c')]);
    expect(mgr.getKeys()).toEqual([r('b')]);
  });

  it('extend with unknown id is a no-op', () => {
    mgr.select(r('a'));
    mgr.extend(r('zzz'), [r('a'), r('b'), r('c')]);
    expect(mgr.getKeys()).toEqual([r('a')]);
  });

  it('setKeys replaces selection wholesale', () => {
    mgr.select(r('a'));
    mgr.setKeys([r('x'), r('y')]);
    expect(mgr.getKeys()).toEqual([r('x'), r('y')]);
    mgr.setKeys([]);
    expect(mgr.state).toBe('none');
  });

  it('clear empties selection', () => {
    mgr.select(r('a'));
    mgr.clear();
    expect(mgr.getKeys()).toEqual([]);
    expect(mgr.state).toBe('none');
  });

  it('clear is a no-op when already empty (no emit)', () => {
    let count = 0;
    mgr.subscribe(() => { count++; });
    mgr.clear();
    expect(count).toBe(0);
  });

  it('subscribe fires on selection change', () => {
    let last: Set<SelectionKey> | null = null;
    mgr.subscribe(s => { last = s; });
    mgr.select(r('x'));
    expect(last).not.toBeNull();
    expect((last as unknown as Set<SelectionKey>).has(r('x'))).toBe(true);
  });

  it('multiple subscribers all receive notifications', () => {
    let a = 0; let b = 0;
    mgr.subscribe(() => { a++; });
    mgr.subscribe(() => { b++; });
    mgr.select(r('x'));
    mgr.toggle(r('y'));
    expect(a).toBe(2);
    expect(b).toBe(2);
  });

  it('unsubscribe stops notifications for that listener', () => {
    let a = 0; let b = 0;
    const unsubA = mgr.subscribe(() => { a++; });
    mgr.subscribe(() => { b++; });
    mgr.select(r('x'));
    unsubA();
    mgr.select(r('y'));
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it('hasSelection reflects state', () => {
    expect(mgr.hasSelection()).toBe(false);
    mgr.select(r('a'));
    expect(mgr.hasSelection()).toBe(true);
    mgr.clear();
    expect(mgr.hasSelection()).toBe(false);
  });

  it('notifyTipTapFocus preserves selection (coexists with text edit)', () => {
    mgr.select(r('a'));
    mgr.notifyTipTapFocus();
    expect(mgr.getKeys()).toEqual([r('a')]);
    expect(mgr.state).toBe('tiptap-text');
  });
});
