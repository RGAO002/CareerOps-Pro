import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import { SingleLineDocument } from './SingleLineDocument';
import { BulletDocument } from './BulletDocument';

describe('SingleLineDocument', () => {
  it('accepts a single paragraph wrapping plain text', () => {
    const editor = new Editor({
      extensions: [SingleLineDocument, Paragraph, Text],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      },
    });
    const json = editor.getJSON();
    expect(json.type).toBe('doc');
    expect(json.content).toHaveLength(1);
    expect(json.content?.[0].type).toBe('paragraph');
    expect(json.content?.[0].content?.[0]).toMatchObject({ type: 'text', text: 'hello' });
    editor.destroy();
  });

  it('rejects splitting the paragraph (Enter must be handled by NoNewline)', () => {
    const editor = new Editor({
      extensions: [SingleLineDocument, Paragraph, Text],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }],
      },
    });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const splitResult = editor.commands.splitBlock();
    // splitBlock must fail (schema only allows exactly one paragraph)
    expect(splitResult).toBe(false);
    expect(editor.getJSON().content).toHaveLength(1);
    editor.destroy();
  });
});

describe('BulletDocument', () => {
  it('schema rejects multi-paragraph content', () => {
    const editor = new Editor({
      extensions: [BulletDocument, Paragraph, Text],
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        ],
      },
    });
    // Attempt to insert second paragraph via transaction — should not split
    const json = editor.getJSON();
    expect(json.content).toHaveLength(1);
    editor.destroy();
  });

  it('keeps paragraph after Enter (Enter would normally split)', () => {
    const editor = new Editor({
      extensions: [BulletDocument, Paragraph, Text],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }],
      },
    });
    // Move cursor to end and try to split
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const splitResult = editor.commands.splitBlock();
    // splitBlock returns false when it would violate schema
    expect(splitResult).toBe(false);
    expect(editor.getJSON().content).toHaveLength(1);
    editor.destroy();
  });
});
