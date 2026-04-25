// frontend/src/components/resume/extensions/ResumeSectionNode.ts
import { Node, mergeAttributes } from "@tiptap/core";

/**
 * One resume section — e.g. Experience, Education, Projects.
 * Contains a `heading` attribute (string, editable via the heading UI)
 * and one or more `entry` children.
 */
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
});
