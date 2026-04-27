// frontend/src/components/resume/v2/interaction/FormatToolbar.tsx
'use client';
import { useEffect, useState } from 'react';
import { Bold, Italic, Link as LinkIcon, Undo2, Redo2 } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import { atomFocusManager } from './AtomFocusManager';

/**
 * Persistent format toolbar (v2 port of v1 FormatToolbar).
 * Operates on whichever TipTap field is currently focused (via AtomFocusManager).
 * Re-renders on focus / selection / transaction events.
 *
 * Single-line fields (PlainTextField / ContactLinesField) only support Link;
 * Bold / Italic only fire when a Bullet field is focused. Undo / Redo always
 * route to the focused editor (or the v2 store undo, which is wired in
 * keyboard-router; the toolbar buttons mirror the editor-local TipTap.history).
 */
export function FormatToolbar() {
  const [, force] = useState(0);
  useEffect(() => atomFocusManager.subscribe(() => force(n => n + 1)), []);

  const editor: Editor | null = atomFocusManager.currentEditor();
  const isActive = (mark: string) => !!editor && editor.isActive(mark);
  const has = (mark: string) => !!editor && mark in editor.schema.marks;
  const canUndo = !!editor && editor.can().undo();
  const canRedo = !!editor && editor.can().redo();

  const btn = (active: boolean, disabled = false) =>
    `flex size-7 items-center justify-center rounded-md transition-colors ${
      disabled
        ? 'text-neutral-300 cursor-not-allowed'
        : active
          ? 'bg-neutral-200 text-neutral-900'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
    }`;

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-white/70 p-0.5">
      <button
        type="button"
        aria-label="Undo"
        title="Undo (⌘Z)"
        onClick={() => editor?.chain().focus().undo().run()}
        disabled={!canUndo}
        className={btn(false, !canUndo)}
      >
        <Undo2 className="size-3.5" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="Redo"
        title="Redo (⌘⇧Z)"
        onClick={() => editor?.chain().focus().redo().run()}
        disabled={!canRedo}
        className={btn(false, !canRedo)}
      >
        <Redo2 className="size-3.5" strokeWidth={1.8} />
      </button>

      <div className="mx-0.5 h-4 w-px bg-neutral-200" />

      <button
        type="button"
        aria-label="Bold"
        title="Bold (⌘B)"
        onClick={() => editor?.chain().focus().toggleBold().run()}
        disabled={!has('bold')}
        className={btn(isActive('bold'), !has('bold'))}
      >
        <Bold className="size-3.5" strokeWidth={2.2} />
      </button>
      <button
        type="button"
        aria-label="Italic"
        title="Italic (⌘I)"
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        disabled={!has('italic')}
        className={btn(isActive('italic'), !has('italic'))}
      >
        <Italic className="size-3.5" strokeWidth={2} />
      </button>

      <div className="mx-0.5 h-4 w-px bg-neutral-200" />

      <button
        type="button"
        aria-label="Link"
        title="Link"
        onClick={() => {
          if (!editor) return;
          const prev = editor.getAttributes('link').href as string | undefined;
          const url = window.prompt('Link URL', prev ?? 'https://');
          if (url === null) return;
          if (url === '') {
            editor.chain().focus().unsetLink().run();
          } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }
        }}
        disabled={!has('link')}
        className={btn(isActive('link'), !has('link'))}
      >
        <LinkIcon className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
