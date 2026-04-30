import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { BulletDocument } from './BulletDocument';
import { MarkdownInputRules } from './MarkdownInputRules';

/** Simulate typing one character via the view's handleTextInput hook —
 *  this is the path that triggers ProseMirror input rules.
 *  insertContent / chained commands skip handleTextInput and never fire input rules. */
function typeChar(editor: Editor, ch: string): void {
  const { view } = editor;
  const { from, to } = view.state.selection;
  const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch));
  if (!handled) {
    const tr = view.state.tr.insertText(ch, from, to);
    view.dispatch(tr);
  }
}

function typeString(editor: Editor, s: string): void {
  for (const ch of s) typeChar(editor, ch);
}

describe('MarkdownInputRules', () => {
  it('**foo** triggers bold input rule', () => {
    const editor = new Editor({
      extensions: [BulletDocument, Paragraph, Text, Bold, Italic, Link, MarkdownInputRules],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    typeString(editor, '**foo**');
    const json = editor.getJSON();
    const text = json.content?.[0].content?.[0];
    expect(text).toMatchObject({ type: 'text', text: 'foo', marks: [{ type: 'bold' }] });
    editor.destroy();
  });
});
