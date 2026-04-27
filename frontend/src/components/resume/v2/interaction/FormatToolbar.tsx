// frontend/src/components/resume/v2/interaction/FormatToolbar.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Link as LinkIcon, Undo2, Redo2 } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import { atomFocusManager } from './AtomFocusManager';
import { useResumeStore } from '../store/useResumeStore';

/**
 * Persistent format toolbar (v2 port of v1 FormatToolbar).
 * Operates on whichever TipTap field was last focused (via AtomFocusManager).
 *
 * Critical UX: when a toolbar button is clicked, native focus moves OUT of the
 * editable field and INTO the button. ProseMirror's selection collapses on
 * blur, so by the time the click handler runs, there's nothing to apply the
 * mark to. We work around this two ways:
 *  1. `onMouseDown={e => e.preventDefault()}` — keeps native focus in the
 *     editor (button never receives it).
 *  2. We cache the "last focused editor" in a ref so even if focus has briefly
 *     left, we can still operate on the right one.
 */
export function FormatToolbar() {
  const [, force] = useState(0);
  const lastEditorRef = useRef<Editor | null>(null);

  useEffect(() => atomFocusManager.subscribe(() => {
    const ed = atomFocusManager.currentEditor();
    if (ed) lastEditorRef.current = ed;
    force(n => n + 1);
  }), []);

  // Store changes (drag/insert/delete/duplicate) also affect undo availability,
  // so the buttons need to re-render when the store moves.
  useEffect(() => useResumeStore.subscribe(s => s.resume, () => force(n => n + 1)), []);

  const liveEditor = atomFocusManager.currentEditor();
  const editor: Editor | null = liveEditor ?? lastEditorRef.current;

  const isActive = (mark: string) => !!editor && editor.isActive(mark);
  const has = (mark: string) => !!editor && mark in editor.schema.marks;

  // Undo/redo route: focused TipTap (bullet typing) wins; falls back to
  // store undo (structural ops — drag, insert, delete, duplicate).
  const tiptapCanUndo = !!liveEditor && liveEditor.can().undo();
  const tiptapCanRedo = !!liveEditor && liveEditor.can().redo();
  const storeCanUndo = useResumeStore.getState()._undo.canUndo();
  const storeCanRedo = useResumeStore.getState()._undo.canRedo();
  const canUndo = tiptapCanUndo || storeCanUndo;
  const canRedo = tiptapCanRedo || storeCanRedo;

  const doUndo = () => {
    if (tiptapCanUndo) liveEditor!.chain().focus().undo().run();
    else if (storeCanUndo) useResumeStore.getState().undo();
  };
  const doRedo = () => {
    if (tiptapCanRedo) liveEditor!.chain().focus().redo().run();
    else if (storeCanRedo) useResumeStore.getState().redo();
  };

  const btn = (active: boolean, disabled = false) =>
    `flex size-7 items-center justify-center rounded-md transition-colors ${
      disabled
        ? 'text-neutral-300 cursor-not-allowed'
        : active
          ? 'bg-neutral-200 text-neutral-900'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
    }`;

  // Stop the toolbar button from stealing focus from the editor.
  // Without this, ProseMirror sees a blur and collapses the selection.
  const noStealFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-white/70 p-0.5">
      <button
        type="button"
        aria-label="Undo"
        title="Undo (⌘Z)"
        onMouseDown={noStealFocus}
        onClick={doUndo}
        disabled={!canUndo}
        className={btn(false, !canUndo)}
      >
        <Undo2 className="size-3.5" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="Redo"
        title="Redo (⌘⇧Z)"
        onMouseDown={noStealFocus}
        onClick={doRedo}
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
        onMouseDown={noStealFocus}
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
        onMouseDown={noStealFocus}
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
        onMouseDown={noStealFocus}
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
