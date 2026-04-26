// frontend/src/components/resume/v2/fields/single-line-adapter.ts
import type { Editor } from '@tiptap/core';
import type { SingleLineDoc } from '../types';

export function stringToSingleLineDoc(s: string): SingleLineDoc {
  if (!s) return { type: 'doc', content: [] };
  return { type: 'doc', content: [{ type: 'text', text: s }] };
}

export function singleLineDocToString(editor: Editor): string {
  return editor.getText();
}
