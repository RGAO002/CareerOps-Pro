// frontend/src/components/resume/extensions/createResumeEditor.ts
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

import { ResumeHeaderNode } from "./ResumeHeaderNode";
import { ResumeSectionNode } from "./ResumeSectionNode";
import { EntryNode } from "./EntryNode";
import { BulletNode } from "./BulletNode";

import type { ResumeDoc } from "../types";

/**
 * Custom doc node — replaces StarterKit's default which allows any block.
 * Resume top-level shape: one ResumeHeader followed by one or more ResumeSections.
 */
const ResumeDocNode = Node.create({
  name: "doc",
  topNode: true,
  content: "resumeHeader resumeSection+",
});

/**
 * Returns the configured TipTap extensions + initial content for a resume doc.
 * Pass to `useEditor({ ...createResumeEditorExtensions(doc), ... })`.
 */
export function createResumeEditorExtensions(doc: ResumeDoc) {
  return {
    extensions: [
      // StarterKit provides: paragraph, text, history (undo/redo),
      // marks (bold, italic, strike, code), keymap.
      // We disable the default `document` because we supply our own (above).
      // We also disable nodes we don't need to keep the schema small.
      StarterKit.configure({
        document: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: false, // we add Link extension separately below
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "resume-link" },
      }),

      ResumeDocNode,
      ResumeHeaderNode,
      ResumeSectionNode,
      EntryNode,
      BulletNode,
    ],
    content: doc as unknown as object,
  };
}

export type ResumeEditorInit = ReturnType<typeof createResumeEditorExtensions>;
