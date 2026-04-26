// frontend/src/components/resume/extensions/EntryNode.ts
import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { EntryNodeView } from "./nodeViews/EntryNodeView";

export const EntryNode = Node.create({
  name: "entry",
  group: "block",
  content: "bullet+",
  defining: true,

  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") ?? "",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
      meta: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-meta") ?? "",
        renderHTML: (attrs) => ({ "data-meta": attrs.meta }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-resume-entry]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-resume-entry": "", class: "resume-entry" }),
      ["div", { class: "resume-entry-title" }, node.attrs.title as string],
      ["div", { class: "resume-entry-meta" }, node.attrs.meta as string],
      ["ul", { class: "resume-entry-bullets" }, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EntryNodeView);
  },
});
