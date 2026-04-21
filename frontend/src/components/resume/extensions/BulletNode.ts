// frontend/src/components/resume/extensions/BulletNode.ts
import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A single bullet — inline text content with marks (bold, italic, underline, link).
 * Enter at end of a non-empty bullet creates a new bullet (via EntryNode's schema).
 * Enter on empty bullet exits the entry (handled in createResumeEditor at Task 8).
 */
export const BulletNode = Node.create({
  name: "bullet",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "li[data-resume-bullet]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(HTMLAttributes, { "data-resume-bullet": "", class: "resume-bullet" }),
      0,
    ];
  },
});
