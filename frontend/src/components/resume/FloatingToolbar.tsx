// frontend/src/components/resume/FloatingToolbar.tsx
"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { Bold, Italic, Link as LinkIcon, Underline as UnderlineIcon } from "lucide-react";

export function FloatingToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const btn = (active: boolean) =>
    `flex size-7 items-center justify-center rounded-md transition-colors ${
      active ? "bg-neutral-200 text-neutral-900" : "text-neutral-700 hover:bg-neutral-100"
    }`;

  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
    >
      <button
        type="button"
        aria-label="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive("bold"))}
      >
        <Bold className="size-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive("italic"))}
      >
        <Italic className="size-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label="Underline"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btn(editor.isActive("underline"))}
      >
        <UnderlineIcon className="size-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label="Link"
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
    </BubbleMenu>
  );
}
