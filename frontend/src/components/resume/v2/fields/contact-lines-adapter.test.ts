// frontend/src/components/resume/v2/fields/contact-lines-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import Link from '@tiptap/extension-link';
import { SingleLineWithMarksDocument } from '../extensions/SingleLineWithMarksDocument';
import { contactItemsToDoc, docToContactItems } from './contact-lines-adapter';
import type { ContactItem } from '../types';

describe('contactItemsToDoc', () => {
  it('renders text + link items separated by visual separator', () => {
    const items: ContactItem[] = [
      { type: 'text', value: 'a@b.com' },
      { type: 'link', label: 'Github', url: 'https://github.com/a' },
    ];
    const doc = contactItemsToDoc(items);
    expect(doc.type).toBe('doc');
    // first segment text, separator, then link mark on Github
    expect(doc.content[0]).toMatchObject({ type: 'text', text: 'a@b.com' });
    expect(doc.content[2]).toMatchObject({
      type: 'text', text: 'Github',
      marks: [{ type: 'link', attrs: { href: 'https://github.com/a' } }],
    });
  });
});

describe('docToContactItems roundtrip', () => {
  it('roundtrips text + link', () => {
    const items: ContactItem[] = [
      { type: 'text', value: 'a@b.com' },
      { type: 'link', label: 'GH', url: 'https://x.com' },
    ];
    const editor = new Editor({
      extensions: [SingleLineWithMarksDocument, Text, Link],
      content: contactItemsToDoc(items),
    });
    const out = docToContactItems(editor);
    expect(out).toEqual(items);
    editor.destroy();
  });
});
