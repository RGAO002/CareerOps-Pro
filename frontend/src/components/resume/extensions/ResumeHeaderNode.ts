// frontend/src/components/resume/extensions/ResumeHeaderNode.ts
import { Node, mergeAttributes } from "@tiptap/core";

/**
 * The top block of the resume. Contains the applicant's name (inline text)
 * and a `contacts` array attribute for contact lines (rendered as block below the name).
 *
 * Position: must be the first child of `doc` (enforced by `createResumeEditor`).
 */
export const ResumeHeaderNode = Node.create({
  name: "resumeHeader",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      contacts: {
        default: [] as string[],
        parseHTML: (el) => {
          const data = el.getAttribute("data-contacts");
          return data ? JSON.parse(data) : [];
        },
        renderHTML: (attrs) => ({
          "data-contacts": JSON.stringify(attrs.contacts ?? []),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-resume-header]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const contacts = (node.attrs.contacts as string[]) ?? [];
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-resume-header": "", class: "resume-header" }),
      ["h1", { class: "resume-name" }, 0],
      ...contacts.map((line) => ["div", { class: "resume-contact-line" }, line]),
    ];
  },
});
