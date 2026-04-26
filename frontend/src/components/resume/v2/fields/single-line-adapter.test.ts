// frontend/src/components/resume/v2/fields/single-line-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import { SingleLineDocument } from '../extensions/SingleLineDocument';
import { stringToSingleLineDoc, singleLineDocToString } from './single-line-adapter';

describe('stringToSingleLineDoc', () => {
  it('empty string → empty doc', () => {
    expect(stringToSingleLineDoc('')).toEqual({ type: 'doc', content: [] });
  });
  it('non-empty string → doc with text node', () => {
    expect(stringToSingleLineDoc('hello')).toEqual({
      type: 'doc',
      content: [{ type: 'text', text: 'hello' }],
    });
  });
});

describe('singleLineDocToString roundtrip', () => {
  it('roundtrips text', () => {
    const editor = new Editor({
      extensions: [SingleLineDocument, Text],
      content: stringToSingleLineDoc('Hello world'),
    });
    expect(singleLineDocToString(editor)).toBe('Hello world');
    editor.destroy();
  });
});
