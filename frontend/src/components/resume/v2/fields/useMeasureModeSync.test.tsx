import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EditorContent, useEditor } from '@tiptap/react';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import { useMeasureModeSync } from './useMeasureModeSync';
import { SingleLineDocument } from '../extensions/SingleLineDocument';
import { stringToSingleLineDoc } from './single-line-adapter';

function TestField({ value, mode }: { value: string; mode: 'edit' | 'export' | 'measure' }) {
  const editor = useEditor({
    extensions: [SingleLineDocument, Paragraph, Text],
    content: stringToSingleLineDoc(value),
    immediatelyRender: false,
    editable: mode === 'edit',
  });
  useMeasureModeSync(mode, editor, value, stringToSingleLineDoc);
  return <EditorContent editor={editor} data-testid="ed" />;
}

describe('useMeasureModeSync', () => {
  it('measure mode: prop change syncs into editor', () => {
    const { rerender, getByTestId } = render(<TestField value="hello" mode="measure" />);
    expect(getByTestId('ed').textContent).toContain('hello');
    rerender(<TestField value="world" mode="measure" />);
    expect(getByTestId('ed').textContent).toContain('world');
  });

  it('edit mode: prop change does NOT sync into editor', () => {
    const { rerender, getByTestId } = render(<TestField value="hello" mode="edit" />);
    expect(getByTestId('ed').textContent).toContain('hello');
    rerender(<TestField value="world" mode="edit" />);
    expect(getByTestId('ed').textContent).toContain('hello');  // unchanged
  });

  it('export mode: prop change does NOT sync into editor', () => {
    const { rerender, getByTestId } = render(<TestField value="hello" mode="export" />);
    rerender(<TestField value="world" mode="export" />);
    expect(getByTestId('ed').textContent).toContain('hello');
  });
});
