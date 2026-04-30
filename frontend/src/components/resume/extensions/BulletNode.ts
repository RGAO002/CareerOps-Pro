// frontend/src/components/resume/extensions/BulletNode.ts
import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { BulletNodeView } from "./nodeViews/BulletNodeView";

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

  addNodeView() {
    return ReactNodeViewRenderer(BulletNodeView);
  },
});
