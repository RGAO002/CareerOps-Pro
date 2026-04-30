// frontend/src/components/resume/v2/fields/single-line-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import TextAlign from '@tiptap/extension-text-align';
import { SingleLineDocument } from '../extensions/SingleLineDocument';
import {
  stringToSingleLineDoc, singleLineDocToString, alignFromDoc,
} from './single-line-adapter';

describe('stringToSingleLineDoc', () => {
  it('empty string → empty paragraph wrapper', () => {
    expect(stringToSingleLineDoc('')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
  });
  it('non-empty string → paragraph wrapping a text node', () => {
    expect(stringToSingleLineDoc('hello')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    });
  });
  it('with align="center" stamps textAlign on the paragraph', () => {
    expect(stringToSingleLineDoc('hi', 'center')).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { textAlign: 'center' },
        content: [{ type: 'text', text: 'hi' }],
      }],
    });
  });
  it('with align="left" omits attrs (left is the default)', () => {
    expect(stringToSingleLineDoc('hi', 'left')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    });
  });
});

describe('singleLineDocToString roundtrip', () => {
  it('roundtrips text', () => {
    const editor = new Editor({
      extensions: [SingleLineDocument, Paragraph, Text],
      content: stringToSingleLineDoc('Hello world'),
    });
    expect(singleLineDocToString(editor)).toBe('Hello world');
    editor.destroy();
  });
});

describe('alignFromDoc', () => {
  it('returns center when paragraph has textAlign=center', () => {
    const editor = new Editor({
      extensions: [
        SingleLineDocument, Paragraph, Text,
        TextAlign.configure({ types: ['paragraph'] }),
      ],
      content: stringToSingleLineDoc('x', 'center'),
    });
    expect(alignFromDoc(editor)).toBe('center');
    editor.destroy();
  });
  it('returns undefined when paragraph has no textAlign', () => {
    const editor = new Editor({
      extensions: [
        SingleLineDocument, Paragraph, Text,
        TextAlign.configure({ types: ['paragraph'] }),
      ],
      content: stringToSingleLineDoc('x'),
    });
    expect(alignFromDoc(editor)).toBeUndefined();
    editor.destroy();
  });
});
