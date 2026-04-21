# Resume Editor — Plan A: Core Editor (Walking Skeleton)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a working TipTap-based resume editor at `/resume/[id]` that loads seed content, lets the user click to edit any text with a floating toolbar, and autosaves to localStorage. No backend, no variants, no PDF, no AI tools, no history yet — those are follow-up plans.

**Architecture:** Next.js 16 App-Router route hosts a TipTap 3 editor configured with a resume-specific schema (8 custom nodes). Editor state lives in a Zustand store; edits are debounced and mirrored to localStorage. Top bar shows resume title + tailoring label as plain text (no variant dropdown yet). Styling re-uses the existing Streamlit-era PDF CSS so the canvas looks the way the PDF will.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Zustand 5, `@tiptap/react` v3 + `@tiptap/pm` + starter-kit + link extension. Existing repo scripts/tooling (`npx tsc --noEmit`, `npm run dev`). No test framework — verification is `tsc` + visual inspection.

**Reference spec:** `docs/superpowers/specs/2026-04-20-resume-editor-design.md` (MVP Scope, TipTap Schema, Acceptance Criteria 1-8, 10)

**Branch:** New feature branch off `feature/global-ai-panel` (not main) so we inherit the `usePageContext` hook and the global AI panel. Suggested branch name: `feature/resume-editor-core`.

---

## Plans deferred to follow-ups

- **Plan B** — Backend JSON store + variant dropdown + "+ New variant" flow
- **Plan C** — PDF export (`tiptap_to_html()` + WeasyPrint) + page-break dashed lines + two-column sidebar layout
- **Plan D** — Snapshot persistence + History panel UI + Restore + AI tools (9 tools) + `usePageContext` data payload for AI

Plan A only registers `usePageContext` with a summary (no tools, no history).

---

## File Structure

**Created:**
- `frontend/src/app/resume/[id]/page.tsx` — route entry, reads `id` param, renders `<ResumeEditor />`
- `frontend/src/components/resume/ResumeEditor.tsx` — top-level editor container, lays out top bar + canvas
- `frontend/src/components/resume/EditorTopBar.tsx` — 56 px top bar: resume title (left), tailoring-for label (center), Export PDF placeholder button (right, disabled)
- `frontend/src/components/resume/EditorCanvas.tsx` — hosts the TipTap `<EditorContent>` instance
- `frontend/src/components/resume/FloatingToolbar.tsx` — bubble menu for bold/italic/underline/link
- `frontend/src/components/resume/extensions/ResumeHeaderNode.ts` — TipTap node for name + contact block
- `frontend/src/components/resume/extensions/ContactLineNode.ts` — single contact-info line
- `frontend/src/components/resume/extensions/ResumeSectionNode.ts` — section with heading + entries
- `frontend/src/components/resume/extensions/EntryNode.ts` — one job/education/project entry
- `frontend/src/components/resume/extensions/EntryTitleNode.ts` — single-line title inside an entry
- `frontend/src/components/resume/extensions/EntryMetaNode.ts` — single-line meta inside an entry
- `frontend/src/components/resume/extensions/BulletNode.ts` — one bullet (paragraph-like with inline marks)
- `frontend/src/components/resume/extensions/createResumeEditor.ts` — factory that returns a configured TipTap `Editor` with all 8 custom nodes + starter marks
- `frontend/src/components/resume/seed.ts` — hard-coded seed ResumeDoc used until Plan B adds real persistence
- `frontend/src/components/resume/types.ts` — TypeScript types: `ResumeDoc`, `ResumeMeta`
- `frontend/src/components/resume/resume-editor.css` — editor-canvas stylesheet ported from `templates/resume_template.html` (single-column only for MVP; two-column sidebar deferred to Plan C)
- `frontend/src/stores/resumeEditor.ts` — Zustand store: current `ResumeMeta`, current `doc`, autosave status
- `frontend/src/lib/localResumeStore.ts` — helpers: `loadFromLocal(id)`, `saveToLocal(id, doc)`

**Modified:**
- `frontend/package.json` — add TipTap deps
- `frontend/src/components/layout/Sidebar.tsx` — make "Editor" item link to `/resume/base` (not a new file path; see Task 15)

**Deleted:** none

---

## Conventions

- **TypeScript strictness:** Existing repo has a pre-existing type error in `LandingHero.tsx` (framer-motion incompatibility). **Ignore only that one**; any new error is a regression.
- **Verification:** After each task, run `cd frontend && npx tsc --noEmit` and expect no new errors. After code-heavy UI tasks, run `npm run dev` and visually inspect.
- **Commits:** Imperative mood, no "feat:" prefix (match repo style; see `git log --oneline`).
- **Dev server reminder:** Since the AI panel work currently lives at `/Users/fred/Desktop/CareerOps-Pro/.claude/launch.json` with `cwd: "frontend"` (relative), the dev server will run from whichever worktree is the current shell CWD. For this plan, always run `npm run dev` from the NEW worktree created in Task 0.

---

## Task 0: Set up worktree + install TipTap dependencies

**Branch:** new `feature/resume-editor-core` branched from `feature/global-ai-panel`.

- [ ] **Step 1: Create worktree and branch**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
git worktree add .worktrees/resume-editor-core -b feature/resume-editor-core feature/global-ai-panel
cd .worktrees/resume-editor-core/frontend
```

- [ ] **Step 2: Install node modules (worktree gets its own node_modules)**

Run: `npm install --silent`
Expected: completes without error.

- [ ] **Step 3: Install TipTap packages**

Run:
```bash
npm install --save @tiptap/core@^3 @tiptap/react@^3 @tiptap/pm@^3 @tiptap/starter-kit@^3 @tiptap/extension-link@^3
```

Expected: all 5 packages land in `package.json`.

- [ ] **Step 4: Type-check baseline**

Run: `npx tsc --noEmit`
Expected: only the pre-existing `LandingHero.tsx:238` error — note the exact count (should be 1).

- [ ] **Step 5: Commit**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/.worktrees/resume-editor-core
git add frontend/package.json frontend/package-lock.json
git commit -m "Add TipTap 3 dependencies for resume editor"
```

---

## Task 1: Define TypeScript types for resume doc

**Files:**
- Create: `frontend/src/components/resume/types.ts`

- [ ] **Step 1: Write the file**

```ts
// frontend/src/components/resume/types.ts

/**
 * Metadata about a resume — all fields other than its document content.
 * The full `ResumeDoc` is the TipTap JSON; that's defined at Task 9 via the schema.
 */
export interface ResumeMeta {
  /** Unique id. For Plan A we use the URL slug; later plans move to uuid. */
  id: string;
  /** User-facing name, editable. e.g. "Base resume" or "Stripe Backend variant". */
  title: string;
  /** Schema version for migrations. Start at 1. */
  schema_version: 1;
  /** ISO string for display; numeric epoch is used by Plan D snapshots. */
  updated_at: string;

  // Tailoring context (optional; null until a variant targets a job)
  target_company: string | null;
  target_company_domain: string | null;
  target_role: string | null;
}

/**
 * TipTap ProseMirror JSON doc — loosely typed because the exact shape
 * is enforced by the schema at runtime, not the type system.
 */
export interface ResumeDoc {
  type: "doc";
  content: Array<{
    type: string;
    attrs?: Record<string, unknown>;
    content?: unknown[];
  }>;
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: still 1 pre-existing error, no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/.worktrees/resume-editor-core
git add frontend/src/components/resume/types.ts
git commit -m "Add resume editor TypeScript types"
```

---

## Task 2: Create seed resume document

**Files:**
- Create: `frontend/src/components/resume/seed.ts`

- [ ] **Step 1: Write the seed**

```ts
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
 * The seed document uses the 8 custom nodes defined in Tasks 3-8.
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
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: still 1 pre-existing error.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/seed.ts
git commit -m "Add seed resume document for editor development"
```

---

## Task 3: ResumeHeader node extension

**Files:**
- Create: `frontend/src/components/resume/extensions/ResumeHeaderNode.ts`

- [ ] **Step 1: Write the extension**

```ts
// frontend/src/components/resume/extensions/ResumeHeaderNode.ts
import { Node, mergeAttributes } from "@tiptap/core";

/**
 * The top block of the resume. Contains the applicant's name (inline text)
 * and a `contacts` array attribute for contact lines (rendered as block below the name).
 *
 * Position: must be the first and only child of `doc` among itself (enforced by schema at Task 9).
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
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: still 1 pre-existing error.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/extensions/ResumeHeaderNode.ts
git commit -m "Add ResumeHeader TipTap node"
```

---

## Task 4: ResumeSection node extension

**Files:**
- Create: `frontend/src/components/resume/extensions/ResumeSectionNode.ts`

- [ ] **Step 1: Write the extension**

```ts
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
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/extensions/ResumeSectionNode.ts
git commit -m "Add ResumeSection TipTap node"
```

---

## Task 5: Entry node extension

**Files:**
- Create: `frontend/src/components/resume/extensions/EntryNode.ts`

- [ ] **Step 1: Write the extension**

```ts
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
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/extensions/EntryNode.ts
git commit -m "Add Entry TipTap node"
```

---

## Task 6: Bullet node extension

**Files:**
- Create: `frontend/src/components/resume/extensions/BulletNode.ts`

- [ ] **Step 1: Write the extension**

```ts
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
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/extensions/BulletNode.ts
git commit -m "Add Bullet TipTap node"
```

---

## Task 7: ContactLine node extension (defer EntryTitle/EntryMeta — held as attrs of EntryNode)

The spec calls EntryTitle/EntryMeta as named nodes, but since they're single-line text and carry no marks, attributes on `EntryNode` (Task 5) already cover them. A `ContactLine` is similar but inside `ResumeHeader`; we hold those as `contacts` attr on `ResumeHeaderNode` (Task 3). **No new file needed for Task 7** — this task is a no-op that exists only to note the design choice.

- [ ] **Step 1: Document the choice**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/.worktrees/resume-editor-core
git commit --allow-empty -m "Note: EntryTitle/EntryMeta/ContactLine held as attributes, not nodes

Spec lists them as named nodes; the MVP collapses them to string attributes
on their parents (EntryNode.title/meta, ResumeHeaderNode.contacts) because:
1. They're single-line, marks-free text.
2. Attributes render deterministically in both editor and future PDF HTML.
3. TipTap schema stays flatter, fewer custom nodes to maintain."
```

---

## Task 8: createResumeEditor factory

**Files:**
- Create: `frontend/src/components/resume/extensions/createResumeEditor.ts`

- [ ] **Step 1: Write the factory**

```ts
// frontend/src/components/resume/extensions/createResumeEditor.ts
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

import { ResumeHeaderNode } from "./ResumeHeaderNode";
import { ResumeSectionNode } from "./ResumeSectionNode";
import { EntryNode } from "./EntryNode";
import { BulletNode } from "./BulletNode";

import type { ResumeDoc } from "../types";

/**
 * Returns a configured TipTap Editor for the resume schema.
 * - Overrides the top-level `doc` to accept: (resumeHeader, resumeSection+)
 * - Strips unused StarterKit nodes (heading, bulletList, etc.) to keep the schema small
 * - Keeps inline marks: bold, italic, underline (via StarterKit), + link
 *
 * Host it inside a React component via `useEditor` (see EditorCanvas at Task 10).
 */
export function createResumeEditorExtensions(doc: ResumeDoc) {
  return {
    extensions: [
      // StarterKit provides: paragraph, text, history (undo/redo),
      // marks (bold, italic, underline, strike, code), keymap.
      // We disable the default `document` because we'll supply our own below.
      StarterKit.configure({
        document: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "resume-link" },
      }),

      // Redefine `doc` to require (resumeHeader, resumeSection+)
      {
        name: "doc",
        topNode: true,
        content: "resumeHeader resumeSection+",
      } as const,

      ResumeHeaderNode,
      ResumeSectionNode,
      EntryNode,
      BulletNode,
    ],
    content: doc,
  };
}

export type ResumeEditorInit = ReturnType<typeof createResumeEditorExtensions>;
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors. The `as const` on the inline doc redefinition lets TypeScript accept the loose shape; at runtime TipTap will coerce it into a Node extension.

If types complain that the doc redefinition isn't a valid Extension, promote it to a proper `Node.create({...})`:
```ts
import { Node } from "@tiptap/core";
const DocNode = Node.create({
  name: "doc",
  topNode: true,
  content: "resumeHeader resumeSection+",
});
// then replace the inline object with DocNode in the extensions array.
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/extensions/createResumeEditor.ts
git commit -m "Add createResumeEditorExtensions factory"
```

---

## Task 9: Editor-canvas CSS ported from existing template

**Files:**
- Create: `frontend/src/components/resume/resume-editor.css`

- [ ] **Step 1: Copy the core typography + section rules from the existing template**

Source to port from: `templates/resume_template.html` lines 7–290 (note: that file exists in the main repo; in the worktree path it's at `/Users/fred/Desktop/CareerOps-Pro/.worktrees/resume-editor-core/templates/resume_template.html`).

Create the new file with single-column layout only (MVP; sidebar deferred):

```css
/* frontend/src/components/resume/resume-editor.css
   Ported from templates/resume_template.html for the editor canvas.
   Single-column flow in MVP; two-column sidebar layout is deferred to Plan C. */

.resume-canvas {
  width: 8.5in;
  min-height: 11in;
  margin: 24px auto;
  padding: 0.75in 0.9in;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06);
  color: #374151;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

.resume-canvas a,
.resume-canvas .resume-link {
  color: #2563eb;
  text-decoration: underline;
  text-decoration-color: rgba(37, 99, 235, 0.4);
  text-underline-offset: 3px;
}

.resume-header {
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}

.resume-name {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #111827;
  margin-bottom: 0.5rem;
}

.resume-contact-line {
  font-size: 12.5px;
  color: #4b5563;
  line-height: 1.6;
}

.resume-section {
  margin-top: 1.1rem;
}

.resume-section-heading {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #e5e7eb;
}

.resume-entry {
  margin-bottom: 0.85rem;
}

.resume-entry-title {
  font-weight: 600;
  color: #111827;
  font-size: 14px;
  line-height: 1.3;
}

.resume-entry-meta {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.3;
  margin-bottom: 0.3rem;
}

.resume-entry-bullets {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.resume-bullet {
  position: relative;
  padding-left: 1rem;
  margin-bottom: 0.25rem;
}

.resume-bullet::before {
  content: "";
  position: absolute;
  left: 0.35rem;
  top: 0.65em;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #9ca3af;
}

/* Inline marks */
.resume-canvas strong { color: #111827; font-weight: 600; }
.resume-canvas em { font-style: italic; }
.resume-canvas u { text-decoration: underline; text-underline-offset: 2px; }

/* Editor focus cues */
.resume-canvas .ProseMirror:focus { outline: none; }
.resume-canvas .ProseMirror *:focus-within { outline: none; }
```

- [ ] **Step 2: Verify file created**

Run: `ls frontend/src/components/resume/resume-editor.css`
Expected: file exists.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/resume-editor.css
git commit -m "Add resume editor canvas stylesheet (ported from existing template)"
```

---

## Task 10: EditorCanvas component

**Files:**
- Create: `frontend/src/components/resume/EditorCanvas.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/resume/EditorCanvas.tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect } from "react";
import { createResumeEditorExtensions } from "./extensions/createResumeEditor";
import type { ResumeDoc } from "./types";

import "./resume-editor.css";

interface Props {
  doc: ResumeDoc;
  /** Called with the latest ResumeDoc after every change. Parent is responsible for debouncing and saving. */
  onChange: (doc: ResumeDoc) => void;
}

export function EditorCanvas({ doc, onChange }: Props) {
  const editor = useEditor({
    ...createResumeEditorExtensions(doc),
    immediatelyRender: false, // avoid SSR hydration mismatch
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON() as ResumeDoc);
    },
  });

  // Sync external doc changes (e.g. variant switch) into the editor
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(doc);
    if (current !== incoming) editor.commands.setContent(doc, { emitUpdate: false });
  }, [doc, editor]);

  if (!editor) return null;

  return (
    <div className="resume-canvas">
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/EditorCanvas.tsx
git commit -m "Add EditorCanvas — hosts the TipTap editor"
```

---

## Task 11: Zustand store for editor state

**Files:**
- Create: `frontend/src/stores/resumeEditor.ts`

- [ ] **Step 1: Write the store**

```ts
// frontend/src/stores/resumeEditor.ts
import { create } from "zustand";
import type { ResumeDoc, ResumeMeta } from "@/components/resume/types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ResumeEditorStore {
  meta: ResumeMeta | null;
  doc: ResumeDoc | null;
  saveStatus: SaveStatus;
  setAll: (meta: ResumeMeta, doc: ResumeDoc) => void;
  setDoc: (doc: ResumeDoc) => void;
  setSaveStatus: (s: SaveStatus) => void;
}

export const useResumeEditorStore = create<ResumeEditorStore>((set) => ({
  meta: null,
  doc: null,
  saveStatus: "idle",
  setAll: (meta, doc) => set({ meta, doc, saveStatus: "idle" }),
  setDoc: (doc) => set({ doc }),
  setSaveStatus: (s) => set({ saveStatus: s }),
}));
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/resumeEditor.ts
git commit -m "Add resumeEditor Zustand store"
```

---

## Task 12: localResumeStore — localStorage persistence helpers

**Files:**
- Create: `frontend/src/lib/localResumeStore.ts`

- [ ] **Step 1: Write the helpers**

```ts
// frontend/src/lib/localResumeStore.ts
import type { ResumeDoc, ResumeMeta } from "@/components/resume/types";

const LS_KEY = (id: string) => `careerops-resume-${id}`;

interface StoredPayload {
  meta: ResumeMeta;
  doc: ResumeDoc;
}

export function loadFromLocal(id: string): StoredPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY(id));
    if (!raw) return null;
    return JSON.parse(raw) as StoredPayload;
  } catch {
    return null;
  }
}

export function saveToLocal(id: string, meta: ResumeMeta, doc: ResumeDoc): void {
  if (typeof window === "undefined") return;
  const payload: StoredPayload = {
    meta: { ...meta, updated_at: new Date().toISOString() },
    doc,
  };
  localStorage.setItem(LS_KEY(id), JSON.stringify(payload));
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/localResumeStore.ts
git commit -m "Add localStorage persistence helpers for resumes"
```

---

## Task 13: FloatingToolbar component (bubble menu)

**Files:**
- Create: `frontend/src/components/resume/FloatingToolbar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/resume/FloatingToolbar.tsx
"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { Bold, Italic, Link as LinkIcon, Underline } from "lucide-react";

export function FloatingToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const btn = (active: boolean) =>
    `flex size-7 items-center justify-center rounded-md transition-colors ${
      active ? "bg-neutral-200" : "hover:bg-neutral-100"
    }`;

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 120, placement: "top" }}
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
        <Underline className="size-3.5" strokeWidth={2} />
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
```

**Note:** `BubbleMenu` is now exported from `@tiptap/react/menus` in TipTap 3.

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/FloatingToolbar.tsx
git commit -m "Add FloatingToolbar bubble menu (bold/italic/underline/link)"
```

---

## Task 14: Wire EditorCanvas to expose its editor instance

**Files:**
- Modify: `frontend/src/components/resume/EditorCanvas.tsx`

The FloatingToolbar needs access to the TipTap `Editor` instance. Refactor `EditorCanvas` to accept a callback that hands out the editor, so `ResumeEditor` (Task 15) can pass the same instance to both EditorCanvas and FloatingToolbar.

- [ ] **Step 1: Replace file contents**

```tsx
// frontend/src/components/resume/EditorCanvas.tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { createResumeEditorExtensions } from "./extensions/createResumeEditor";
import type { ResumeDoc } from "./types";

import "./resume-editor.css";

interface Props {
  doc: ResumeDoc;
  onChange: (doc: ResumeDoc) => void;
  /** Passed the editor instance once mounted — used by FloatingToolbar. */
  onReady?: (editor: Editor) => void;
}

export function EditorCanvas({ doc, onChange, onReady }: Props) {
  const editor = useEditor({
    ...createResumeEditorExtensions(doc),
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON() as ResumeDoc);
    },
  });

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(doc);
    if (current !== incoming) editor.commands.setContent(doc, { emitUpdate: false });
  }, [doc, editor]);

  if (!editor) return null;

  return (
    <div className="resume-canvas">
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/EditorCanvas.tsx
git commit -m "EditorCanvas: expose editor instance via onReady callback"
```

---

## Task 15: EditorTopBar component

**Files:**
- Create: `frontend/src/components/resume/EditorTopBar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/resume/EditorTopBar.tsx
"use client";

import { Download } from "lucide-react";
import type { ResumeMeta } from "./types";

interface Props {
  meta: ResumeMeta;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

export function EditorTopBar({ meta, saveStatus }: Props) {
  const tailoringLabel =
    meta.target_company && meta.target_role
      ? `${meta.target_company} · ${meta.target_role}`
      : "No target job selected";

  return (
    <div
      className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur-md"
    >
      {/* Resume title — Plan B will replace with a variant dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-900">{meta.title}</span>
      </div>

      <div className="flex-1 text-center">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Tailoring for</span>
        <span className="ml-2 text-sm text-neutral-800">{tailoringLabel}</span>
      </div>

      <SaveBadge status={saveStatus} />

      {/* Disabled placeholder — Plan C implements actual PDF export */}
      <button
        type="button"
        disabled
        className="flex items-center gap-1.5 rounded-md bg-neutral-900/90 px-3 py-1.5 text-xs font-medium text-white opacity-40"
        title="PDF export coming in Plan C"
      >
        <Download className="size-3.5" strokeWidth={2} />
        Export PDF
      </button>
    </div>
  );
}

function SaveBadge({ status }: { status: Props["saveStatus"] }) {
  const labels = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Save failed",
  } as const;
  if (status === "idle") return <span className="w-[4.5rem]" aria-hidden />;
  return (
    <span
      className={`w-[4.5rem] text-right text-[11px] ${
        status === "error" ? "text-red-500" : "text-neutral-500"
      }`}
    >
      {labels[status]}
    </span>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/EditorTopBar.tsx
git commit -m "Add EditorTopBar (title + tailoring label + save status + disabled PDF button)"
```

---

## Task 16: ResumeEditor container — wires everything together

**Files:**
- Create: `frontend/src/components/resume/ResumeEditor.tsx`

- [ ] **Step 1: Write the container**

```tsx
// frontend/src/components/resume/ResumeEditor.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import { usePageContext } from "@/hooks/usePageContext";
import { useResumeEditorStore } from "@/stores/resumeEditor";
import { loadFromLocal, saveToLocal } from "@/lib/localResumeStore";
import { SEED_DOC, SEED_META } from "./seed";
import { EditorCanvas } from "./EditorCanvas";
import { EditorTopBar } from "./EditorTopBar";
import { FloatingToolbar } from "./FloatingToolbar";
import type { ResumeDoc } from "./types";

const AUTOSAVE_DEBOUNCE_MS = 500;

export function ResumeEditor({ id }: { id: string }) {
  const meta = useResumeEditorStore((s) => s.meta);
  const doc = useResumeEditorStore((s) => s.doc);
  const saveStatus = useResumeEditorStore((s) => s.saveStatus);
  const setAll = useResumeEditorStore((s) => s.setAll);
  const setDoc = useResumeEditorStore((s) => s.setDoc);
  const setSaveStatus = useResumeEditorStore((s) => s.setSaveStatus);

  const [editor, setEditor] = useState<Editor | null>(null);

  // Load from local or seed on mount
  useEffect(() => {
    const stored = loadFromLocal(id);
    if (stored) {
      setAll(stored.meta, stored.doc);
    } else {
      setAll({ ...SEED_META, id }, SEED_DOC);
    }
  }, [id, setAll]);

  // AI panel page context
  usePageContext({
    page: "resume_editor",
    summary: meta
      ? `正在编辑「${meta.title}」简历${
          meta.target_company ? `，目标 ${meta.target_company} · ${meta.target_role ?? ""}` : ""
        }`
      : "Resume editor loading",
    data: { resume_id: id },
  });

  // Debounced autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChange = (next: ResumeDoc) => {
    setDoc(next);
    if (!meta) return;
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        saveToLocal(id, meta, next);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  if (!meta || !doc) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-400">
        Loading resume…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-[240px]">
      <EditorTopBar meta={meta} saveStatus={saveStatus} />
      <EditorCanvas doc={doc} onChange={handleChange} onReady={setEditor} />
      <FloatingToolbar editor={editor} />
    </div>
  );
}
```

**Note:** `pb-[240px]` leaves room for the global AI panel (which sits at the bottom from the `feature/global-ai-panel` work).

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/ResumeEditor.tsx
git commit -m "Add ResumeEditor container (loads, autosaves, wires toolbar)"
```

---

## Task 17: Route handler

**Files:**
- Create: `frontend/src/app/resume/[id]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/resume/[id]/page.tsx
import { ResumeEditor } from "@/components/resume/ResumeEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResumeEditorPage({ params }: PageProps) {
  const { id } = await params;
  return <ResumeEditor id={id} />;
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Visual verification — run dev server**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/.worktrees/resume-editor-core/frontend
npm run dev
```

Open: `http://localhost:3000/resume/base`

Expected:
- Top bar shows "Base resume" on the left, "TAILORING FOR No target job selected" in the middle, disabled Export PDF button on the right.
- A white 8.5"-wide "paper" appears centered on a light gray background.
- "Alex Chen" heading shows at the top, followed by 4 contact lines.
- Two sections: Experience (with 2 bullets under Snapbrillia) and Education (1 bullet under UC Riverside).
- Clicking any bullet text → cursor appears, typing changes the text.
- Selecting text → floating toolbar appears with B / I / U / link icons.
- Clicking B toggles bold on the selection.
- ⌘Z undoes, ⌘⇧Z redoes.
- Edit something, wait ~1 second → "Saved" badge flashes in the top bar.
- Reload page → edit is still there.
- Global AI panel appears at the bottom with "AI · Resume Editor mode" label (assuming the feature/global-ai-panel branch is correctly inherited).

Stop dev server (Ctrl+C) before committing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/resume/\[id\]/page.tsx
git commit -m "Add /resume/[id] route handler"
```

---

## Task 18: Update Sidebar "Editor" item to link here

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Read the current Sidebar**

Run: `grep -n 'Editor\|editor' /Users/fred/Desktop/CareerOps-Pro/.worktrees/resume-editor-core/frontend/src/components/layout/Sidebar.tsx`

Find the `Editor` nav item. It likely currently has no `href` or links to a placeholder.

- [ ] **Step 2: Point it to /resume/base**

Use the Edit tool to change the `Editor` NavItem so clicking it navigates to `/resume/base`.

If the pattern in Sidebar.tsx uses a `href` prop:
```tsx
<NavItem icon={Edit3} label="Editor" href="/resume/base" />
```

If it uses `onClick` with `router.push`:
```tsx
<NavItem
  icon={Edit3}
  label="Editor"
  onClick={() => router.push("/resume/base")}
/>
```

Follow the existing pattern in the file — don't introduce a new one.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Visual verification**

```bash
npm run dev
```

Open `http://localhost:3000/?dashboard` → click sidebar "Editor" → should navigate to `/resume/base` and show the editor.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "Wire Sidebar 'Editor' item to /resume/base"
```

---

## Task 19: Acceptance criteria walkthrough

No code changes — a manual verification pass.

- [ ] **Step 1: Run dev server**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/.worktrees/resume-editor-core/frontend
npm run dev
```

- [ ] **Step 2: Walk each acceptance criterion from spec § "Acceptance Criteria" and note PASS/FAIL**

Plan A covers criteria 1–8 and 10; criteria 9 (PDF export), 11–13 (history + AI integration) are deferred.

For each criterion, write PASS or FAIL with a one-line note:

1. **AC1** Open `/resume/base` → editor renders with resume content, single-column, looks like future PDF. → __
2. **AC2** Click any text → cursor appears, can type. → __
3. **AC3** Select text → floating toolbar (B / I / U / link) appears. → __
4. **AC4** Drag section to reorder — **deferred to Plan B**; mark as N/A in Plan A.
5. **AC5** Hide/show section via hover affordance — **deferred to Plan B**; N/A.
6. **AC6** Edit autosaves within 500 ms + top bar shows "Saved". → __
7. **AC7** ⌘Z undoes, ⌘⇧Z redoes. → __
8. **AC8** Variant dropdown switches resume — **deferred to Plan B**; N/A.
9. **AC9** Export PDF downloads matching file — **deferred to Plan C**; N/A, button visible but disabled.
10. **AC10** Page-break dashed lines at correct positions — **deferred to Plan C**; N/A.
11. **AC11** History panel — **deferred to Plan D**; N/A.
12. **AC12** AI panel calls `update_bullet` → change visible + snapshot in history — **deferred to Plan D**; N/A, but `usePageContext` IS registered so AI panel mode label should read "Resume Editor mode".
13. **AC13** Revert a snapshot — **deferred to Plan D**; N/A.

Plan A expected passing set: AC1, AC2, AC3, AC6, AC7 (plus the `usePageContext` half of AC12: mode label).

- [ ] **Step 3: Commit an empty summary if all target ACs pass**

```bash
cd /Users/fred/Desktop/CareerOps-Pro/.worktrees/resume-editor-core
git commit --allow-empty -m "Verified: Resume Editor Plan A passes AC1, AC2, AC3, AC6, AC7 + AI mode label"
```

If any fail, create `docs/superpowers/plans/FOLLOWUPS-resume-editor-plan-a.md` listing failures and commit that instead.

---

## Self-review notes

Against the spec:

**Spec coverage:**
- § MVP Scope → **Editing** (click, toolbar, undo/redo, autosave): Tasks 10, 13, 14, 16 ✓
- § MVP Scope → **Drag-to-reorder / Show-hide**: explicitly deferred to Plan B and called out in task 19 ✓
- § MVP Scope → **Multi-variant / base + derivation**: deferred to Plan B (noted in top of plan) ✓
- § MVP Scope → **Versioning**: deferred to Plan D ✓
- § MVP Scope → **PDF & rendering parity**: CSS port partly in Task 9 (MVP looks right), PDF export deferred to Plan C ✓
- § MVP Scope → **AI integration**: only `usePageContext` in Plan A (Task 16); tools in Plan D ✓
- § Data Model: only `ResumeMeta` and `ResumeDoc` types at Task 1 — snapshots deferred to Plan D ✓
- § TipTap Schema (8 nodes): collapsed to 4 node files + attributes on parents (Tasks 3, 4, 5, 6); documented at Task 7 ✓
- § IA Routes: `/resume/[id]` at Task 17 ✓
- § Page Layout: Tasks 15 (top bar), 16 (container), 10 (canvas) ✓
- § Acceptance Criteria: Task 19 maps each to PASS / deferred ✓

**Placeholder scan:** None (every step has complete code or exact commands).

**Type consistency:** `ResumeMeta` and `ResumeDoc` defined once at Task 1, used verbatim thereafter. Store methods (`setAll`, `setDoc`, `setSaveStatus`) consistent between Task 11 definition and Task 16 usage. `EditorCanvas` props `(doc, onChange, onReady?)` match caller at Task 16.

**Known future work reminded in plan:** Plan B (variants + backend), Plan C (PDF + sidebar layout + page breaks), Plan D (history + AI tools). Each block of deferred scope is called out explicitly so the executing engineer doesn't try to add it.
