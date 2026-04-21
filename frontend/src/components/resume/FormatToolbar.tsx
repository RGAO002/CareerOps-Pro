// frontend/src/components/resume/FormatToolbar.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { Bold, Italic, Link as LinkIcon, Underline as UnderlineIcon, Undo2, Redo2 } from "lucide-react";

interface Props {
  editor: Editor | null;
}

/**
 * A persistent formatting toolbar — always visible (sits inside EditorTopBar).
 * Operates on the current selection or insertion point.
 * Replaces the BubbleMenu-based FloatingToolbar for v1 because a fixed toolbar
 * is more discoverable for first-time users.
 */
export function FormatToolbar({ editor }: Props) {
  // Render a placeholder while editor is initializing so layout doesn't jump
  if (!editor) {
    return <div className="flex h-7 items-center gap-0.5" aria-hidden />;
  }

  const btn = (active: boolean, disabled = false) =>
    `flex size-7 items-center justify-center rounded-md transition-colors ${
      disabled
        ? "text-neutral-300 cursor-not-allowed"
        : active
          ? "bg-neutral-200 text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
    }`;

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-white/70 p-0.5">
      {/* Undo / Redo */}
      <button
        type="button"
        aria-label="Undo"
        title="Undo (⌘Z)"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className={btn(false, !editor.can().undo())}
      >
        <Undo2 className="size-3.5" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="Redo"
        title="Redo (⌘⇧Z)"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className={btn(false, !editor.can().redo())}
      >
        <Redo2 className="size-3.5" strokeWidth={1.8} />
      </button>

      <div className="mx-0.5 h-4 w-px bg-neutral-200" />

      {/* Bold / Italic / Underline */}
      <button
        type="button"
        aria-label="Bold"
        title="Bold (⌘B)"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive("bold"))}
      >
        <Bold className="size-3.5" strokeWidth={2.2} />
      </button>
      <button
        type="button"
        aria-label="Italic"
        title="Italic (⌘I)"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive("italic"))}
      >
        <Italic className="size-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label="Underline"
        title="Underline (⌘U)"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btn(editor.isActive("underline"))}
      >
        <UnderlineIcon className="size-3.5" strokeWidth={2} />
      </button>

      <div className="mx-0.5 h-4 w-px bg-neutral-200" />

      {/* Link */}
      <button
        type="button"
        aria-label="Link"
        title="Link"
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link URL", prev ?? "https://");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().unsetLink().run();
          } else {
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }
        }}
        className={btn(editor.isActive("link"))}
      >
        <LinkIcon className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
