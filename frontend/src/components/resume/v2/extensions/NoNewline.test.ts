// frontend/src/components/resume/v2/extensions/NoNewline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import { SingleLineDocument } from './SingleLineDocument';
import { NoNewline } from './NoNewline';
import { atomFocusManager } from '../interaction/AtomFocusManager';

beforeEach(() => {
  // reset focus manager (it's a singleton)
  (atomFocusManager as any).editors = new Map();
  (atomFocusManager as any).order = [];
});

describe('NoNewline', () => {
  it('Enter triggers atomFocusManager.focusNext', () => {
    const focusNext = vi.spyOn(atomFocusManager, 'focusNext');
    const editor = new Editor({
      extensions: [SingleLineDocument, Paragraph, Text, NoNewline],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
      },
      fieldKey: { kind: 'entry.title', id: 'e1' },
    });
    const handled = editor.commands.keyboardShortcut('Enter');
    expect(handled).toBe(true);
    expect(focusNext).toHaveBeenCalled();
    editor.destroy();
  });
});
