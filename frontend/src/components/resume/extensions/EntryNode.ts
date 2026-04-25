// frontend/src/components/resume/extensions/EntryNode.ts
import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A single entry inside a section — e.g. a job, a degree, or a project.
 * Holds `title` and `meta` as attributes (rendered as two lines) and contains
 * one or more `bullet` children.
 */
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
});
