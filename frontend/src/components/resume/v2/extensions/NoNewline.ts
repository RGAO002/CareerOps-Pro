// frontend/src/components/resume/v2/extensions/NoNewline.ts
import { Extension } from '@tiptap/core';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import type { EditableField } from '../types';

declare module '@tiptap/core' {
  interface EditorOptions {
    fieldKey?: EditableField;
  }
}

export const NoNewline = Extension.create({
  name: 'noNewline',
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const f = this.editor.options.fieldKey;
        if (f) atomFocusManager.focusNext(f);
        return true;
      },
      'Shift-Enter': () => {
        const f = this.editor.options.fieldKey;
        if (f) atomFocusManager.focusNext(f);
        return true;
      },
    };
  },
});
