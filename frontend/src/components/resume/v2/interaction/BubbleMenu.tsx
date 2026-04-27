'use client';
import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';

interface Props {
  editor: Editor | null;
}

export function BubbleMenu({ editor }: Props) {
  if (!editor) return null;
  return (
    <TiptapBubbleMenu
      editor={editor}
      shouldShow={({ editor, from, to }) => from !== to && editor.isFocused}
    >
      <div
        style={{
          display: 'flex', gap: 4, background: 'white',
          border: '1px solid #ccc', borderRadius: 6, padding: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          style={{ fontWeight: editor.isActive('bold') ? 'bold' : 'normal' }}
        >B</button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          style={{ fontStyle: editor.isActive('italic') ? 'italic' : 'normal' }}
        >I</button>
        <button
          onClick={() => {
            const href = window.prompt('URL');
            if (href) editor.chain().focus().setLink({ href }).run();
          }}
        >Link</button>
      </div>
    </TiptapBubbleMenu>
  );
}
