import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import * as React from 'react';
import { act } from 'react';
import type { Editor } from '@tiptap/core';
import { v3RowExtensions } from '../../schema/pmSchema';

const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});

const extensions = [TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions];

const fixtureContent = {
  type: 'doc',
  content: [
    { type: 'header_name', attrs: { id: 'r1' }, content: [{ type: 'text', text: 'Alice' }] },
    { type: 'plain', attrs: { id: 'r2' }, content: [{ type: 'text', text: 'one' }] },
    { type: 'bullet', attrs: { id: 'r3' }, content: [{ type: 'text', text: 'two' }] },
    { type: 'plain', attrs: { id: 'r4', semanticGroupId: 'gE' } },
  ],
};

function MountFixture({ onReady }: { onReady: (e: Editor) => void }) {
  const editor = useEditor({
    extensions,
    content: fixtureContent,
    immediatelyRender: false,
  });
  React.useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);
  if (!editor) return null;
  return <EditorContent editor={editor} />;
}

async function flushFrames() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

afterEach(() => {
  cleanup();
});

describe('F1 wrapper-selector contract', () => {
  it('rows are NOT direct children of view.dom (ReactNodeViewRenderer wraps them)', async () => {
    let editorRef: Editor | null = null;
    render(<MountFixture onReady={(e) => (editorRef = e)} />);
    await flushFrames();
    expect(editorRef).toBeTruthy();
    const view = editorRef!.view;

    // NEGATIVE: :scope > .row matches 0 (rows are wrapped by .react-renderer divs)
    const direct = view.dom.querySelectorAll(':scope > .row');
    expect(direct.length).toBe(0);
  });

  it('rows ARE found via :scope > div > .row (the canonical wrapper-selector)', async () => {
    let editorRef: Editor | null = null;
    render(<MountFixture onReady={(e) => (editorRef = e)} />);
    await flushFrames();
    expect(editorRef).toBeTruthy();
    const view = editorRef!.view;

    // POSITIVE: :scope > div > .row matches 4 (one per fixture row)
    const wrapped = view.dom.querySelectorAll(':scope > div > .row');
    expect(wrapped.length).toBe(4);
  });

  it('empty plain rows expose group id like other authored rows', async () => {
    let editorRef: Editor | null = null;
    render(<MountFixture onReady={(e) => (editorRef = e)} />);
    await flushFrames();
    expect(editorRef).toBeTruthy();
    const view = editorRef!.view;

    const emptyPlain = view.dom.querySelector<HTMLElement>(':scope > div > .row[data-row-id="r4"]');
    expect(emptyPlain).toBeTruthy();
    expect(emptyPlain?.getAttribute('data-group-id')).toBe('gE');
  });
});
