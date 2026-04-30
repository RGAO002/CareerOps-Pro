// frontend/src/components/resume/v2/interaction/AtomFocusManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Editor } from '@tiptap/core';
import { AtomFocusManager } from './AtomFocusManager';

function makeFakeEditor(): { editor: Editor; focus: ReturnType<typeof vi.fn> } {
  const focus = vi.fn();
  const editor = { commands: { focus }, isFocused: false } as unknown as Editor;
  return { editor, focus };
}

describe('AtomFocusManager', () => {
  it('register + setOrder + focusNext walks order', () => {
    const mgr = new AtomFocusManager();
    const a = makeFakeEditor();
    const b = makeFakeEditor();
    mgr.register({ kind: 'entry.title', id: 'A' }, a.editor);
    mgr.register({ kind: 'entry.meta', id: 'A' }, b.editor);
    mgr.setOrder([
      { kind: 'entry.title', id: 'A' },
      { kind: 'entry.meta', id: 'A' },
    ]);
    mgr.focusNext({ kind: 'entry.title', id: 'A' });
    expect(b.focus).toHaveBeenCalled();
    expect(a.focus).not.toHaveBeenCalled();
  });
});

describe('AtomFocusManager.focusFieldEnd', () => {
  it('calls editor.commands.focus("end") when editor is registered', () => {
    const mgr = new AtomFocusManager();
    const a = makeFakeEditor();
    mgr.register({ kind: 'bullet.content', id: 'X' }, a.editor);
    const ok = mgr.focusFieldEnd({ kind: 'bullet.content', id: 'X' });
    expect(ok).toBe(true);
    expect(a.focus).toHaveBeenCalledWith('end');
  });

  it('returns false when editor is not registered', () => {
    const mgr = new AtomFocusManager();
    const ok = mgr.focusFieldEnd({ kind: 'bullet.content', id: 'missing' });
    expect(ok).toBe(false);
  });
});

describe('AtomFocusManager.focusFieldWhenReady', () => {
  let rafCallbacks: Array<FrameRequestCallback> = [];
  let originalRaf: typeof globalThis.requestAnimationFrame;

  beforeEach(() => {
    rafCallbacks = [];
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }) as typeof globalThis.requestAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
  });

  function flushRaf(): void {
    const cbs = rafCallbacks;
    rafCallbacks = [];
    for (const cb of cbs) cb(performance.now());
  }

  it('polls until the editor registers, then focuses at start', () => {
    const mgr = new AtomFocusManager();
    const a = makeFakeEditor();

    mgr.focusFieldWhenReady({ kind: 'bullet.content', id: 'late' });
    // First tick — editor not registered yet
    flushRaf();
    expect(a.focus).not.toHaveBeenCalled();
    expect(rafCallbacks.length).toBeGreaterThan(0);

    // Now register editor and run another tick
    mgr.register({ kind: 'bullet.content', id: 'late' }, a.editor);
    flushRaf();
    expect(a.focus).toHaveBeenCalledWith('start');
  });

  it('gives up after maxAttempts ticks', () => {
    const mgr = new AtomFocusManager();
    mgr.focusFieldWhenReady({ kind: 'bullet.content', id: 'never' }, { maxAttempts: 3 });
    // Drain all attempts; after 3 it should stop scheduling
    for (let i = 0; i < 5 && rafCallbacks.length > 0; i++) flushRaf();
    expect(rafCallbacks.length).toBe(0);
  });
});
