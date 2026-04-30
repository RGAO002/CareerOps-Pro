// frontend/src/components/resume/extensions/ResumeSectionNode.ts
import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { SectionNodeView } from "./nodeViews/SectionNodeView";

export const ResumeSectionNode = Node.create({
  name: "resumeSection",
  group: "block",
  content: "entry+",
  defining: true,

  addAttributes() {
    return {
      heading: {
        default: "Section",
        parseHTML: (el) => el.getAttribute("data-heading") ?? "Section",
        renderHTML: (attrs) => ({ "data-heading": attrs.heading }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-resume-section]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, { "data-resume-section": "", class: "resume-section" }),
      ["h2", { class: "resume-section-heading" }, node.attrs.heading as string],
      ["div", { class: "resume-section-body" }, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SectionNodeView);
  },
});
