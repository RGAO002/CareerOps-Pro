// frontend/src/components/resume/v2/interaction/AtomFocusManager.test.ts
import { describe, it, expect, vi } from 'vitest';
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
