// frontend/src/components/resume/v2/fields/single-line-adapter.ts
import type { Editor } from '@tiptap/core';
import type { SingleLineDoc } from '../types';

export type Align = 'left' | 'center' | 'right';

/**
 * Build a SingleLineDoc (single-paragraph wrap around the given text). When
 * `align` is provided and not 'left', it's stamped onto the paragraph's
 * attrs.textAlign so TipTap's TextAlign extension picks it up.
 */
export function stringToSingleLineDoc(s: string, align?: Align): SingleLineDoc {
  const paragraph: SingleLineDoc['content'][0] = { type: 'paragraph' };
  if (align && align !== 'left') paragraph.attrs = { textAlign: align };
  if (s) paragraph.content = [{ type: 'text', text: s }];
  return { type: 'doc', content: [paragraph] };
}

export function singleLineDocToString(editor: Editor): string {
  return editor.getText();
}

/**
 * Read the current paragraph's textAlign attr from the editor JSON.
 * Returns undefined when not set or set to 'left' (the default).
 */
export function alignFromDoc(editor: Editor): Align | undefined {
  const json = editor.getJSON() as { content?: Array<{ attrs?: { textAlign?: string } }> };
  const para = json.content?.[0];
  const v = para?.attrs?.textAlign;
  if (v === 'center' || v === 'right') return v;
  return undefined;
}
