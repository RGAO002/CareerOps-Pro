// frontend/src/components/resume/seed.ts
import type { ResumeDoc, ResumeMeta } from "./types";

export const SEED_META: ResumeMeta = {
  id: "base",
  title: "Base resume",
  schema_version: 1,
  updated_at: new Date().toISOString(),
  target_company: null,
  target_company_domain: null,
  target_role: null,
};

/**
 * The seed document uses the 4 custom nodes defined in Tasks 3-6.
 * Shape mirrors the TipTap schema exactly.
 */
export const SEED_DOC: ResumeDoc = {
  type: "doc",
  content: [
    {
      type: "resumeHeader",
      content: [
        { type: "text", text: "Alex Chen" },
      ],
      attrs: {
        contacts: [
          "alex.chen@example.com",
          "+1 (555) 012-3456",
          "linkedin.com/in/alexchen  ·  github.com/alexchen",
          "San Francisco, CA",
        ],
      },
    },
    {
      type: "resumeSection",
      attrs: { heading: "Experience" },
      content: [
        {
          type: "entry",
          attrs: {
            title: "Founding Full-Stack Engineer @ Snapbrillia",
            meta: "Jan 2024 – Present · Remote",
          },
          content: [
            {
              type: "bullet",
              content: [
                { type: "text", text: "Designed and shipped " },
                { type: "text", marks: [{ type: "bold" }], text: "12 REST APIs" },
                { type: "text", text: " in Node.js, cutting average response time by 40%." },
              ],
            },
            {
              type: "bullet",
              content: [
                { type: "text", text: "Led early architecture decisions across data modeling, API design, and deployment pipelines." },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "resumeSection",
      attrs: { heading: "Education" },
      content: [
        {
          type: "entry",
          attrs: {
            title: "BS Computer Science · UC Riverside",
            meta: "2020 – 2024 · GPA 3.82 / 4.0",
          },
          content: [
            {
              type: "bullet",
              content: [
                { type: "text", text: "Coursework: Distributed Systems, Compilers, Machine Learning" },
              ],
            },
          ],
        },
      ],
    },
  ],
};
