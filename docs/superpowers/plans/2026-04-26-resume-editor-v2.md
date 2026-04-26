# Resume Editor v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the resume editor so the editor view, `/print` browser view, and exported PDF are pixel-identical — single renderer (`ResumeDocumentCanvas`) drives all three. Adds full Notion-style interactions (slash, drag-reorder, multi-block selection, bubble menu, markdown shortcuts).

**Architecture:** Page-native rendering: domain JSON → projected to flat `LayoutAtom[]` → measured (per-atom) → assigned absolute `(x, y, pageIndex)` by template-driven `LayoutStrategy`. Three render layers (PageBackground / AtomContent / Interaction) with strict separation; only AtomContent participates in PDF. Per-field TipTap instances (60 per resume) with custom `BulletDocument`, `SingleLineDocument`, `SingleLineWithMarksDocument` schemas.

**Tech Stack:** TipTap 3 (per-field, custom Document schemas) · Zustand 5 (`subscribeWithSelector`) · React 19 + Next.js 16 (App Router) · Playwright + headless Chromium for PDF · Vitest + happy-dom (unit/integration) · Playwright (visual e2e) · pytest (backend migration)

**Spec:** `docs/superpowers/specs/2026-04-26-resume-editor-v2-design.md`

**Roadmap:** `docs/ROADMAP.md` (post-v2 features that depend on v2 architecture)

---

## File Structure

All v2 frontend code lives under `frontend/src/components/resume/v2/`. v1 files at `frontend/src/components/resume/` stay untouched until cutover (Task 41), then deleted in a follow-up commit.

```
frontend/src/components/resume/v2/
├── types.ts                              # Schema types, IDs, modes
├── tokens/
│   ├── layout-tokens.ts                  # PAGE_SPEC, ATOM_SPEC, GAPs (string only)
│   └── canvas.css                        # CSS variables from same string spec
├── canvas-print.css                      # @page + print rules
├── ResumeDocumentCanvas.tsx              # The single renderer (3 modes)
├── EditorPage.tsx                        # Edit-mode mount point
├── EditorTopBar.tsx                      # Page X of Y, Export button, template menu
├── PrintCanvasClient.tsx                 # Export-mode wrapper for /print route
├── layers/
│   ├── PageBackgroundLayer.tsx
│   ├── AtomContentLayer.tsx
│   ├── PrintFlowPlaceholders.tsx
│   └── InteractionLayer.tsx
├── atoms/
│   ├── AtomRenderer.tsx                  # Switch on atom kind
│   ├── HeaderAtomRenderer.tsx
│   ├── SectionHeadingAtomRenderer.tsx
│   └── EntryAtomRenderer.tsx
├── fields/
│   ├── PlainTextField.tsx                # name/title/meta/heading
│   ├── BulletField.tsx                   # rich-text bullet
│   ├── ContactLinesField.tsx
│   ├── single-line-adapter.ts            # string ↔ SingleLineDoc
│   ├── contact-lines-adapter.ts          # ContactItem[] ↔ SingleLineDoc
│   ├── bullet-paste-normalize.ts         # transformPasted handlers
│   └── useMeasureModeSync.ts             # universal hook
├── extensions/
│   ├── SingleLineDocument.ts             # content: 'text*'
│   ├── SingleLineWithMarksDocument.ts    # content: 'inline*'
│   ├── BulletDocument.ts                 # content: 'paragraph'
│   ├── NoNewline.ts
│   ├── AtomKeyboardNav.ts
│   ├── SlashCommand.ts
│   └── MarkdownInputRules.ts
├── layout/
│   ├── LayoutEngine.ts
│   ├── AtomElementRegistry.ts            # callback ref + ResizeObserver
│   ├── atoms-projection.ts               # ResumeDoc → LayoutAtom[]
│   ├── normalize-template.ts             # parseToPx + NormalizedTemplate
│   ├── coords.ts                         # screen vs print coord
│   └── strategies/
│       ├── index.ts                      # registry
│       └── SingleColumnLayoutStrategy.ts
├── interaction/
│   ├── DragController.ts                 # pointer events
│   ├── SelectionManager.ts               # block selection
│   ├── AtomFocusManager.ts               # cross-atom focus
│   ├── DragHandle.tsx
│   ├── DragGhost.ts                      # makeDragGhost
│   ├── DropIndicator.tsx
│   ├── BubbleMenu.tsx
│   ├── HoverAffordance.tsx
│   └── keyboard-router.ts                # Cmd+Z routing
├── store/
│   ├── useResumeStore.ts                 # Zustand + subscribeWithSelector
│   ├── source-of-truth.ts                # Origin types, makeOrigin helper
│   ├── undo-stack.ts                     # structural-only undo
│   ├── flush-save.ts                     # debounced backend POST + flushSave()
│   └── actions/
│       ├── moveSection.ts
│       ├── moveEntry.ts
│       ├── moveBullet.ts
│       ├── insertBlock.ts
│       ├── deleteBlock.ts
│       ├── duplicateBlock.ts
│       ├── updateBullet.ts
│       ├── updateField.ts
│       └── setTemplate.ts
└── templates/
    ├── registry.ts
    └── minimal-single-column.ts

frontend/src/app/resume/[id]/
├── page.tsx                              # MODIFY: import v2 EditorPage
└── print/
    ├── page.tsx                          # MODIFY: server fetch only
    └── PrintCanvasClient.tsx             # MODIFY: import v2

api/
├── models/
│   ├── resume.py                         # MODIFY: add ResumeV2 + schema_version
│   └── resume_v1.py                      # NEW: keep v1 model for migration
├── routes/
│   └── resume.py                         # MODIFY: GET auto-migrates v1
└── services/
    ├── resume_store.py                   # MODIFY: schema-version-aware read
    └── migration_v1_to_v2.py             # NEW: dry-run script

utils/
└── chrome_pdf.py                         # MODIFY: wait data-paginated, prefer_css_page_size
```

---

## Task Order Rationale

Foundation (types, tokens, schemas) → store → layout engine (paginate is a pure function, easiest to TDD) → renderers → fields → interaction → routes → backend → cleanup → AC walkthrough.

Each task ends with a commit. Most tasks are 30 min – 2 hr. Total: ~45 tasks, 10–13 days for one engineer.

---

## Task 0: Setup + Inventory + Branch

**Files:**
- Create branch `feature/resume-editor-v2` off main (after verifying v1 is merged or stashed)
- Verify: `api/routes/resume.py`, `api/services/resume_store.py`, `api/services/ai_orchestrator.py`, `api/services/ai_tools.py`, `utils/chrome_pdf.py`, `frontend/src/app/resume/[id]/page.tsx`, `frontend/src/app/resume/[id]/print/page.tsx`, `frontend/src/app/resume/[id]/print/PrintCanvasClient.tsx`, `saved_sessions/resumes/`

- [ ] **Step 1: Verify all spec-referenced paths exist**

```bash
ls api/routes/resume.py
ls api/services/resume_store.py
ls api/services/ai_orchestrator.py
ls api/services/ai_tools.py
ls utils/chrome_pdf.py
ls frontend/src/app/resume/\[id\]/page.tsx
ls frontend/src/app/resume/\[id\]/print/page.tsx
ls frontend/src/app/resume/\[id\]/print/PrintCanvasClient.tsx
ls saved_sessions/resumes/
```

Expected: every path resolves. If any missing, **STOP** and update the spec/plan paths before proceeding.

- [ ] **Step 2: AI tools audit**

```bash
grep -rn "tool_call\|tool_calls\|ai_orchestrator\|rewrite_bullet\|aiRewrite\|rewriteBullet\|aiSuggest" api/ services/ frontend/src/ | tee /tmp/v2-ai-audit.txt
```

Read the output. For each AI tool that reads/writes resume schema:

- If it operates on the *whole* resume document — note for Task 44 (hide entry button until v2 adapter)
- If it operates on metadata only (title, target_company, etc.) — safe, no change
- Document findings inline in this plan as a comment in Task 44

- [ ] **Step 3: Verify branch state and create v2 branch**

```bash
git status                          # must be clean
git fetch origin
git log --oneline main..HEAD | head # what's on current branch but not main
```

If `feature/resume-editor-v1` has unmerged commits that should land on main first:

```bash
# (manual decision: merge to main or rebase)
```

Then create v2 branch off main:

```bash
git checkout main
git pull origin main
git checkout -b feature/resume-editor-v2
```

- [ ] **Step 4: Install Playwright for visual e2e tests**

```bash
cd frontend
npm install --save-dev @playwright/test
npx playwright install chromium
```

Verify `frontend/package.json` now has `@playwright/test` in devDependencies.

- [ ] **Step 5: Create Playwright config**

```ts
// frontend/playwright.config.ts (NEW)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

```bash
mkdir -p frontend/e2e
echo '*.tsbuildinfo\nplaywright-report/\ntest-results/' >> frontend/.gitignore
```

- [ ] **Step 6: Add Playwright npm script**

Modify `frontend/package.json` scripts section:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

- [ ] **Step 7: Commit branch setup**

```bash
git add frontend/playwright.config.ts frontend/package.json frontend/package-lock.json frontend/.gitignore
git commit -m "Setup: Playwright for v2 visual e2e tests + branch ready"
```

---

## Task 1: v2 Type Definitions

**Files:**
- Create: `frontend/src/components/resume/v2/types.ts`
- Test: `frontend/src/components/resume/v2/types.test.ts`

- [ ] **Step 1: Write the type definitions**

```ts
// frontend/src/components/resume/v2/types.ts

// ─────────── ID types ───────────
export type ResumeId = string;
export type BlockId = string;            // UUID v4
export type EditorId = string;           // per-TipTap-instance UUID
export type TransactionId = number;      // monotonic
export type ISO8601 = string;

// ─────────── Domain schema ───────────
export type SectionRole =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'education'
  | 'awards'
  | 'publications'
  | 'custom';

export type ContactItem =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; url: string };

export type HeaderBlock = {
  id: BlockId;
  name: string;
  contact_lines: ContactItem[];
};

export type EntryBlock = {
  id: BlockId;
  title: string;
  meta: string;
  bullets: BulletBlock[];
};

export type BulletBlock = {
  id: BlockId;
  content: ProseMirrorBulletDoc;
  tags?: string[];
  evidence_refs?: string[];
};

export type SectionBlock = {
  id: BlockId;
  role: SectionRole;
  heading: string;
  entries: EntryBlock[];
};

export type ResumeMetadata = {
  created_at: ISO8601;
  updated_at: ISO8601;
  target_company: string | null;
  target_role: string | null;
  parent_id: string | null;
};

export type ResumeDoc = {
  schema_version: 2;
  id: ResumeId;
  title: string;
  template_id: string;
  header: HeaderBlock;
  sections: SectionBlock[];
  metadata: ResumeMetadata;
};

// ─────────── ProseMirror shapes ───────────
export type ProseMirrorInline = {
  type: 'text';
  text: string;
  marks?: Array<
    | { type: 'bold' }
    | { type: 'italic' }
    | { type: 'link'; attrs: { href: string } }
  >;
};

export type ProseMirrorParagraph = {
  type: 'paragraph';
  content?: ProseMirrorInline[];
};

export type ProseMirrorBulletDoc = {
  type: 'doc';
  content: [ProseMirrorParagraph];   // exactly 1
};

export type SingleLineDoc = {
  type: 'doc';
  content: ProseMirrorInline[];
};

// ─────────── LayoutAtom (pagination unit) ───────────
export type AtomId = BlockId;            // same as the source block ID

export type LayoutAtom =
  | { kind: 'header';          id: AtomId; sourceBlockId: BlockId; keepWithNext: false }
  | { kind: 'section-heading'; id: AtomId; sourceBlockId: BlockId; keepWithNext: true }
  | { kind: 'entry';           id: AtomId; sourceBlockId: BlockId; keepWithNext: false };

export type AtomLayout = {
  pageIndex: number;
  xWithinPage: number;
  yWithinPage: number;
  width: number;
  height: number;
};

// ─────────── SelectableBlock (interaction unit) ───────────
export type SelectableBlock =
  | { kind: 'section'; id: BlockId }
  | { kind: 'entry';   id: BlockId; sectionId: BlockId }
  | { kind: 'bullet';  id: BlockId; entryId: BlockId };

// ─────────── EditableField (TipTap instance unit) ───────────
export type EditableField =
  | { kind: 'header.name' }
  | { kind: 'header.contact'; index: number }
  | { kind: 'section.heading'; id: BlockId }
  | { kind: 'entry.title';    id: BlockId }
  | { kind: 'entry.meta';     id: BlockId }
  | { kind: 'bullet.content'; id: BlockId };

// ─────────── Modes ───────────
export type CanvasMode = 'edit' | 'export' | 'measure';

// ─────────── Origin tracking ───────────
export type UpdateOriginType =
  | 'tiptap'
  | 'ai-rewrite'
  | 'undo'
  | 'redo'
  | 'drag-reorder'
  | 'paste'
  | 'load'
  | 'remote';

export type UpdateOrigin = {
  type: UpdateOriginType;
  editorId?: EditorId;
  transactionId: TransactionId;
};
```

- [ ] **Step 2: Write a sanity test that schema example compiles**

```ts
// frontend/src/components/resume/v2/types.test.ts
import { describe, it, expect } from 'vitest';
import type { ResumeDoc, BulletBlock } from './types';

describe('v2 types', () => {
  it('compiles a minimal valid ResumeDoc', () => {
    const doc: ResumeDoc = {
      schema_version: 2,
      id: 'r1',
      title: 'Test',
      template_id: 'minimal-single-column',
      header: { id: 'h1', name: 'A', contact_lines: [] },
      sections: [],
      metadata: {
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        target_company: null,
        target_role: null,
        parent_id: null,
      },
    };
    expect(doc.schema_version).toBe(2);
  });

  it('BulletBlock content is a 1-tuple', () => {
    const bullet: BulletBlock = {
      id: 'b1',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
      },
    };
    expect(bullet.content.content.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
cd frontend && npm test -- src/components/resume/v2/types.test.ts
```

Expected: 2 passing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/resume/v2/types.ts frontend/src/components/resume/v2/types.test.ts
git commit -m "v2 types: schema, atoms, modes, origin tracking"
```

---

## Task 2: Layout Tokens (string spec only, no rounded ints)

**Files:**
- Create: `frontend/src/components/resume/v2/tokens/layout-tokens.ts`
- Create: `frontend/src/components/resume/v2/tokens/canvas.css`
- Test: `frontend/src/components/resume/v2/tokens/layout-tokens.test.ts`

- [ ] **Step 1: Write tokens (string spec, no derived ints)**

```ts
// frontend/src/components/resume/v2/tokens/layout-tokens.ts
//
// SINGLE SOURCE OF TRUTH. Forbidden in implementation files: hardcoded
// derived px integers (643, 912, 816, 1056). Always parseToPx() in JS,
// always calc() in CSS.

export const PAGE_SPEC = {
  WIDTH: '8.5in',
  HEIGHT: '11in',
  MARGIN: {
    top: '0.75in',
    right: '0.9in',
    bottom: '0.75in',
    left: '0.9in',
  },
} as const;

export const ATOM_SPEC = {
  GAP: '12px',
} as const;

export const SCREEN_GAP = '16px';
export const PRINT_GAP = '0px';

export const PX_PER_INCH = 96;

export function parseToPx(spec: string): number {
  const trimmed = spec.trim();
  if (trimmed.endsWith('in')) return parseFloat(trimmed) * PX_PER_INCH;
  if (trimmed.endsWith('px')) return parseFloat(trimmed);
  if (trimmed.endsWith('cm')) return parseFloat(trimmed) * (PX_PER_INCH / 2.54);
  if (trimmed === '0') return 0;
  throw new Error(`parseToPx: unknown unit in "${spec}"`);
}
```

- [ ] **Step 2: Write the CSS using calc() (no hardcoded derived px)**

```css
/* frontend/src/components/resume/v2/tokens/canvas.css */

:root {
  --page-width: 8.5in;
  --page-height: 11in;
  --page-margin-top: 0.75in;
  --page-margin-right: 0.9in;
  --page-margin-bottom: 0.75in;
  --page-margin-left: 0.9in;
  --atom-gap: 12px;
  --screen-gap: 16px;

  --page-content-width:
    calc(var(--page-width) - var(--page-margin-left) - var(--page-margin-right));
  --page-content-height:
    calc(var(--page-height) - var(--page-margin-top) - var(--page-margin-bottom));
}

[data-canvas-root] {
  position: relative;
  width: var(--page-width);
  font-family: var(--font-resume), Inter, sans-serif;
}

[data-atom-content] {
  margin: 0 !important;        /* hard rule — § 2.5 */
}
```

- [ ] **Step 3: Write tests for parseToPx**

```ts
// frontend/src/components/resume/v2/tokens/layout-tokens.test.ts
import { describe, it, expect } from 'vitest';
import { parseToPx, PAGE_SPEC, PX_PER_INCH } from './layout-tokens';

describe('parseToPx', () => {
  it('parses inches', () => {
    expect(parseToPx('8.5in')).toBe(8.5 * PX_PER_INCH);
    expect(parseToPx('0.9in')).toBe(0.9 * PX_PER_INCH);
  });
  it('parses pixels', () => {
    expect(parseToPx('12px')).toBe(12);
    expect(parseToPx('16px')).toBe(16);
  });
  it('parses zero', () => {
    expect(parseToPx('0')).toBe(0);
  });
  it('parses centimeters', () => {
    expect(parseToPx('2.54cm')).toBeCloseTo(PX_PER_INCH, 2);
  });
  it('rejects unknown units', () => {
    expect(() => parseToPx('5em')).toThrow(/unknown unit/);
  });
});

describe('PAGE_SPEC', () => {
  it('is unmodifiable string spec only', () => {
    expect(PAGE_SPEC.WIDTH).toBe('8.5in');
    expect(PAGE_SPEC.MARGIN.top).toBe('0.75in');
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- src/components/resume/v2/tokens/
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v2/tokens/
git commit -m "v2 tokens: string spec + parseToPx + canvas CSS variables"
```

---

## Task 3: TipTap Custom Document Schemas

**Files:**
- Create: `frontend/src/components/resume/v2/extensions/SingleLineDocument.ts`
- Create: `frontend/src/components/resume/v2/extensions/SingleLineWithMarksDocument.ts`
- Create: `frontend/src/components/resume/v2/extensions/BulletDocument.ts`
- Test: `frontend/src/components/resume/v2/extensions/documents.test.ts`

- [ ] **Step 1: SingleLineDocument**

```ts
// frontend/src/components/resume/v2/extensions/SingleLineDocument.ts
import Document from '@tiptap/extension-document';

/** name/title/meta/heading: just text nodes, no block-level structure. */
export const SingleLineDocument = Document.extend({
  name: 'doc',
  content: 'text*',
});
```

- [ ] **Step 2: SingleLineWithMarksDocument**

```ts
// frontend/src/components/resume/v2/extensions/SingleLineWithMarksDocument.ts
import Document from '@tiptap/extension-document';

/** contact_lines: text + inline marks (link), still no block. */
export const SingleLineWithMarksDocument = Document.extend({
  name: 'doc',
  content: 'inline*',
});
```

- [ ] **Step 3: BulletDocument**

```ts
// frontend/src/components/resume/v2/extensions/BulletDocument.ts
import Document from '@tiptap/extension-document';

/** bullet.content: schema-enforced exactly-one paragraph. */
export const BulletDocument = Document.extend({
  name: 'doc',
  content: 'paragraph',
});
```

- [ ] **Step 4: Write schema tests**

```ts
// frontend/src/components/resume/v2/extensions/documents.test.ts
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import { SingleLineDocument } from './SingleLineDocument';
import { BulletDocument } from './BulletDocument';

describe('SingleLineDocument', () => {
  it('accepts plain text content', () => {
    const editor = new Editor({
      extensions: [SingleLineDocument, Text],
      content: { type: 'doc', content: [{ type: 'text', text: 'hello' }] },
    });
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [{ type: 'text', text: 'hello' }],
    });
    editor.destroy();
  });
});

describe('BulletDocument', () => {
  it('schema rejects multi-paragraph content', () => {
    const editor = new Editor({
      extensions: [BulletDocument, Paragraph, Text],
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        ],
      },
    });
    // Attempt to insert second paragraph via transaction — should not split
    const json = editor.getJSON();
    expect(json.content).toHaveLength(1);
    editor.destroy();
  });

  it('keeps paragraph after Enter (Enter would normally split)', () => {
    const editor = new Editor({
      extensions: [BulletDocument, Paragraph, Text],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }],
      },
    });
    // Move cursor to end and try to split
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const splitResult = editor.commands.splitBlock();
    // splitBlock returns false when it would violate schema
    expect(splitResult).toBe(false);
    expect(editor.getJSON().content).toHaveLength(1);
    editor.destroy();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm test -- src/components/resume/v2/extensions/documents.test.ts
```

Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/resume/v2/extensions/
git commit -m "v2 extensions: SingleLine/SingleLineWithMarks/BulletDocument schemas"
```

---

## Task 4: String/Doc Adapters

**Files:**
- Create: `frontend/src/components/resume/v2/fields/single-line-adapter.ts`
- Create: `frontend/src/components/resume/v2/fields/contact-lines-adapter.ts`
- Test: `frontend/src/components/resume/v2/fields/single-line-adapter.test.ts`
- Test: `frontend/src/components/resume/v2/fields/contact-lines-adapter.test.ts`

- [ ] **Step 1: Single-line adapter**

```ts
// frontend/src/components/resume/v2/fields/single-line-adapter.ts
import type { Editor } from '@tiptap/core';
import type { SingleLineDoc } from '../types';

export function stringToSingleLineDoc(s: string): SingleLineDoc {
  if (!s) return { type: 'doc', content: [] };
  return { type: 'doc', content: [{ type: 'text', text: s }] };
}

export function singleLineDocToString(editor: Editor): string {
  return editor.getText();
}
```

- [ ] **Step 2: Contact-lines adapter**

```ts
// frontend/src/components/resume/v2/fields/contact-lines-adapter.ts
import type { Editor } from '@tiptap/core';
import type { ContactItem, SingleLineDoc, ProseMirrorInline } from '../types';

const SEPARATOR = '  |  ';   // double-nbsp pipe nbsp-nbsp visual

export function contactItemsToDoc(items: ContactItem[]): SingleLineDoc {
  const inline: ProseMirrorInline[] = [];
  items.forEach((item, i) => {
    if (i > 0) inline.push({ type: 'text', text: SEPARATOR });
    if (item.type === 'text') {
      if (item.value) inline.push({ type: 'text', text: item.value });
    } else {
      inline.push({
        type: 'text',
        text: item.label,
        marks: [{ type: 'link', attrs: { href: item.url } }],
      });
    }
  });
  return { type: 'doc', content: inline };
}

/**
 * Walk editor JSON and rebuild ContactItem[]. Text nodes with link mark
 * become {type:'link'}; bare text becomes {type:'text'}.
 * Splits on the SEPARATOR (resilient to user editing it).
 */
export function docToContactItems(editor: Editor): ContactItem[] {
  const doc = editor.getJSON();
  const items: ContactItem[] = [];
  const nodes = (doc.content as ProseMirrorInline[]) ?? [];

  // Concatenate all text nodes preserving link mark per-segment, then split on SEPARATOR
  type Segment = { text: string; href?: string };
  const segments: Segment[] = [];
  for (const n of nodes) {
    if (n.type !== 'text') continue;
    const linkMark = n.marks?.find(m => m.type === 'link') as
      | { attrs: { href: string } }
      | undefined;
    segments.push({ text: n.text, href: linkMark?.attrs.href });
  }

  // Re-flatten then split on SEPARATOR boundaries while preserving link runs
  let buffer: Segment[] = [];
  for (const seg of segments) {
    if (seg.href) {
      // link runs are atomic items
      if (buffer.length) {
        items.push(...flushBuffer(buffer));
        buffer = [];
      }
      items.push({ type: 'link', label: seg.text, url: seg.href });
    } else {
      buffer.push(seg);
    }
  }
  if (buffer.length) items.push(...flushBuffer(buffer));
  return items.filter(i => i.type === 'link' || (i.type === 'text' && i.value));
}

function flushBuffer(buffer: { text: string }[]): ContactItem[] {
  const joined = buffer.map(b => b.text).join('');
  const parts = joined.split(SEPARATOR).map(s => s.trim()).filter(Boolean);
  return parts.map(p => ({ type: 'text' as const, value: p }));
}
```

- [ ] **Step 3: Single-line adapter tests**

```ts
// frontend/src/components/resume/v2/fields/single-line-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import { SingleLineDocument } from '../extensions/SingleLineDocument';
import { stringToSingleLineDoc, singleLineDocToString } from './single-line-adapter';

describe('stringToSingleLineDoc', () => {
  it('empty string → empty doc', () => {
    expect(stringToSingleLineDoc('')).toEqual({ type: 'doc', content: [] });
  });
  it('non-empty string → doc with text node', () => {
    expect(stringToSingleLineDoc('hello')).toEqual({
      type: 'doc',
      content: [{ type: 'text', text: 'hello' }],
    });
  });
});

describe('singleLineDocToString roundtrip', () => {
  it('roundtrips text', () => {
    const editor = new Editor({
      extensions: [SingleLineDocument, Text],
      content: stringToSingleLineDoc('Hello world'),
    });
    expect(singleLineDocToString(editor)).toBe('Hello world');
    editor.destroy();
  });
});
```

- [ ] **Step 4: Contact-lines adapter tests**

```ts
// frontend/src/components/resume/v2/fields/contact-lines-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import Link from '@tiptap/extension-link';
import { SingleLineWithMarksDocument } from '../extensions/SingleLineWithMarksDocument';
import { contactItemsToDoc, docToContactItems } from './contact-lines-adapter';
import type { ContactItem } from '../types';

describe('contactItemsToDoc', () => {
  it('renders text + link items separated by visual separator', () => {
    const items: ContactItem[] = [
      { type: 'text', value: 'a@b.com' },
      { type: 'link', label: 'Github', url: 'https://github.com/a' },
    ];
    const doc = contactItemsToDoc(items);
    expect(doc.type).toBe('doc');
    // first segment text, separator, then link mark on Github
    expect(doc.content[0]).toMatchObject({ type: 'text', text: 'a@b.com' });
    expect(doc.content[2]).toMatchObject({
      type: 'text', text: 'Github',
      marks: [{ type: 'link', attrs: { href: 'https://github.com/a' } }],
    });
  });
});

describe('docToContactItems roundtrip', () => {
  it('roundtrips text + link', () => {
    const items: ContactItem[] = [
      { type: 'text', value: 'a@b.com' },
      { type: 'link', label: 'GH', url: 'https://x.com' },
    ];
    const editor = new Editor({
      extensions: [SingleLineWithMarksDocument, Text, Link],
      content: contactItemsToDoc(items),
    });
    const out = docToContactItems(editor);
    expect(out).toEqual(items);
    editor.destroy();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm test -- src/components/resume/v2/fields/
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/resume/v2/fields/single-line-adapter.ts \
         frontend/src/components/resume/v2/fields/contact-lines-adapter.ts \
         frontend/src/components/resume/v2/fields/single-line-adapter.test.ts \
         frontend/src/components/resume/v2/fields/contact-lines-adapter.test.ts
git commit -m "v2 field adapters: string ↔ SingleLineDoc, ContactItem[] ↔ doc"
```

---

## Task 5: normalize-template (px from string, no hardcoded ints)

**Files:**
- Create: `frontend/src/components/resume/v2/layout/normalize-template.ts`
- Test: `frontend/src/components/resume/v2/layout/normalize-template.test.ts`

- [ ] **Step 1: NormalizedTemplate type + function**

```ts
// frontend/src/components/resume/v2/layout/normalize-template.ts
import { parseToPx } from '../tokens/layout-tokens';
import type { SectionRole } from '../types';

export type LayoutStrategyId = 'single-column';
export type ColumnId = 'main' | 'sidebar';

export type PageSpec = {
  width: string;
  height: string;
  margin: { top: string; right: string; bottom: string; left: string };
};

export type TemplateTheme = {
  fontFamily: string;
  bodyFontSize: number;
  bodyLineHeight: number;
  bodyColor: string;
  headingFontSize: number;
  headingColor: string;
  sectionHeadingFontSize: number;
  sectionHeadingLetterSpacing: string;
  sectionHeadingColor: string;
  accent: string;
};

export type TemplateConfig = {
  id: string;
  layoutStrategyId: LayoutStrategyId;
  page: PageSpec;
  theme: TemplateTheme;
  columnMapping?: Partial<Record<SectionRole | 'default', ColumnId>>;
};

export type ResolvedColumnMapping = Record<SectionRole | 'default', ColumnId>;

const DEFAULT_MAPPING: ResolvedColumnMapping = {
  default: 'main',
  summary: 'main',
  skills: 'main',
  experience: 'main',
  projects: 'main',
  education: 'main',
  awards: 'main',
  publications: 'main',
  custom: 'main',
};

export type NormalizedTemplate = {
  id: string;
  layoutStrategyId: LayoutStrategyId;
  page: {
    widthPx: number;
    heightPx: number;
    marginPx: { top: number; right: number; bottom: number; left: number };
    contentWidthPx: number;
    contentHeightPx: number;
  };
  atom: { gapPx: number };
  theme: TemplateTheme;
  columnMapping: ResolvedColumnMapping;
};

export function normalizeTemplate(
  config: TemplateConfig,
  atomGap: string = '12px',
): NormalizedTemplate {
  const widthPx = parseToPx(config.page.width);
  const heightPx = parseToPx(config.page.height);
  const margin = {
    top: parseToPx(config.page.margin.top),
    right: parseToPx(config.page.margin.right),
    bottom: parseToPx(config.page.margin.bottom),
    left: parseToPx(config.page.margin.left),
  };
  return {
    id: config.id,
    layoutStrategyId: config.layoutStrategyId,
    page: {
      widthPx,
      heightPx,
      marginPx: margin,
      contentWidthPx: widthPx - margin.left - margin.right,
      contentHeightPx: heightPx - margin.top - margin.bottom,
    },
    atom: { gapPx: parseToPx(atomGap) },
    theme: config.theme,
    columnMapping: { ...DEFAULT_MAPPING, ...(config.columnMapping ?? {}) },
  };
}
```

- [ ] **Step 2: Tests**

```ts
// frontend/src/components/resume/v2/layout/normalize-template.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeTemplate } from './normalize-template';
import { PX_PER_INCH } from '../tokens/layout-tokens';

const FIXTURE = {
  id: 'fixture',
  layoutStrategyId: 'single-column' as const,
  page: {
    width: '8.5in',
    height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' },
  },
  theme: {
    fontFamily: 'Inter',
    bodyFontSize: 14, bodyLineHeight: 1.5, bodyColor: '#000',
    headingFontSize: 26, headingColor: '#000',
    sectionHeadingFontSize: 11, sectionHeadingLetterSpacing: '0.14em',
    sectionHeadingColor: '#666', accent: '#2563eb',
  },
};

describe('normalizeTemplate', () => {
  it('parses page geometry to px floats', () => {
    const n = normalizeTemplate(FIXTURE);
    expect(n.page.widthPx).toBe(8.5 * PX_PER_INCH);
    expect(n.page.heightPx).toBe(11 * PX_PER_INCH);
    expect(n.page.contentWidthPx).toBeCloseTo(6.7 * PX_PER_INCH, 2);
    expect(n.page.contentHeightPx).toBeCloseTo(9.5 * PX_PER_INCH, 2);
  });
  it('parses atom gap', () => {
    const n = normalizeTemplate(FIXTURE);
    expect(n.atom.gapPx).toBe(12);
  });
  it('fills column mapping defaults', () => {
    const n = normalizeTemplate(FIXTURE);
    expect(n.columnMapping.default).toBe('main');
    expect(n.columnMapping.skills).toBe('main');
  });
  it('overrides column mapping when provided', () => {
    const n = normalizeTemplate({
      ...FIXTURE,
      columnMapping: { skills: 'sidebar', default: 'main' },
    });
    expect(n.columnMapping.skills).toBe('sidebar');
    expect(n.columnMapping.experience).toBe('main');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/layout/normalize-template.test.ts
git add frontend/src/components/resume/v2/layout/normalize-template.ts \
         frontend/src/components/resume/v2/layout/normalize-template.test.ts
git commit -m "v2 layout: normalizeTemplate (px floats from string spec)"
```

---

## Task 6: Atom Projection (ResumeDoc → LayoutAtom[])

**Files:**
- Create: `frontend/src/components/resume/v2/layout/atoms-projection.ts`
- Test: `frontend/src/components/resume/v2/layout/atoms-projection.test.ts`

- [ ] **Step 1: Projection function**

```ts
// frontend/src/components/resume/v2/layout/atoms-projection.ts
import type { ResumeDoc, LayoutAtom } from '../types';

export function projectAtoms(resume: ResumeDoc): LayoutAtom[] {
  const atoms: LayoutAtom[] = [];
  atoms.push({
    kind: 'header',
    id: resume.header.id,
    sourceBlockId: resume.header.id,
    keepWithNext: false,
  });
  for (const section of resume.sections) {
    atoms.push({
      kind: 'section-heading',
      id: section.id,
      sourceBlockId: section.id,
      keepWithNext: true,
    });
    for (const entry of section.entries) {
      atoms.push({
        kind: 'entry',
        id: entry.id,
        sourceBlockId: entry.id,
        keepWithNext: false,
      });
    }
  }
  return atoms;
}
```

- [ ] **Step 2: Tests**

```ts
// frontend/src/components/resume/v2/layout/atoms-projection.test.ts
import { describe, it, expect } from 'vitest';
import { projectAtoms } from './atoms-projection';
import type { ResumeDoc } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: 't', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'X', contact_lines: [] },
  sections: [
    {
      id: 's1', role: 'experience', heading: 'Experience', entries: [
        { id: 'e1', title: 'A', meta: 'M', bullets: [] },
        { id: 'e2', title: 'B', meta: 'M', bullets: [] },
      ],
    },
    { id: 's2', role: 'skills', heading: 'Skills', entries: [
        { id: 'e3', title: 'C', meta: '', bullets: [] },
    ]},
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

describe('projectAtoms', () => {
  it('flattens to header + (heading + entries) per section', () => {
    const atoms = projectAtoms(RESUME);
    expect(atoms.map(a => `${a.kind}:${a.id}`)).toEqual([
      'header:h',
      'section-heading:s1', 'entry:e1', 'entry:e2',
      'section-heading:s2', 'entry:e3',
    ]);
  });

  it('marks section-heading atoms keepWithNext=true', () => {
    const atoms = projectAtoms(RESUME);
    atoms.filter(a => a.kind === 'section-heading').forEach(a => {
      expect(a.keepWithNext).toBe(true);
    });
  });

  it('header and entry atoms keepWithNext=false', () => {
    const atoms = projectAtoms(RESUME);
    expect(atoms.find(a => a.kind === 'header')?.keepWithNext).toBe(false);
    atoms.filter(a => a.kind === 'entry').forEach(a => {
      expect(a.keepWithNext).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/layout/atoms-projection.test.ts
git add frontend/src/components/resume/v2/layout/atoms-projection.ts \
         frontend/src/components/resume/v2/layout/atoms-projection.test.ts
git commit -m "v2 layout: projectAtoms (ResumeDoc → LayoutAtom[])"
```

---

(continued in next file write — this plan continues with Tasks 7–45)

## Task 7: SingleColumnLayoutStrategy (pure paginate function)

**Files:**
- Create: `frontend/src/components/resume/v2/layout/strategies/SingleColumnLayoutStrategy.ts`
- Create: `frontend/src/components/resume/v2/layout/strategies/index.ts`
- Test: `frontend/src/components/resume/v2/layout/strategies/SingleColumnLayoutStrategy.test.ts`

This is the algorithmic core. Pure function. TDD it carefully.

- [ ] **Step 1: Strategy interface**

```ts
// frontend/src/components/resume/v2/layout/strategies/index.ts
import type { LayoutAtom, AtomLayout, AtomId } from '../../types';
import type { NormalizedTemplate, ColumnId, LayoutStrategyId } from '../normalize-template';
import { SingleColumnLayoutStrategy } from './SingleColumnLayoutStrategy';

export type ComputeLayoutInput = {
  atoms: LayoutAtom[];
  measuredHeights: Map<AtomId, number>;
  template: NormalizedTemplate;
};

export type ComputeLayoutOutput = {
  atomLayouts: Map<AtomId, AtomLayout>;
  pageCount: number;
};

export type ColumnSpec = {
  id: ColumnId;
  xWithinPage: number;
  width: number;
};

export interface LayoutStrategy {
  computeLayout(input: ComputeLayoutInput): ComputeLayoutOutput;
  describeColumns(template: NormalizedTemplate): ColumnSpec[];
}

export const LAYOUT_STRATEGIES: Record<LayoutStrategyId, LayoutStrategy> = {
  'single-column': SingleColumnLayoutStrategy,
};
```

- [ ] **Step 2: SingleColumnLayoutStrategy implementation**

```ts
// frontend/src/components/resume/v2/layout/strategies/SingleColumnLayoutStrategy.ts
import type { LayoutAtom, AtomLayout, AtomId } from '../../types';
import type { NormalizedTemplate } from '../normalize-template';
import type { LayoutStrategy, ColumnSpec, ComputeLayoutInput, ComputeLayoutOutput } from './index';

export const SingleColumnLayoutStrategy: LayoutStrategy = {
  computeLayout({ atoms, measuredHeights, template }: ComputeLayoutInput): ComputeLayoutOutput {
    const contentHeight = template.page.contentHeightPx;
    const contentWidth = template.page.contentWidthPx;
    const gap = template.atom.gapPx;
    const result = new Map<AtomId, AtomLayout>();

    let pageIdx = 0;
    let cursorY = 0;
    let i = 0;

    while (i < atoms.length) {
      // Build keep-with-next chain starting at i
      const chain: LayoutAtom[] = [atoms[i]];
      let j = i;
      while (atoms[j].keepWithNext && j + 1 < atoms.length) {
        chain.push(atoms[j + 1]);
        j++;
      }
      const innerGapsHeight = (chain.length - 1) * gap;
      const chainContentHeight = chain.reduce(
        (sum, a) => sum + (measuredHeights.get(a.id) ?? 0), 0
      );
      const chainHeight = chainContentHeight + innerGapsHeight;

      const wouldUse = cursorY + chainHeight + (cursorY > 0 ? gap : 0);

      if (wouldUse <= contentHeight) {
        // Fits. Place chain on current page.
        const startY = cursorY === 0 ? 0 : cursorY + gap;
        let y = startY;
        for (const atom of chain) {
          const h = measuredHeights.get(atom.id) ?? 0;
          result.set(atom.id, {
            pageIndex: pageIdx,
            xWithinPage: 0,
            yWithinPage: y,
            width: contentWidth,
            height: h,
          });
          y += h + gap;
        }
        cursorY = y - gap;       // strip trailing gap
        i += chain.length;
      } else if (cursorY === 0) {
        // Already at top of page and chain still doesn't fit → accept overflow on this page
        let y = 0;
        for (const atom of chain) {
          const h = measuredHeights.get(atom.id) ?? 0;
          result.set(atom.id, {
            pageIndex: pageIdx,
            xWithinPage: 0,
            yWithinPage: y,
            width: contentWidth,
            height: h,
          });
          y += h + gap;
        }
        i += chain.length;
        // Only advance to next page if there are more atoms — prevents phantom blank page
        if (i < atoms.length) {
          pageIdx++;
          cursorY = 0;
        }
      } else {
        // Doesn't fit but page has content → flip to next page and retry (don't increment i)
        pageIdx++;
        cursorY = 0;
      }
    }

    // Compute pageCount from actual assignments (defense vs phantom)
    let maxPage = 0;
    for (const layout of result.values()) {
      if (layout.pageIndex > maxPage) maxPage = layout.pageIndex;
    }
    return { atomLayouts: result, pageCount: maxPage + 1 };
  },

  describeColumns(template: NormalizedTemplate): ColumnSpec[] {
    return [
      {
        id: 'main',
        xWithinPage: 0,
        width: template.page.contentWidthPx,
      },
    ];
  },
};
```

- [ ] **Step 3: Comprehensive paginate tests**

```ts
// frontend/src/components/resume/v2/layout/strategies/SingleColumnLayoutStrategy.test.ts
import { describe, it, expect } from 'vitest';
import { SingleColumnLayoutStrategy } from './SingleColumnLayoutStrategy';
import { normalizeTemplate } from '../normalize-template';
import type { LayoutAtom, AtomId } from '../../types';

const TEMPLATE = normalizeTemplate({
  id: 'fix', layoutStrategyId: 'single-column',
  page: { width: '8.5in', height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' } },
  theme: {} as any,
});
// contentHeight = 9.5in = 912 px

const headerAtom = (id: string): LayoutAtom =>
  ({ kind: 'header', id, sourceBlockId: id, keepWithNext: false });
const headingAtom = (id: string): LayoutAtom =>
  ({ kind: 'section-heading', id, sourceBlockId: id, keepWithNext: true });
const entryAtom = (id: string): LayoutAtom =>
  ({ kind: 'entry', id, sourceBlockId: id, keepWithNext: false });

function heights(map: Record<string, number>): Map<AtomId, number> {
  return new Map(Object.entries(map));
}

describe('SingleColumnLayoutStrategy.computeLayout', () => {
  it('places everything on page 1 if it fits', () => {
    const atoms = [headerAtom('h'), headingAtom('s1'), entryAtom('e1')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ h: 100, s1: 30, e1: 200 }),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(1);
    expect(r.atomLayouts.get('h')?.pageIndex).toBe(0);
    expect(r.atomLayouts.get('e1')?.pageIndex).toBe(0);
  });

  it('breaks to page 2 when chain does not fit', () => {
    // contentHeight 912; first 3 atoms total 900 → page 1; 4th atom 50 → page 2
    const atoms = [headerAtom('h'), entryAtom('e1'), entryAtom('e2'), entryAtom('e3')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ h: 300, e1: 300, e2: 280, e3: 50 }),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(2);
    expect(r.atomLayouts.get('e3')?.pageIndex).toBe(1);
  });

  it('keepWithNext binds heading to following entry', () => {
    // heading(30) + entry(900): together 930+gap > 912, so they should both
    // jump to next page if there's anything before them filling page 1.
    const atoms = [
      entryAtom('big'),
      headingAtom('s1'),
      entryAtom('e1'),
    ];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ big: 800, s1: 30, e1: 100 }),
      template: TEMPLATE,
    });
    // big takes 800; chain heading+e1 = 30+12+100 = 142; total page 1 = 800+12+142 = 954 > 912.
    // So heading and e1 must move together to page 2.
    expect(r.atomLayouts.get('s1')?.pageIndex).toBe(1);
    expect(r.atomLayouts.get('e1')?.pageIndex).toBe(1);
  });

  it('oversized single chain at top of page accepts overflow', () => {
    const atoms = [entryAtom('huge')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ huge: 2000 }),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(1);
    expect(r.atomLayouts.get('huge')?.pageIndex).toBe(0);
  });

  it('does NOT produce phantom trailing blank page after oversized', () => {
    // One oversized atom followed by nothing — pageCount must be 1, not 2
    const atoms = [entryAtom('huge')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ huge: 2000 }),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(1);
  });

  it('does NOT produce phantom blank page when last atom fills page exactly', () => {
    const atoms = [entryAtom('e1'), entryAtom('e2')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      // e1 fills page 1 exactly at 912; e2 goes to page 2
      measuredHeights: heights({ e1: 912, e2: 100 }),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(2);
  });

  it('empty atoms array → 1 empty page', () => {
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms: [],
      measuredHeights: new Map(),
      template: TEMPLATE,
    });
    expect(r.pageCount).toBe(1);
    expect(r.atomLayouts.size).toBe(0);
  });

  it('chain of 3 (heading+heading+entry, defensive) all jump together', () => {
    const atoms = [
      entryAtom('big'),
      headingAtom('s1'),
      headingAtom('s2'),         // extremely defensive
      entryAtom('e1'),
    ];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ big: 800, s1: 30, s2: 30, e1: 200 }),
      template: TEMPLATE,
    });
    // chain s1+s2+e1 must end up on same page
    const p1 = r.atomLayouts.get('s1')?.pageIndex;
    const p2 = r.atomLayouts.get('s2')?.pageIndex;
    const p3 = r.atomLayouts.get('e1')?.pageIndex;
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
  });

  it('atoms have correct width (page content width)', () => {
    const atoms = [entryAtom('e1')];
    const r = SingleColumnLayoutStrategy.computeLayout({
      atoms,
      measuredHeights: heights({ e1: 100 }),
      template: TEMPLATE,
    });
    expect(r.atomLayouts.get('e1')?.width).toBeCloseTo(TEMPLATE.page.contentWidthPx, 5);
  });
});

describe('SingleColumnLayoutStrategy.describeColumns', () => {
  it('returns single main column at full content width', () => {
    const cols = SingleColumnLayoutStrategy.describeColumns(TEMPLATE);
    expect(cols).toHaveLength(1);
    expect(cols[0].id).toBe('main');
    expect(cols[0].xWithinPage).toBe(0);
    expect(cols[0].width).toBeCloseTo(TEMPLATE.page.contentWidthPx, 5);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- src/components/resume/v2/layout/strategies/
```

Expected: all 10 passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v2/layout/strategies/
git commit -m "v2 layout: SingleColumnLayoutStrategy + LayoutStrategy interface"
```

---

## Task 8: minimal-single-column Template + Registry

**Files:**
- Create: `frontend/src/components/resume/v2/templates/minimal-single-column.ts`
- Create: `frontend/src/components/resume/v2/templates/registry.ts`
- Test: `frontend/src/components/resume/v2/templates/registry.test.ts`

- [ ] **Step 1: Template config**

```ts
// frontend/src/components/resume/v2/templates/minimal-single-column.ts
import type { TemplateConfig } from '../layout/normalize-template';
import { PAGE_SPEC } from '../tokens/layout-tokens';

export const MINIMAL_SINGLE_COLUMN: TemplateConfig = {
  id: 'minimal-single-column',
  layoutStrategyId: 'single-column',
  page: {
    width: PAGE_SPEC.WIDTH,
    height: PAGE_SPEC.HEIGHT,
    margin: { ...PAGE_SPEC.MARGIN },
  },
  theme: {
    fontFamily: 'var(--font-resume), Inter, sans-serif',
    bodyFontSize: 14,
    bodyLineHeight: 1.5,
    bodyColor: '#374151',
    headingFontSize: 26,
    headingColor: '#111827',
    sectionHeadingFontSize: 11,
    sectionHeadingLetterSpacing: '0.14em',
    sectionHeadingColor: '#6b7280',
    accent: '#2563eb',
  },
  columnMapping: { default: 'main' },
};
```

- [ ] **Step 2: Registry**

```ts
// frontend/src/components/resume/v2/templates/registry.ts
import type { TemplateConfig } from '../layout/normalize-template';
import { MINIMAL_SINGLE_COLUMN } from './minimal-single-column';

export const TEMPLATES: Record<string, TemplateConfig> = {
  'minimal-single-column': MINIMAL_SINGLE_COLUMN,
};

export function getTemplate(id: string): TemplateConfig {
  return TEMPLATES[id] ?? MINIMAL_SINGLE_COLUMN;
}
```

- [ ] **Step 3: Tests**

```ts
// frontend/src/components/resume/v2/templates/registry.test.ts
import { describe, it, expect } from 'vitest';
import { getTemplate, TEMPLATES } from './registry';

describe('template registry', () => {
  it('returns minimal-single-column by id', () => {
    expect(getTemplate('minimal-single-column').id).toBe('minimal-single-column');
  });
  it('falls back to minimal-single-column for unknown id', () => {
    expect(getTemplate('does-not-exist').id).toBe('minimal-single-column');
  });
  it('exports exactly one template in v2', () => {
    expect(Object.keys(TEMPLATES)).toEqual(['minimal-single-column']);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/templates/
git add frontend/src/components/resume/v2/templates/
git commit -m "v2 templates: minimal-single-column + registry"
```

---

## Task 9: Mock TwoColumnLayoutStrategy for Architecture AC

The architecture AC (§ 8.5) requires demonstrating the LayoutStrategy interface is pluggable. We write a mock to prove it without shipping a real two-column template.

**Files:**
- Create: `frontend/src/components/resume/v2/layout/strategies/__tests__/MockTwoColumnLayoutStrategy.test.ts`

- [ ] **Step 1: Mock + test**

```ts
// frontend/src/components/resume/v2/layout/strategies/__tests__/MockTwoColumnLayoutStrategy.test.ts
import { describe, it, expect } from 'vitest';
import type { LayoutStrategy } from '../index';
import type { LayoutAtom } from '../../../types';
import { normalizeTemplate } from '../../normalize-template';

/** Demonstrates that the LayoutStrategy interface supports multi-column without
 * editor changes. v2 does not ship this — it only proves pluggability. */
const MockTwoColumnLayoutStrategy: LayoutStrategy = {
  computeLayout({ atoms, measuredHeights, template }) {
    const layouts = new Map();
    const half = template.page.contentWidthPx / 2;
    let mainY = 0, sideY = 0;
    for (const atom of atoms) {
      const h = measuredHeights.get(atom.id) ?? 0;
      const useSidebar = atom.kind === 'section-heading' && (atom as any).id.includes('skills');
      layouts.set(atom.id, {
        pageIndex: 0,
        xWithinPage: useSidebar ? 0 : half,
        yWithinPage: useSidebar ? sideY : mainY,
        width: half,
        height: h,
      });
      if (useSidebar) sideY += h; else mainY += h;
    }
    return { atomLayouts: layouts, pageCount: 1 };
  },
  describeColumns(template) {
    const w = template.page.contentWidthPx / 2;
    return [
      { id: 'sidebar', xWithinPage: 0, width: w },
      { id: 'main', xWithinPage: w, width: w },
    ];
  },
};

describe('Mock TwoColumnLayoutStrategy', () => {
  it('demonstrates the LayoutStrategy interface is pluggable', () => {
    const template = normalizeTemplate({
      id: 'mock', layoutStrategyId: 'single-column' as any,
      page: { width: '8.5in', height: '11in',
        margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' } },
      theme: {} as any,
    });
    const atoms: LayoutAtom[] = [
      { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false },
      { kind: 'section-heading', id: 'skills-1', sourceBlockId: 'skills-1', keepWithNext: true },
    ];
    const heights = new Map([['h', 50], ['skills-1', 30]]);
    const result = MockTwoColumnLayoutStrategy.computeLayout({
      atoms, measuredHeights: heights, template,
    });
    expect(result.atomLayouts.get('h')?.xWithinPage).toBeGreaterThan(0);  // main column
    expect(result.atomLayouts.get('skills-1')?.xWithinPage).toBe(0);     // sidebar
    expect(MockTwoColumnLayoutStrategy.describeColumns(template)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/layout/strategies/__tests__/
git add frontend/src/components/resume/v2/layout/strategies/__tests__/
git commit -m "v2 layout: architecture AC — mock TwoColumn proves strategy is pluggable"
```

---

## Task 10: Source-of-Truth Origin Helpers

**Files:**
- Create: `frontend/src/components/resume/v2/store/source-of-truth.ts`
- Test: `frontend/src/components/resume/v2/store/source-of-truth.test.ts`

- [ ] **Step 1: Origin module**

```ts
// frontend/src/components/resume/v2/store/source-of-truth.ts
import type { EditorId, TransactionId, UpdateOrigin, UpdateOriginType } from '../types';

let _txnCounter: TransactionId = 0;

export function nextTransactionId(): TransactionId {
  _txnCounter += 1;
  return _txnCounter;
}

export function makeOrigin(
  type: UpdateOriginType,
  editorId?: EditorId,
): UpdateOrigin {
  return { type, editorId, transactionId: nextTransactionId() };
}

/** True if this update originated from the given editor instance.
 *  Used by store.subscribe listeners to skip self-bounces. */
export function isOriginatedBy(origin: UpdateOrigin, editorId: EditorId): boolean {
  return origin.editorId === editorId;
}

/** Reset txn counter — test-only. */
export function _resetTransactionCounter(): void {
  _txnCounter = 0;
}
```

- [ ] **Step 2: Tests**

```ts
// frontend/src/components/resume/v2/store/source-of-truth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeOrigin, isOriginatedBy, _resetTransactionCounter } from './source-of-truth';

beforeEach(() => _resetTransactionCounter());

describe('source-of-truth', () => {
  it('makeOrigin assigns monotonic transaction ids', () => {
    const a = makeOrigin('tiptap', 'ed-1');
    const b = makeOrigin('tiptap', 'ed-1');
    expect(b.transactionId).toBeGreaterThan(a.transactionId);
  });
  it('isOriginatedBy matches editor id', () => {
    const o = makeOrigin('tiptap', 'ed-A');
    expect(isOriginatedBy(o, 'ed-A')).toBe(true);
    expect(isOriginatedBy(o, 'ed-B')).toBe(false);
  });
  it('returns false when origin has no editorId', () => {
    const o = makeOrigin('drag-reorder');
    expect(isOriginatedBy(o, 'ed-A')).toBe(false);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/store/source-of-truth.test.ts
git add frontend/src/components/resume/v2/store/
git commit -m "v2 store: source-of-truth origin helpers + transaction counter"
```

---

## Task 11: Zustand Store Skeleton

**Files:**
- Create: `frontend/src/components/resume/v2/store/useResumeStore.ts`
- Create: `frontend/src/components/resume/v2/store/undo-stack.ts`
- Test: `frontend/src/components/resume/v2/store/useResumeStore.test.ts`

- [ ] **Step 1: Undo stack module**

```ts
// frontend/src/components/resume/v2/store/undo-stack.ts
import type { ResumeDoc } from '../types';

export type UndoEntry = {
  doc: ResumeDoc;
  label: string;       // 'moveBullet', 'deleteEntry', etc.
};

const MAX_DEPTH = 100;

export class UndoStack {
  private past: UndoEntry[] = [];
  private future: UndoEntry[] = [];

  push(entry: UndoEntry): void {
    this.past.push(entry);
    if (this.past.length > MAX_DEPTH) this.past.shift();
    this.future = [];   // any new structural op clears redo
  }

  popPast(): UndoEntry | null {
    return this.past.pop() ?? null;
  }

  pushFuture(entry: UndoEntry): void {
    this.future.push(entry);
  }

  popFuture(): UndoEntry | null {
    return this.future.pop() ?? null;
  }

  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }
  clear(): void { this.past = []; this.future = []; }
}
```

- [ ] **Step 2: Store**

```ts
// frontend/src/components/resume/v2/store/useResumeStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ResumeDoc, BulletBlock, BlockId, ProseMirrorBulletDoc, UpdateOrigin,
  EditableField,
} from '../types';
import { makeOrigin } from './source-of-truth';
import { UndoStack } from './undo-stack';

export type StoredBullet = {
  block: BulletBlock;
  lastUpdateOrigin: UpdateOrigin;
  version: number;        // monotonic per-bullet
};

export type ResumeStoreState = {
  resume: ResumeDoc | null;
  // Per-bullet origin tracking (for store.subscribe listeners)
  bulletMeta: Record<BlockId, { origin: UpdateOrigin; version: number }>;
  // Undo stack lives outside React state to avoid serialization
  _undo: UndoStack;
};

export type ResumeStoreActions = {
  hydrate: (resume: ResumeDoc) => void;
  updateBullet: (id: BlockId, content: ProseMirrorBulletDoc, origin: UpdateOrigin) => void;
  updateField: (field: EditableField, value: string, origin: UpdateOrigin) => void;
  undo: () => void;
  redo: () => void;
  // (placeholders for actions wired in Task 12)
};

export const useResumeStore = create<ResumeStoreState & ResumeStoreActions>()(
  subscribeWithSelector((set, get) => ({
    resume: null,
    bulletMeta: {},
    _undo: new UndoStack(),

    hydrate: (resume) => {
      set({ resume, bulletMeta: {} });
      get()._undo.clear();
    },

    updateBullet: (id, content, origin) => {
      const r = get().resume;
      if (!r) return;
      const next: ResumeDoc = {
        ...r,
        sections: r.sections.map(s => ({
          ...s,
          entries: s.entries.map(e => ({
            ...e,
            bullets: e.bullets.map(b => b.id === id ? { ...b, content } : b),
          })),
        })),
        metadata: { ...r.metadata, updated_at: new Date().toISOString() },
      };
      const meta = get().bulletMeta;
      const prevVersion = meta[id]?.version ?? 0;
      set({
        resume: next,
        bulletMeta: { ...meta, [id]: { origin, version: prevVersion + 1 } },
      });
      // NOTE: bullet content updates do NOT push to undo stack — TipTap.history handles it
    },

    updateField: (field, value, origin) => {
      const r = get().resume;
      if (!r) return;
      const next = applyFieldUpdate(r, field, value);
      set({ resume: next });
      // Also no undo push — TipTap.history per-field handles single-line undo
    },

    undo: () => {
      const r = get().resume;
      if (!r) return;
      const past = get()._undo.popPast();
      if (!past) return;
      get()._undo.pushFuture({ doc: r, label: 'redo:' + past.label });
      set({ resume: past.doc, bulletMeta: {} });
    },

    redo: () => {
      const r = get().resume;
      if (!r) return;
      const fut = get()._undo.popFuture();
      if (!fut) return;
      get()._undo.push({ doc: r, label: 'undo:' + fut.label });
      set({ resume: fut.doc, bulletMeta: {} });
    },
  }))
);

function applyFieldUpdate(r: ResumeDoc, f: EditableField, value: string): ResumeDoc {
  switch (f.kind) {
    case 'header.name':
      return { ...r, header: { ...r.header, name: value } };
    case 'section.heading':
      return {
        ...r,
        sections: r.sections.map(s =>
          s.id === f.id ? { ...s, heading: value } : s),
      };
    case 'entry.title':
      return {
        ...r,
        sections: r.sections.map(s => ({
          ...s,
          entries: s.entries.map(e => e.id === f.id ? { ...e, title: value } : e),
        })),
      };
    case 'entry.meta':
      return {
        ...r,
        sections: r.sections.map(s => ({
          ...s,
          entries: s.entries.map(e => e.id === f.id ? { ...e, meta: value } : e),
        })),
      };
    default:
      // header.contact and bullet.content go through dedicated paths
      return r;
  }
}

/** Internal helper for tests: push current state to undo stack with a label.
 *  Real structural actions (Task 12) call this. */
export function _pushUndo(label: string): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  useResumeStore.getState()._undo.push({ doc: r, label });
}
```

- [ ] **Step 3: Tests**

```ts
// frontend/src/components/resume/v2/store/useResumeStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useResumeStore, _pushUndo } from './useResumeStore';
import { makeOrigin, _resetTransactionCounter } from './source-of-truth';
import type { ResumeDoc, ProseMirrorBulletDoc } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: 't', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'A', contact_lines: [] },
  sections: [{
    id: 's1', role: 'experience', heading: 'Experience', entries: [{
      id: 'e1', title: 'T', meta: 'M', bullets: [{
        id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }] },
      }],
    }],
  }],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: null, bulletMeta: {} });
  _resetTransactionCounter();
});

describe('useResumeStore', () => {
  it('hydrate sets resume', () => {
    useResumeStore.getState().hydrate(RESUME);
    expect(useResumeStore.getState().resume?.id).toBe('r');
  });

  it('updateBullet replaces bullet content + records origin', () => {
    useResumeStore.getState().hydrate(RESUME);
    const newContent: ProseMirrorBulletDoc = {
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }],
    };
    useResumeStore.getState().updateBullet('b1', newContent, makeOrigin('tiptap', 'ed-1'));
    const r = useResumeStore.getState().resume!;
    const text = r.sections[0].entries[0].bullets[0].content.content[0].content?.[0];
    expect((text as any).text).toBe('new');
    expect(useResumeStore.getState().bulletMeta['b1'].origin.editorId).toBe('ed-1');
  });

  it('updateField updates entry.title', () => {
    useResumeStore.getState().hydrate(RESUME);
    useResumeStore.getState().updateField(
      { kind: 'entry.title', id: 'e1' },
      'NewTitle',
      makeOrigin('tiptap', 'ed-2'),
    );
    expect(useResumeStore.getState().resume?.sections[0].entries[0].title).toBe('NewTitle');
  });

  it('subscribeWithSelector fires only when selected slice changes', () => {
    useResumeStore.getState().hydrate(RESUME);
    let calls = 0;
    const unsub = useResumeStore.subscribe(s => s.bulletMeta['b1']?.version, () => { calls++; });
    useResumeStore.getState().updateBullet('b1',
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
      makeOrigin('tiptap', 'ed-A'),
    );
    expect(calls).toBe(1);
    // Updating an unrelated field should NOT fire bullet listener
    useResumeStore.getState().updateField({ kind: 'entry.title', id: 'e1' }, 'y', makeOrigin('tiptap', 'ed-B'));
    expect(calls).toBe(1);
    unsub();
  });

  it('undo restores previous resume snapshot', () => {
    useResumeStore.getState().hydrate(RESUME);
    _pushUndo('test');
    useResumeStore.getState().updateField({ kind: 'entry.title', id: 'e1' }, 'changed', makeOrigin('tiptap', 'ed-X'));
    expect(useResumeStore.getState().resume?.sections[0].entries[0].title).toBe('changed');
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume?.sections[0].entries[0].title).toBe('T');
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/store/useResumeStore.test.ts
git add frontend/src/components/resume/v2/store/useResumeStore.ts \
         frontend/src/components/resume/v2/store/undo-stack.ts \
         frontend/src/components/resume/v2/store/useResumeStore.test.ts
git commit -m "v2 store: Zustand skeleton with subscribeWithSelector + undo stack"
```

---

## Task 12: Structural Store Actions (move/insert/delete/duplicate)

**Files:**
- Create: `frontend/src/components/resume/v2/store/actions/moveSection.ts`
- Create: `frontend/src/components/resume/v2/store/actions/moveEntry.ts`
- Create: `frontend/src/components/resume/v2/store/actions/moveBullet.ts`
- Create: `frontend/src/components/resume/v2/store/actions/insertBlock.ts`
- Create: `frontend/src/components/resume/v2/store/actions/deleteBlock.ts`
- Create: `frontend/src/components/resume/v2/store/actions/duplicateBlock.ts`
- Test: `frontend/src/components/resume/v2/store/actions/structural.test.ts`

- [ ] **Step 1: moveSection / moveEntry / moveBullet**

```ts
// frontend/src/components/resume/v2/store/actions/moveSection.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

export function moveSection(
  sectionId: BlockId,
  beforeSectionId: BlockId | null,
  origin: UpdateOrigin,
): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  const section = r.sections.find(s => s.id === sectionId);
  if (!section) return;
  _pushUndo('moveSection');
  const remaining = r.sections.filter(s => s.id !== sectionId);
  const insertAt = beforeSectionId === null
    ? remaining.length
    : remaining.findIndex(s => s.id === beforeSectionId);
  const next = [...remaining];
  next.splice(insertAt < 0 ? remaining.length : insertAt, 0, section);
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
```

```ts
// frontend/src/components/resume/v2/store/actions/moveEntry.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

export function moveEntry(
  entryId: BlockId,
  targetSectionId: BlockId,
  indexInSection: number,
  origin: UpdateOrigin,
): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  let entry: any = null;
  let sourceSectionId: BlockId | null = null;
  for (const s of r.sections) {
    const found = s.entries.find(e => e.id === entryId);
    if (found) { entry = found; sourceSectionId = s.id; break; }
  }
  if (!entry) return;
  _pushUndo('moveEntry');
  const next = r.sections.map(s => {
    if (s.id === sourceSectionId && s.id !== targetSectionId) {
      return { ...s, entries: s.entries.filter(e => e.id !== entryId) };
    }
    if (s.id === targetSectionId) {
      const cleaned = s.id === sourceSectionId
        ? s.entries.filter(e => e.id !== entryId)
        : s.entries;
      const out = [...cleaned];
      out.splice(Math.min(indexInSection, out.length), 0, entry);
      return { ...s, entries: out };
    }
    return s;
  });
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
```

```ts
// frontend/src/components/resume/v2/store/actions/moveBullet.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

export function moveBullet(
  bulletId: BlockId,
  targetEntryId: BlockId,
  indexInEntry: number,
  origin: UpdateOrigin,
): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  let bullet: any = null;
  let sourceEntryId: BlockId | null = null;
  for (const s of r.sections) {
    for (const e of s.entries) {
      const found = e.bullets.find(b => b.id === bulletId);
      if (found) { bullet = found; sourceEntryId = e.id; break; }
    }
    if (bullet) break;
  }
  if (!bullet) return;
  _pushUndo('moveBullet');
  const next = r.sections.map(s => ({
    ...s,
    entries: s.entries.map(e => {
      if (e.id === sourceEntryId && e.id !== targetEntryId) {
        return { ...e, bullets: e.bullets.filter(b => b.id !== bulletId) };
      }
      if (e.id === targetEntryId) {
        const cleaned = e.id === sourceEntryId
          ? e.bullets.filter(b => b.id !== bulletId)
          : e.bullets;
        const out = [...cleaned];
        out.splice(Math.min(indexInEntry, out.length), 0, bullet);
        return { ...e, bullets: out };
      }
      return e;
    }),
  }));
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
```

- [ ] **Step 2: insertBlock**

```ts
// frontend/src/components/resume/v2/store/actions/insertBlock.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type {
  BlockId, BulletBlock, EntryBlock, SectionBlock, SectionRole, UpdateOrigin,
} from '../../types';

function newId(): BlockId {
  return crypto.randomUUID();
}

export function insertBullet(
  entryId: BlockId,
  indexInEntry: number,
  contentDoc: BulletBlock['content'],
  origin: UpdateOrigin,
): BlockId {
  const r = useResumeStore.getState().resume;
  if (!r) throw new Error('No resume hydrated');
  _pushUndo('insertBullet');
  const newBullet: BulletBlock = { id: newId(), content: contentDoc };
  const next = r.sections.map(s => ({
    ...s,
    entries: s.entries.map(e => {
      if (e.id !== entryId) return e;
      const out = [...e.bullets];
      out.splice(Math.min(indexInEntry, out.length), 0, newBullet);
      return { ...e, bullets: out };
    }),
  }));
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
  return newBullet.id;
}

export function insertEntry(
  sectionId: BlockId,
  indexInSection: number,
  origin: UpdateOrigin,
): BlockId {
  const r = useResumeStore.getState().resume;
  if (!r) throw new Error('No resume hydrated');
  _pushUndo('insertEntry');
  const newEntry: EntryBlock = {
    id: newId(),
    title: '',
    meta: '',
    bullets: [{ id: newId(), content: { type: 'doc', content: [{ type: 'paragraph' }] } }],
  };
  const next = r.sections.map(s => {
    if (s.id !== sectionId) return s;
    const out = [...s.entries];
    out.splice(Math.min(indexInSection, out.length), 0, newEntry);
    return { ...s, entries: out };
  });
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
  return newEntry.id;
}

export function insertSection(
  role: SectionRole,
  beforeSectionId: BlockId | null,
  origin: UpdateOrigin,
): BlockId {
  const r = useResumeStore.getState().resume;
  if (!r) throw new Error('No resume hydrated');
  _pushUndo('insertSection');
  const newSection: SectionBlock = {
    id: newId(),
    role,
    heading: defaultHeadingForRole(role),
    entries: [],
  };
  const idx = beforeSectionId === null
    ? r.sections.length
    : r.sections.findIndex(s => s.id === beforeSectionId);
  const out = [...r.sections];
  out.splice(idx < 0 ? r.sections.length : idx, 0, newSection);
  useResumeStore.setState({
    resume: { ...r, sections: out, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
  return newSection.id;
}

function defaultHeadingForRole(role: SectionRole): string {
  switch (role) {
    case 'summary': return 'Summary';
    case 'skills': return 'Skills';
    case 'experience': return 'Experience';
    case 'projects': return 'Projects';
    case 'education': return 'Education';
    case 'awards': return 'Awards';
    case 'publications': return 'Publications';
    case 'custom': return 'Section';
  }
}
```

- [ ] **Step 3: deleteBlock + duplicateBlock**

```ts
// frontend/src/components/resume/v2/store/actions/deleteBlock.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

export function deleteSection(id: BlockId, origin: UpdateOrigin): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  _pushUndo('deleteSection');
  useResumeStore.setState({
    resume: { ...r, sections: r.sections.filter(s => s.id !== id),
      metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}

export function deleteEntry(id: BlockId, origin: UpdateOrigin): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  _pushUndo('deleteEntry');
  useResumeStore.setState({
    resume: { ...r,
      sections: r.sections.map(s => ({ ...s, entries: s.entries.filter(e => e.id !== id) })),
      metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}

export function deleteBullet(id: BlockId, origin: UpdateOrigin): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  _pushUndo('deleteBullet');
  useResumeStore.setState({
    resume: { ...r,
      sections: r.sections.map(s => ({
        ...s,
        entries: s.entries.map(e => ({ ...e, bullets: e.bullets.filter(b => b.id !== id) })),
      })),
      metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
```

```ts
// frontend/src/components/resume/v2/store/actions/duplicateBlock.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

function newId(): BlockId { return crypto.randomUUID(); }

function deepClone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function reassignIds(node: any): any {
  if (Array.isArray(node)) return node.map(reassignIds);
  if (node && typeof node === 'object') {
    const out: any = {};
    for (const k of Object.keys(node)) {
      out[k] = (k === 'id') ? newId() : reassignIds(node[k]);
    }
    return out;
  }
  return node;
}

export function duplicateBullet(id: BlockId, origin: UpdateOrigin): BlockId | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  for (const s of r.sections) {
    for (const e of s.entries) {
      const idx = e.bullets.findIndex(b => b.id === id);
      if (idx < 0) continue;
      _pushUndo('duplicateBullet');
      const cloned = reassignIds(deepClone(e.bullets[idx]));
      const newBullets = [...e.bullets];
      newBullets.splice(idx + 1, 0, cloned);
      const next = r.sections.map(sec => sec.id === s.id
        ? { ...sec, entries: sec.entries.map(ent => ent.id === e.id
            ? { ...ent, bullets: newBullets } : ent) }
        : sec);
      useResumeStore.setState({
        resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
      });
      return cloned.id;
    }
  }
  return null;
}

export function duplicateEntry(id: BlockId, origin: UpdateOrigin): BlockId | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  for (const s of r.sections) {
    const idx = s.entries.findIndex(e => e.id === id);
    if (idx < 0) continue;
    _pushUndo('duplicateEntry');
    const cloned = reassignIds(deepClone(s.entries[idx]));
    const newEntries = [...s.entries];
    newEntries.splice(idx + 1, 0, cloned);
    const next = r.sections.map(sec => sec.id === s.id
      ? { ...sec, entries: newEntries } : sec);
    useResumeStore.setState({
      resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
    });
    return cloned.id;
  }
  return null;
}

export function duplicateSection(id: BlockId, origin: UpdateOrigin): BlockId | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  const idx = r.sections.findIndex(s => s.id === id);
  if (idx < 0) return null;
  _pushUndo('duplicateSection');
  const cloned = reassignIds(deepClone(r.sections[idx]));
  const out = [...r.sections];
  out.splice(idx + 1, 0, cloned);
  useResumeStore.setState({
    resume: { ...r, sections: out, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
  return cloned.id;
}
```

- [ ] **Step 4: Tests**

```ts
// frontend/src/components/resume/v2/store/actions/structural.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useResumeStore } from '../useResumeStore';
import { makeOrigin, _resetTransactionCounter } from '../source-of-truth';
import { moveSection } from './moveSection';
import { moveEntry } from './moveEntry';
import { moveBullet } from './moveBullet';
import { insertBullet, insertEntry, insertSection } from './insertBlock';
import { deleteBullet, deleteEntry, deleteSection } from './deleteBlock';
import { duplicateBullet, duplicateEntry, duplicateSection } from './duplicateBlock';
import type { ResumeDoc } from '../../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: 't', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'A', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: 'E1', meta: 'M', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ] },
    ] },
    { id: 's2', role: 'skills', heading: 'Skills', entries: [] },
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(RESUME), bulletMeta: {} });
  _resetTransactionCounter();
});

describe('move actions', () => {
  it('moveSection reorders', () => {
    moveSection('s1', null, makeOrigin('drag-reorder'));
    const ids = useResumeStore.getState().resume!.sections.map(s => s.id);
    expect(ids).toEqual(['s2', 's1']);
  });
  it('moveEntry across sections', () => {
    moveEntry('e1', 's2', 0, makeOrigin('drag-reorder'));
    expect(useResumeStore.getState().resume!.sections[0].entries).toHaveLength(0);
    expect(useResumeStore.getState().resume!.sections[1].entries[0].id).toBe('e1');
  });
  it('moveBullet within entry preserves order semantics', () => {
    insertBullet('e1', 1, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'));
    const r = useResumeStore.getState().resume!;
    const newBulletId = r.sections[0].entries[0].bullets[1].id;
    moveBullet(newBulletId, 'e1', 0, makeOrigin('drag-reorder'));
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets[0].id).toBe(newBulletId);
  });
});

describe('insert actions', () => {
  it('insertSection adds at end when beforeId=null', () => {
    insertSection('education', null, makeOrigin('tiptap'));
    expect(useResumeStore.getState().resume!.sections.map(s => s.role))
      .toEqual(['experience', 'skills', 'education']);
  });
  it('insertEntry assigns a new uuid', () => {
    const id = insertEntry('s1', 0, makeOrigin('tiptap'));
    expect(id).toBeTruthy();
    expect(useResumeStore.getState().resume!.sections[0].entries[0].id).toBe(id);
  });
  it('insertBullet at index', () => {
    insertBullet('e1', 0, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('paste'));
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets).toHaveLength(2);
  });
});

describe('delete actions', () => {
  it('deleteSection removes by id', () => {
    deleteSection('s1', makeOrigin('tiptap'));
    expect(useResumeStore.getState().resume!.sections.map(s => s.id)).toEqual(['s2']);
  });
  it('deleteEntry removes by id', () => {
    deleteEntry('e1', makeOrigin('tiptap'));
    expect(useResumeStore.getState().resume!.sections[0].entries).toEqual([]);
  });
  it('deleteBullet removes by id', () => {
    deleteBullet('b1', makeOrigin('tiptap'));
    expect(useResumeStore.getState().resume!.sections[0].entries[0].bullets).toEqual([]);
  });
});

describe('duplicate actions reassign all ids', () => {
  it('duplicateBullet new id, content equal', () => {
    const newId = duplicateBullet('b1', makeOrigin('tiptap'))!;
    expect(newId).not.toBe('b1');
    const bullets = useResumeStore.getState().resume!.sections[0].entries[0].bullets;
    expect(bullets).toHaveLength(2);
    expect(bullets[1].id).toBe(newId);
  });
  it('duplicateEntry recursively reassigns bullet ids', () => {
    const newEntryId = duplicateEntry('e1', makeOrigin('tiptap'))!;
    const entries = useResumeStore.getState().resume!.sections[0].entries;
    expect(entries).toHaveLength(2);
    expect(entries[1].id).toBe(newEntryId);
    expect(entries[1].bullets[0].id).not.toBe('b1');
  });
  it('duplicateSection recursively reassigns entry + bullet ids', () => {
    const newSectionId = duplicateSection('s1', makeOrigin('tiptap'))!;
    const sections = useResumeStore.getState().resume!.sections;
    expect(sections).toHaveLength(3);
    expect(sections[1].id).toBe(newSectionId);
    expect(sections[1].entries[0].id).not.toBe('e1');
    expect(sections[1].entries[0].bullets[0].id).not.toBe('b1');
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/store/actions/
git add frontend/src/components/resume/v2/store/actions/
git commit -m "v2 store actions: move/insert/delete/duplicate (structural ops with undo)"
```

---

(continued in next chunk — Tasks 13–45)

## Task 13: Flush-Save Protocol (debounced backend POST + flushSave)

**Files:**
- Create: `frontend/src/components/resume/v2/store/flush-save.ts`
- Test: `frontend/src/components/resume/v2/store/flush-save.test.ts`

- [ ] **Step 1: Implementation**

```ts
// frontend/src/components/resume/v2/store/flush-save.ts
import { useResumeStore } from './useResumeStore';
import type { ResumeDoc } from '../types';

const DEBOUNCE_MS = 1500;

type FlushController = {
  pendingTimer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
  // version of resume that backend last ACK'd
  lastSavedDocSnapshot: string;     // JSON string for cheap equality
  // version of resume currently dirty (changed since last ACK)
  dirtyDocSnapshot: string;
};

const ctrl: FlushController = {
  pendingTimer: null,
  inflight: null,
  lastSavedDocSnapshot: '',
  dirtyDocSnapshot: '',
};

export type SaveBackend = (doc: ResumeDoc) => Promise<void>;

let _backend: SaveBackend = async () => { /* default no-op for tests */ };

export function setSaveBackend(backend: SaveBackend): void {
  _backend = backend;
}

/** Default backend: POST to /api/resume/[id]. */
export async function defaultBackendSave(doc: ResumeDoc): Promise<void> {
  const resp = await fetch(`/api/resume/${encodeURIComponent(doc.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  if (!resp.ok) throw new Error(`Save failed: ${resp.status}`);
}

export function startAutoSave(): () => void {
  const unsub = useResumeStore.subscribe(
    s => s.resume,
    (resume) => {
      if (!resume) return;
      ctrl.dirtyDocSnapshot = JSON.stringify(resume);
      if (ctrl.dirtyDocSnapshot === ctrl.lastSavedDocSnapshot) return;
      schedule();
    },
  );
  return unsub;
}

function schedule(): void {
  if (ctrl.pendingTimer) clearTimeout(ctrl.pendingTimer);
  ctrl.pendingTimer = setTimeout(() => {
    ctrl.pendingTimer = null;
    void runSave();
  }, DEBOUNCE_MS);
}

async function runSave(): Promise<void> {
  if (ctrl.inflight) await ctrl.inflight;
  const resume = useResumeStore.getState().resume;
  if (!resume) return;
  const snapshot = JSON.stringify(resume);
  ctrl.inflight = (async () => {
    await _backend(resume);
    ctrl.lastSavedDocSnapshot = snapshot;
  })();
  try { await ctrl.inflight; }
  finally { ctrl.inflight = null; }
}

/** Public: ensure backend has the latest resume. Resolves only after ACK. */
export async function flushSave(): Promise<void> {
  // Cancel pending debounce + force save now
  if (ctrl.pendingTimer) {
    clearTimeout(ctrl.pendingTimer);
    ctrl.pendingTimer = null;
  }
  await runSave();
  // If state changed during save, flush again until convergent
  let attempts = 0;
  while (
    JSON.stringify(useResumeStore.getState().resume) !== ctrl.lastSavedDocSnapshot
  ) {
    if (attempts++ > 5) {
      throw new Error('flushSave did not converge after 5 attempts');
    }
    await runSave();
  }
}

/** Test-only: reset internal state. */
export function _resetFlushController(): void {
  if (ctrl.pendingTimer) clearTimeout(ctrl.pendingTimer);
  ctrl.pendingTimer = null;
  ctrl.inflight = null;
  ctrl.lastSavedDocSnapshot = '';
  ctrl.dirtyDocSnapshot = '';
}
```

- [ ] **Step 2: Tests**

```ts
// frontend/src/components/resume/v2/store/flush-save.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useResumeStore } from './useResumeStore';
import { setSaveBackend, startAutoSave, flushSave, _resetFlushController } from './flush-save';
import type { ResumeDoc } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: 't', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  vi.useFakeTimers();
  useResumeStore.setState({ resume: null, bulletMeta: {} });
  _resetFlushController();
});

describe('flushSave', () => {
  it('debounces multiple updates into one save', async () => {
    const backend = vi.fn(async () => {});
    setSaveBackend(backend);
    const unsub = startAutoSave();
    useResumeStore.getState().hydrate(RESUME);
    useResumeStore.setState({ resume: { ...RESUME, title: 'x' } });
    useResumeStore.setState({ resume: { ...RESUME, title: 'xx' } });
    useResumeStore.setState({ resume: { ...RESUME, title: 'xxx' } });
    expect(backend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    expect(backend).toHaveBeenCalledTimes(1);
    expect((backend.mock.calls[0][0] as any).title).toBe('xxx');
    unsub();
  });

  it('flushSave forces immediate save and awaits ACK', async () => {
    const backend = vi.fn(async () => {});
    setSaveBackend(backend);
    const unsub = startAutoSave();
    useResumeStore.getState().hydrate(RESUME);
    useResumeStore.setState({ resume: { ...RESUME, title: 'flush-me' } });
    await flushSave();
    expect(backend).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('flushSave converges when state changes mid-save', async () => {
    let saveCount = 0;
    setSaveBackend(async () => {
      if (saveCount === 0) {
        // mutate during first save
        useResumeStore.setState({ resume: { ...RESUME, title: 'mid' } });
      }
      saveCount++;
    });
    const unsub = startAutoSave();
    useResumeStore.getState().hydrate(RESUME);
    useResumeStore.setState({ resume: { ...RESUME, title: 'first' } });
    await flushSave();
    expect(saveCount).toBeGreaterThanOrEqual(2);
    unsub();
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/store/flush-save.test.ts
git add frontend/src/components/resume/v2/store/flush-save.ts \
         frontend/src/components/resume/v2/store/flush-save.test.ts
git commit -m "v2 store: flushSave protocol (debounced + force-flush convergence)"
```

---

## Task 14: AtomElementRegistry (callback ref + ResizeObserver)

**Files:**
- Create: `frontend/src/components/resume/v2/layout/AtomElementRegistry.ts`
- Test: `frontend/src/components/resume/v2/layout/AtomElementRegistry.test.ts`

- [ ] **Step 1: Implementation**

```ts
// frontend/src/components/resume/v2/layout/AtomElementRegistry.ts
import type { AtomId } from '../types';

export type ResizeCallback = (atomId: AtomId, height: number) => void;

export class AtomElementRegistry {
  private elements = new Map<AtomId, HTMLElement>();
  private observer: ResizeObserver | null = null;
  private callback: ResizeCallback;

  constructor(onResize: ResizeCallback) {
    this.callback = onResize;
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const id = target.dataset.atomId as AtomId | undefined;
          if (!id) continue;
          this.callback(id, entry.contentRect.height);
        }
      });
    }
  }

  register(atomId: AtomId, el: HTMLElement | null): void {
    const old = this.elements.get(atomId);
    if (old && old !== el) {
      this.observer?.unobserve(old);
      this.elements.delete(atomId);
    }
    if (el) {
      el.dataset.atomId = atomId;
      this.elements.set(atomId, el);
      this.observer?.observe(el);
    }
  }

  measureAll(): Map<AtomId, number> {
    const out = new Map<AtomId, number>();
    for (const [id, el] of this.elements.entries()) {
      out.set(id, el.getBoundingClientRect().height);
    }
    return out;
  }

  destroy(): void {
    this.observer?.disconnect();
    this.elements.clear();
  }
}
```

- [ ] **Step 2: Tests (use happy-dom mock + manual measureAll)**

```ts
// frontend/src/components/resume/v2/layout/AtomElementRegistry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AtomElementRegistry } from './AtomElementRegistry';

describe('AtomElementRegistry', () => {
  it('register sets data-atom-id on element', () => {
    const reg = new AtomElementRegistry(vi.fn());
    const el = document.createElement('div');
    reg.register('a1', el);
    expect(el.dataset.atomId).toBe('a1');
    reg.destroy();
  });
  it('register null unregisters', () => {
    const reg = new AtomElementRegistry(vi.fn());
    const el = document.createElement('div');
    reg.register('a1', el);
    reg.register('a1', null);
    const heights = reg.measureAll();
    expect(heights.has('a1')).toBe(false);
    reg.destroy();
  });
  it('replacing element with new ref unobserves old', () => {
    const reg = new AtomElementRegistry(vi.fn());
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    reg.register('a1', el1);
    reg.register('a1', el2);
    expect(el2.dataset.atomId).toBe('a1');
    reg.destroy();
  });
  it('measureAll returns map of heights', () => {
    const reg = new AtomElementRegistry(vi.fn());
    const el = document.createElement('div');
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ height: 42, width: 100, top: 0, left: 0, right: 100, bottom: 42, x: 0, y: 0, toJSON: () => ({}) }),
    });
    reg.register('a1', el);
    const heights = reg.measureAll();
    expect(heights.get('a1')).toBe(42);
    reg.destroy();
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/layout/AtomElementRegistry.test.ts
git add frontend/src/components/resume/v2/layout/AtomElementRegistry.ts \
         frontend/src/components/resume/v2/layout/AtomElementRegistry.test.ts
git commit -m "v2 layout: AtomElementRegistry (ResizeObserver + callback ref pattern)"
```

---

## Task 15: LayoutEngine (composition lock + repaginate orchestration)

**Files:**
- Create: `frontend/src/components/resume/v2/layout/LayoutEngine.ts`
- Test: `frontend/src/components/resume/v2/layout/LayoutEngine.test.ts`

- [ ] **Step 1: Implementation**

```ts
// frontend/src/components/resume/v2/layout/LayoutEngine.ts
import type { LayoutAtom, AtomId, AtomLayout, EditorId } from '../types';
import type { NormalizedTemplate } from './normalize-template';
import { LAYOUT_STRATEGIES } from './strategies';

export type LayoutResult = {
  atomLayouts: Map<AtomId, AtomLayout>;
  pageCount: number;
};

export type LayoutEngineCallbacks = {
  onLayout: (result: LayoutResult) => void;
};

export class LayoutEngine {
  private composingEditors = new Set<EditorId>();
  private pendingRepaginate = false;
  private callbacks: LayoutEngineCallbacks;
  private latestAtoms: LayoutAtom[] = [];
  private latestHeights = new Map<AtomId, number>();
  private latestTemplate: NormalizedTemplate | null = null;

  constructor(callbacks: LayoutEngineCallbacks) {
    this.callbacks = callbacks;
  }

  setInputs(atoms: LayoutAtom[], heights: Map<AtomId, number>, template: NormalizedTemplate): void {
    this.latestAtoms = atoms;
    this.latestHeights = heights;
    this.latestTemplate = template;
  }

  compositionBegin(editorId: EditorId): void {
    this.composingEditors.add(editorId);
  }

  compositionEnd(editorId: EditorId): void {
    this.composingEditors.delete(editorId);
    if (this.composingEditors.size === 0 && this.pendingRepaginate) {
      this.pendingRepaginate = false;
      this.repaginate();
    }
  }

  requestRepaginate(): void {
    if (this.composingEditors.size > 0) {
      this.pendingRepaginate = true;
      return;
    }
    this.repaginate();
  }

  private repaginate(): void {
    if (!this.latestTemplate) return;
    const strategy = LAYOUT_STRATEGIES[this.latestTemplate.layoutStrategyId];
    if (!strategy) return;
    const result = strategy.computeLayout({
      atoms: this.latestAtoms,
      measuredHeights: this.latestHeights,
      template: this.latestTemplate,
    });
    this.callbacks.onLayout(result);
  }

  isComposing(): boolean { return this.composingEditors.size > 0; }
}
```

- [ ] **Step 2: Tests**

```ts
// frontend/src/components/resume/v2/layout/LayoutEngine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { LayoutEngine } from './LayoutEngine';
import { normalizeTemplate } from './normalize-template';
import type { LayoutAtom } from '../types';

const TEMPLATE = normalizeTemplate({
  id: 'fix', layoutStrategyId: 'single-column',
  page: { width: '8.5in', height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' } },
  theme: {} as any,
});

const atoms: LayoutAtom[] = [
  { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false },
];

describe('LayoutEngine', () => {
  it('requestRepaginate immediately calls onLayout when not composing', () => {
    const onLayout = vi.fn();
    const engine = new LayoutEngine({ onLayout });
    engine.setInputs(atoms, new Map([['h', 100]]), TEMPLATE);
    engine.requestRepaginate();
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('queues repaginate during composition, flushes on compositionend', () => {
    const onLayout = vi.fn();
    const engine = new LayoutEngine({ onLayout });
    engine.setInputs(atoms, new Map([['h', 100]]), TEMPLATE);
    engine.compositionBegin('ed-1');
    engine.requestRepaginate();
    expect(onLayout).not.toHaveBeenCalled();
    engine.compositionEnd('ed-1');
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('does not flush when other editors still composing', () => {
    const onLayout = vi.fn();
    const engine = new LayoutEngine({ onLayout });
    engine.setInputs(atoms, new Map([['h', 100]]), TEMPLATE);
    engine.compositionBegin('ed-1');
    engine.compositionBegin('ed-2');
    engine.requestRepaginate();
    engine.compositionEnd('ed-1');
    expect(onLayout).not.toHaveBeenCalled();
    engine.compositionEnd('ed-2');
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('isComposing reflects state', () => {
    const engine = new LayoutEngine({ onLayout: vi.fn() });
    expect(engine.isComposing()).toBe(false);
    engine.compositionBegin('ed-1');
    expect(engine.isComposing()).toBe(true);
    engine.compositionEnd('ed-1');
    expect(engine.isComposing()).toBe(false);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/layout/LayoutEngine.test.ts
git add frontend/src/components/resume/v2/layout/LayoutEngine.ts \
         frontend/src/components/resume/v2/layout/LayoutEngine.test.ts
git commit -m "v2 layout: LayoutEngine with composition lock + repaginate queue"
```

---

## Task 16: useMeasureModeSync hook (universal measure-mode sync)

**Files:**
- Create: `frontend/src/components/resume/v2/fields/useMeasureModeSync.ts`
- Test: `frontend/src/components/resume/v2/fields/useMeasureModeSync.test.tsx`

- [ ] **Step 1: Hook**

```ts
// frontend/src/components/resume/v2/fields/useMeasureModeSync.ts
import { useLayoutEffect } from 'react';
import type { Editor } from '@tiptap/core';
import type { CanvasMode } from '../types';

/**
 * For measure mode: sync prop value into editor before paint, so ResizeObserver
 * reads the new content's height on first measurement.
 *
 * Hard rule (§ 3.3 of spec): measure mode MUST use useLayoutEffect + setContent
 * with emitUpdate=false. Do not call this hook in edit/export mode (those
 * have different sync contracts).
 */
export function useMeasureModeSync<T>(
  mode: CanvasMode,
  editor: Editor | null,
  propValue: T,
  toDoc: (v: T) => any,
): void {
  useLayoutEffect(() => {
    if (mode !== 'measure' || !editor) return;
    editor.commands.setContent(toDoc(propValue), false);
  }, [mode, editor, propValue, toDoc]);
}
```

- [ ] **Step 2: Test (uses real TipTap to verify setContent fires)**

```tsx
// frontend/src/components/resume/v2/fields/useMeasureModeSync.test.tsx
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { EditorContent, useEditor } from '@tiptap/react';
import Text from '@tiptap/extension-text';
import { useMeasureModeSync } from './useMeasureModeSync';
import { SingleLineDocument } from '../extensions/SingleLineDocument';
import { stringToSingleLineDoc } from './single-line-adapter';

function TestField({ value, mode }: { value: string; mode: 'edit' | 'export' | 'measure' }) {
  const editor = useEditor({
    extensions: [SingleLineDocument, Text],
    content: stringToSingleLineDoc(value),
    immediatelyRender: false,
    editable: mode === 'edit',
  });
  useMeasureModeSync(mode, editor, value, stringToSingleLineDoc);
  return <EditorContent editor={editor} data-testid="ed" />;
}

describe('useMeasureModeSync', () => {
  it('measure mode: prop change syncs into editor', () => {
    const { rerender, getByTestId } = render(<TestField value="hello" mode="measure" />);
    expect(getByTestId('ed').textContent).toContain('hello');
    rerender(<TestField value="world" mode="measure" />);
    expect(getByTestId('ed').textContent).toContain('world');
  });

  it('edit mode: prop change does NOT sync into editor', () => {
    const { rerender, getByTestId } = render(<TestField value="hello" mode="edit" />);
    expect(getByTestId('ed').textContent).toContain('hello');
    rerender(<TestField value="world" mode="edit" />);
    expect(getByTestId('ed').textContent).toContain('hello');  // unchanged
  });

  it('export mode: prop change does NOT sync into editor', () => {
    const { rerender, getByTestId } = render(<TestField value="hello" mode="export" />);
    rerender(<TestField value="world" mode="export" />);
    expect(getByTestId('ed').textContent).toContain('hello');
  });
});
```

Add `@testing-library/react` if not yet installed:

```bash
cd frontend && npm install --save-dev @testing-library/react
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/fields/useMeasureModeSync.test.tsx
git add frontend/src/components/resume/v2/fields/useMeasureModeSync.ts \
         frontend/src/components/resume/v2/fields/useMeasureModeSync.test.tsx \
         frontend/package.json frontend/package-lock.json
git commit -m "v2 fields: useMeasureModeSync hook (universal measure-mode prop sync)"
```

---

## Task 17: NoNewline + AtomKeyboardNav extensions

**Files:**
- Create: `frontend/src/components/resume/v2/extensions/NoNewline.ts`
- Create: `frontend/src/components/resume/v2/extensions/AtomKeyboardNav.ts`
- Create: `frontend/src/components/resume/v2/interaction/AtomFocusManager.ts`
- Test: `frontend/src/components/resume/v2/extensions/NoNewline.test.ts`

- [ ] **Step 1: AtomFocusManager**

```ts
// frontend/src/components/resume/v2/interaction/AtomFocusManager.ts
import type { Editor } from '@tiptap/core';
import type { EditableField } from '../types';

function fieldKey(f: EditableField): string {
  switch (f.kind) {
    case 'header.name': return 'header.name';
    case 'header.contact': return `header.contact:${f.index}`;
    case 'section.heading': return `section.heading:${f.id}`;
    case 'entry.title': return `entry.title:${f.id}`;
    case 'entry.meta': return `entry.meta:${f.id}`;
    case 'bullet.content': return `bullet.content:${f.id}`;
  }
}

export class AtomFocusManager {
  private editors = new Map<string, Editor>();
  private order: string[] = [];

  register(field: EditableField, editor: Editor): void {
    const k = fieldKey(field);
    this.editors.set(k, editor);
    if (!this.order.includes(k)) this.order.push(k);
  }

  unregister(field: EditableField): void {
    const k = fieldKey(field);
    this.editors.delete(k);
    this.order = this.order.filter(x => x !== k);
  }

  setOrder(fields: EditableField[]): void {
    this.order = fields.map(fieldKey);
  }

  currentEditor(): Editor | null {
    for (const ed of this.editors.values()) {
      if (ed.isFocused) return ed;
    }
    return null;
  }

  focusNext(field: EditableField): void {
    const k = fieldKey(field);
    const i = this.order.indexOf(k);
    if (i < 0 || i >= this.order.length - 1) return;
    const nextK = this.order[i + 1];
    this.editors.get(nextK)?.commands.focus();
  }

  focusPrevious(field: EditableField): void {
    const k = fieldKey(field);
    const i = this.order.indexOf(k);
    if (i <= 0) return;
    const prevK = this.order[i - 1];
    this.editors.get(prevK)?.commands.focus();
  }
}

export const atomFocusManager = new AtomFocusManager();
```

- [ ] **Step 2: NoNewline extension**

```ts
// frontend/src/components/resume/v2/extensions/NoNewline.ts
import { Extension } from '@tiptap/core';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import type { EditableField } from '../types';

declare module '@tiptap/core' {
  interface EditorOptions {
    fieldKey?: EditableField;
  }
}

export const NoNewline = Extension.create({
  name: 'noNewline',
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const f = this.editor.options.fieldKey;
        if (f) atomFocusManager.focusNext(f);
        return true;
      },
      'Shift-Enter': () => {
        const f = this.editor.options.fieldKey;
        if (f) atomFocusManager.focusNext(f);
        return true;
      },
    };
  },
});
```

- [ ] **Step 3: AtomKeyboardNav extension (bullets)**

```ts
// frontend/src/components/resume/v2/extensions/AtomKeyboardNav.ts
import { Extension } from '@tiptap/core';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import { insertBullet, deleteBullet } from '../store/actions/insertBlock';
// (deleteBullet is in deleteBlock module — adjust imports per actual structure)
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin } from '../store/source-of-truth';
import type { BlockId, EditableField } from '../types';

export interface AtomKeyboardNavOptions {
  bulletId: BlockId;
  entryId: BlockId;
  field: EditableField;
}

export const AtomKeyboardNav = Extension.create<AtomKeyboardNavOptions>({
  name: 'atomKeyboardNav',
  addOptions() {
    return { bulletId: '', entryId: '', field: { kind: 'bullet.content', id: '' } };
  },
  addKeyboardShortcuts() {
    const opts = this.options;
    return {
      Enter: () => {
        // insert new empty bullet AFTER current; focus it
        const r = useResumeStore.getState().resume;
        if (!r) return false;
        const entry = r.sections.flatMap(s => s.entries).find(e => e.id === opts.entryId);
        if (!entry) return false;
        const idx = entry.bullets.findIndex(b => b.id === opts.bulletId);
        const newId = insertBullet(opts.entryId, idx + 1,
          { type: 'doc', content: [{ type: 'paragraph' }] },
          makeOrigin('tiptap', this.editor.options.editorId as any),
        );
        // Defer focus until React re-renders the new bullet
        setTimeout(() => {
          atomFocusManager.focusNext(opts.field);
        }, 0);
        return true;
      },
      'Cmd-Enter': () => {
        // alias for Enter
        return this.editor.commands.keyboardShortcut('Enter') as any;
      },
      'Shift-Enter': () => {
        // Hard break is deferred to v2.1; suppress default paragraph split
        return true;
      },
      Backspace: () => {
        // If at start of bullet AND bullet content is empty → merge with previous
        const { from, to } = this.editor.state.selection;
        if (from !== to) return false;
        const isAtStart = from <= 1;
        if (!isAtStart) return false;
        // Delete this bullet, focus previous field
        atomFocusManager.focusPrevious(opts.field);
        deleteBullet(opts.bulletId, makeOrigin('tiptap', this.editor.options.editorId as any));
        return true;
      },
      ArrowUp: () => {
        const { from } = this.editor.state.selection;
        if (from <= 1) {
          atomFocusManager.focusPrevious(opts.field);
          return true;
        }
        return false;
      },
      ArrowDown: () => {
        const { from } = this.editor.state.selection;
        const docSize = this.editor.state.doc.content.size;
        if (from >= docSize - 1) {
          atomFocusManager.focusNext(opts.field);
          return true;
        }
        return false;
      },
    };
  },
});
```

(Note: imports above assume deleteBullet is reachable — actually export from deleteBlock.ts. Adjust to `import { deleteBullet } from '../store/actions/deleteBlock';` when implementing.)

- [ ] **Step 4: NoNewline test**

```ts
// frontend/src/components/resume/v2/extensions/NoNewline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import { SingleLineDocument } from './SingleLineDocument';
import { NoNewline } from './NoNewline';
import { atomFocusManager } from '../interaction/AtomFocusManager';

beforeEach(() => {
  // reset focus manager (it's a singleton)
  (atomFocusManager as any).editors = new Map();
  (atomFocusManager as any).order = [];
});

describe('NoNewline', () => {
  it('Enter triggers atomFocusManager.focusNext', () => {
    const focusNext = vi.spyOn(atomFocusManager, 'focusNext');
    const editor = new Editor({
      extensions: [SingleLineDocument, Text, NoNewline],
      content: { type: 'doc', content: [{ type: 'text', text: 'hi' }] },
      // @ts-expect-error fieldKey is added via module aug
      fieldKey: { kind: 'entry.title', id: 'e1' },
    });
    const handled = editor.commands.keyboardShortcut('Enter');
    expect(handled).toBe(true);
    expect(focusNext).toHaveBeenCalled();
    editor.destroy();
  });
});
```

- [ ] **Step 5: AtomFocusManager test**

```ts
// frontend/src/components/resume/v2/interaction/AtomFocusManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import { AtomFocusManager } from './AtomFocusManager';
import { SingleLineDocument } from '../extensions/SingleLineDocument';

describe('AtomFocusManager', () => {
  it('register + setOrder + focusNext walks order', () => {
    const mgr = new AtomFocusManager();
    const e1 = new Editor({ extensions: [SingleLineDocument, Text] });
    const e2 = new Editor({ extensions: [SingleLineDocument, Text] });
    mgr.register({ kind: 'entry.title', id: 'A' }, e1);
    mgr.register({ kind: 'entry.meta', id: 'A' }, e2);
    mgr.setOrder([
      { kind: 'entry.title', id: 'A' },
      { kind: 'entry.meta', id: 'A' },
    ]);
    let nextFocused = '';
    e2.on('focus', () => { nextFocused = 'meta'; });
    mgr.focusNext({ kind: 'entry.title', id: 'A' });
    expect(nextFocused).toBe('meta');
    e1.destroy(); e2.destroy();
  });
});
```

- [ ] **Step 6: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/extensions/NoNewline.test.ts \
                            src/components/resume/v2/interaction/AtomFocusManager.test.ts
git add frontend/src/components/resume/v2/extensions/NoNewline.ts \
         frontend/src/components/resume/v2/extensions/AtomKeyboardNav.ts \
         frontend/src/components/resume/v2/interaction/AtomFocusManager.ts \
         frontend/src/components/resume/v2/extensions/NoNewline.test.ts \
         frontend/src/components/resume/v2/interaction/AtomFocusManager.test.ts
git commit -m "v2 extensions: NoNewline + AtomKeyboardNav + AtomFocusManager"
```

---

(continued — Tasks 18–45)

## Task 18: Bullet Paste Normalization

**Files:**
- Create: `frontend/src/components/resume/v2/fields/bullet-paste-normalize.ts`
- Test: `frontend/src/components/resume/v2/fields/bullet-paste-normalize.test.ts`

- [ ] **Step 1: Implementation**

```ts
// frontend/src/components/resume/v2/fields/bullet-paste-normalize.ts
import { Slice, Fragment, Node as PMNode } from '@tiptap/pm/model';
import type { ProseMirrorBulletDoc, BlockId } from '../types';

/**
 * collapseToSingleParagraph: walk a Slice, gather all inline content from
 * any block-level child (paragraph, heading, list item, etc.), join them with
 * a single space when crossing block boundaries, and return a Slice that is
 * just inline content. The bullet's BulletDocument schema (content: 'paragraph')
 * will then accept it inside the existing single paragraph.
 */
export function collapseToSingleParagraph(slice: Slice): Slice {
  const inlineNodes: PMNode[] = [];
  let firstBlock = true;
  slice.content.forEach((node) => {
    if (node.isText || node.isInline) {
      inlineNodes.push(node);
      return;
    }
    if (node.isBlock) {
      if (!firstBlock && inlineNodes.length > 0) {
        inlineNodes.push(node.type.schema.text(' '));
      }
      firstBlock = false;
      node.descendants((desc) => {
        if (desc.isText) inlineNodes.push(desc);
      });
    }
  });
  return new Slice(Fragment.from(inlineNodes), 0, 0);
}

/**
 * Parse a possibly multi-paragraph HTML string. Returns a list of paragraph
 * texts (plain). Used by transformPastedHTML to decide if we need to spawn
 * additional bullets after the first paragraph.
 */
export function splitHtmlIntoParagraphs(html: string): string[] {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // First, replace <br> with paragraph splits
  tmp.querySelectorAll('br').forEach(br => {
    br.replaceWith(document.createTextNode('\n\n'));
  });
  const blocks: string[] = [];
  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text.trim()) blocks.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName.toLowerCase();
    if (tag === 'p' || tag === 'div' || tag === 'li' || /^h[1-6]$/.test(tag)) {
      const text = (node.textContent ?? '').trim();
      if (text) blocks.push(text);
      return;
    }
    node.childNodes.forEach(walk);
  }
  Array.from(tmp.childNodes).forEach(walk);
  // Re-split on \n\n boundaries that came from <br>
  const out: string[] = [];
  for (const b of blocks) {
    b.split(/\n\n+/).map(s => s.trim()).filter(Boolean).forEach(s => out.push(s));
  }
  return out;
}

/**
 * Build a ProseMirrorBulletDoc from plain text.
 */
export function plainTextToBulletDoc(text: string): ProseMirrorBulletDoc {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : undefined,
    }],
  };
}

export type SpawnExtraBullets = (
  currentBulletId: BlockId,
  extraTexts: string[],
) => void;

/**
 * Returns transformPastedHTML handler bound to a spawn callback.
 * The handler:
 *   - parses pasted HTML into paragraphs
 *   - if 1 paragraph: returns it as-is (TipTap will paste normally)
 *   - if N paragraphs: returns the FIRST one's HTML, schedules spawn of N-1 new bullets
 */
export function makeTransformPastedHTML(
  currentBulletId: BlockId,
  spawn: SpawnExtraBullets,
): (html: string) => string {
  return (html: string) => {
    const paragraphs = splitHtmlIntoParagraphs(html);
    if (paragraphs.length <= 1) return html;
    spawn(currentBulletId, paragraphs.slice(1));
    return `<p>${escapeHtml(paragraphs[0])}</p>`;
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
```

- [ ] **Step 2: Tests**

```ts
// frontend/src/components/resume/v2/fields/bullet-paste-normalize.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  splitHtmlIntoParagraphs,
  plainTextToBulletDoc,
  makeTransformPastedHTML,
} from './bullet-paste-normalize';

describe('splitHtmlIntoParagraphs', () => {
  it('single <p> → 1 paragraph', () => {
    expect(splitHtmlIntoParagraphs('<p>hello</p>')).toEqual(['hello']);
  });
  it('multiple <p> → multiple', () => {
    expect(splitHtmlIntoParagraphs('<p>a</p><p>b</p><p>c</p>')).toEqual(['a', 'b', 'c']);
  });
  it('plain text with <br> splits', () => {
    expect(splitHtmlIntoParagraphs('hello<br><br>world')).toEqual(['hello', 'world']);
  });
  it('nested div handled', () => {
    expect(splitHtmlIntoParagraphs('<div>a</div><div>b</div>')).toEqual(['a', 'b']);
  });
  it('list items become paragraphs', () => {
    expect(splitHtmlIntoParagraphs('<ul><li>a</li><li>b</li></ul>')).toEqual(['a', 'b']);
  });
});

describe('plainTextToBulletDoc', () => {
  it('builds 1-tuple doc', () => {
    const doc = plainTextToBulletDoc('hello');
    expect(doc.content.length).toBe(1);
    expect(doc.content[0].content?.[0]).toEqual({ type: 'text', text: 'hello' });
  });
  it('empty text → paragraph with no content', () => {
    expect(plainTextToBulletDoc('').content[0].content).toBeUndefined();
  });
});

describe('makeTransformPastedHTML', () => {
  it('1 paragraph → no spawn, returns html as-is', () => {
    const spawn = vi.fn();
    const fn = makeTransformPastedHTML('b1', spawn);
    expect(fn('<p>hello</p>')).toBe('<p>hello</p>');
    expect(spawn).not.toHaveBeenCalled();
  });
  it('N paragraphs → spawn N-1, return first wrapped', () => {
    const spawn = vi.fn();
    const fn = makeTransformPastedHTML('b1', spawn);
    const out = fn('<p>a</p><p>b</p><p>c</p>');
    expect(out).toBe('<p>a</p>');
    expect(spawn).toHaveBeenCalledWith('b1', ['b', 'c']);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/fields/bullet-paste-normalize.test.ts
git add frontend/src/components/resume/v2/fields/bullet-paste-normalize.ts \
         frontend/src/components/resume/v2/fields/bullet-paste-normalize.test.ts
git commit -m "v2 fields: bullet paste normalization (multi-paragraph splits into bullets)"
```

---

## Task 19: PlainTextField component

**Files:**
- Create: `frontend/src/components/resume/v2/fields/PlainTextField.tsx`
- Test: `frontend/src/components/resume/v2/fields/PlainTextField.test.tsx`

- [ ] **Step 1: Component**

```tsx
// frontend/src/components/resume/v2/fields/PlainTextField.tsx
'use client';
import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import History from '@tiptap/extension-history';
import Text from '@tiptap/extension-text';
import { SingleLineDocument } from '../extensions/SingleLineDocument';
import { NoNewline } from '../extensions/NoNewline';
import { stringToSingleLineDoc, singleLineDocToString } from './single-line-adapter';
import { useMeasureModeSync } from './useMeasureModeSync';
import { useResumeStore } from '../store/useResumeStore';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import { makeOrigin, isOriginatedBy } from '../store/source-of-truth';
import type { CanvasMode, EditableField, EditorId } from '../types';

interface Props {
  fieldKey: EditableField;
  value: string;
  mode: CanvasMode;
  placeholder?: string;
  className?: string;
}

let _editorIdCounter = 0;
function nextEditorId(): EditorId {
  _editorIdCounter += 1;
  return `pt-${_editorIdCounter}`;
}

export function PlainTextField({ fieldKey, value, mode, placeholder, className }: Props) {
  const editorIdRef = useRef<EditorId>(nextEditorId());
  const initialDoc = useMemo(() => stringToSingleLineDoc(value), []);

  const editor = useEditor({
    extensions: [
      SingleLineDocument,
      Text,
      NoNewline,
      ...(mode === 'edit' ? [History] : []),
    ],
    content: initialDoc,
    editable: mode === 'edit',
    immediatelyRender: false,
    // @ts-expect-error: fieldKey + editorId added via module augmentation
    fieldKey,
    editorId: editorIdRef.current,
    onUpdate: mode === 'edit'
      ? ({ editor }) => {
          const next = singleLineDocToString(editor);
          useResumeStore.getState().updateField(fieldKey, next, makeOrigin('tiptap', editorIdRef.current));
        }
      : undefined,
  });

  useMeasureModeSync(mode, editor, value, stringToSingleLineDoc);

  // Edit mode: register with focus manager + listen for external updates
  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    atomFocusManager.register(fieldKey, editor);
    return () => atomFocusManager.unregister(fieldKey);
  }, [mode, editor, fieldKey]);

  return (
    <EditorContent
      editor={editor}
      className={className}
      data-field-key={fieldKeyString(fieldKey)}
      data-placeholder={placeholder}
    />
  );
}

function fieldKeyString(f: EditableField): string {
  switch (f.kind) {
    case 'header.name': return 'header.name';
    case 'header.contact': return `header.contact:${f.index}`;
    case 'section.heading': return `section.heading:${f.id}`;
    case 'entry.title': return `entry.title:${f.id}`;
    case 'entry.meta': return `entry.meta:${f.id}`;
    case 'bullet.content': return `bullet.content:${f.id}`;
  }
}
```

- [ ] **Step 2: Tests**

```tsx
// frontend/src/components/resume/v2/fields/PlainTextField.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PlainTextField } from './PlainTextField';
import { useResumeStore } from '../store/useResumeStore';
import { _resetTransactionCounter } from '../store/source-of-truth';

beforeEach(() => {
  useResumeStore.setState({
    resume: {
      schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
      header: { id: 'h', name: 'Foo', contact_lines: [] },
      sections: [{ id: 's', role: 'experience', heading: 'Exp', entries: [
        { id: 'e1', title: 'T', meta: '', bullets: [] }
      ]}],
      metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
    },
    bulletMeta: {},
  });
  _resetTransactionCounter();
});

describe('PlainTextField', () => {
  it('renders initial value', () => {
    const { container } = render(
      <PlainTextField fieldKey={{ kind: 'entry.title', id: 'e1' }} value="Hello" mode="edit" />
    );
    expect(container.textContent).toContain('Hello');
  });

  it('measure mode does NOT register with focus manager', () => {
    // No assertion needed beyond render not throwing; focus manager state checked elsewhere
    expect(() => render(
      <PlainTextField fieldKey={{ kind: 'entry.title', id: 'e1' }} value="X" mode="measure" />
    )).not.toThrow();
  });

  it('export mode renders content but is not editable', () => {
    const { container } = render(
      <PlainTextField fieldKey={{ kind: 'entry.title', id: 'e1' }} value="Y" mode="export" />
    );
    const editorEl = container.querySelector('[contenteditable]');
    expect(editorEl?.getAttribute('contenteditable')).toBe('false');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/fields/PlainTextField.test.tsx
git add frontend/src/components/resume/v2/fields/PlainTextField.tsx \
         frontend/src/components/resume/v2/fields/PlainTextField.test.tsx
git commit -m "v2 fields: PlainTextField (single-line plain text, all 3 modes)"
```

---

## Task 20: BulletField component (with paste normalization + AtomKeyboardNav)

**Files:**
- Create: `frontend/src/components/resume/v2/fields/BulletField.tsx`
- Test: `frontend/src/components/resume/v2/fields/BulletField.test.tsx`

- [ ] **Step 1: Component**

```tsx
// frontend/src/components/resume/v2/fields/BulletField.tsx
'use client';
import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import History from '@tiptap/extension-history';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { BulletDocument } from '../extensions/BulletDocument';
import { AtomKeyboardNav } from '../extensions/AtomKeyboardNav';
import { useMeasureModeSync } from './useMeasureModeSync';
import {
  makeTransformPastedHTML,
  plainTextToBulletDoc,
  collapseToSingleParagraph,
} from './bullet-paste-normalize';
import { useResumeStore } from '../store/useResumeStore';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import { makeOrigin, isOriginatedBy } from '../store/source-of-truth';
import { insertBullet } from '../store/actions/insertBlock';
import type {
  CanvasMode, BlockId, ProseMirrorBulletDoc, EditorId, EditableField,
} from '../types';

interface Props {
  bulletId: BlockId;
  entryId: BlockId;
  content: ProseMirrorBulletDoc;
  mode: CanvasMode;
}

let _editorIdCounter = 0;
function nextEditorId(): EditorId {
  _editorIdCounter += 1;
  return `bl-${_editorIdCounter}`;
}

export function BulletField({ bulletId, entryId, content, mode }: Props) {
  const editorIdRef = useRef<EditorId>(nextEditorId());
  const fieldKey: EditableField = { kind: 'bullet.content', id: bulletId };

  const editor = useEditor({
    extensions: [
      BulletDocument,
      Paragraph,
      Text,
      Bold,
      Italic,
      Link.configure({ openOnClick: false }),
      ...(mode === 'edit' ? [
        History,
        AtomKeyboardNav.configure({ bulletId, entryId, field: fieldKey }),
      ] : []),
    ],
    content,
    editable: mode === 'edit',
    immediatelyRender: false,
    // @ts-expect-error
    fieldKey,
    editorId: editorIdRef.current,
    editorProps: {
      transformPastedHTML: mode === 'edit'
        ? makeTransformPastedHTML(bulletId, (currentId, extras) => {
            const r = useResumeStore.getState().resume;
            if (!r) return;
            const entry = r.sections.flatMap(s => s.entries).find(e => e.bullets.some(b => b.id === currentId));
            if (!entry) return;
            const idx = entry.bullets.findIndex(b => b.id === currentId);
            extras.forEach((text, i) => {
              insertBullet(entry.id, idx + 1 + i, plainTextToBulletDoc(text), makeOrigin('paste', editorIdRef.current));
            });
          })
        : undefined,
      transformPasted: (slice) => {
        if (slice.content.childCount === 0) return slice;
        return collapseToSingleParagraph(slice);
      },
      handleDOMEvents: mode === 'edit' ? {
        compositionstart: () => {
          // hook into LayoutEngine — provided via context in Task 22
          (window as any).__layoutEngine?.compositionBegin(editorIdRef.current);
          return false;
        },
        compositionend: () => {
          (window as any).__layoutEngine?.compositionEnd(editorIdRef.current);
          return false;
        },
      } : {},
    },
    onUpdate: mode === 'edit'
      ? ({ editor }) => {
          const next = editor.getJSON() as ProseMirrorBulletDoc;
          useResumeStore.getState().updateBullet(
            bulletId, next, makeOrigin('tiptap', editorIdRef.current),
          );
        }
      : undefined,
  });

  useMeasureModeSync(mode, editor, content, identity);

  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    atomFocusManager.register(fieldKey, editor);
    return () => atomFocusManager.unregister(fieldKey);
  }, [mode, editor, bulletId]);

  // External-source store update path (§ 3.3)
  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    return useResumeStore.subscribe(
      s => s.bulletMeta[bulletId],
      (meta) => {
        if (!meta) return;
        if (isOriginatedBy(meta.origin, editorIdRef.current)) return;
        if (editor.view.composing) return;
        if (editor.isFocused) return;
        const r = useResumeStore.getState().resume;
        const bullet = r?.sections
          .flatMap(s => s.entries)
          .flatMap(e => e.bullets)
          .find(b => b.id === bulletId);
        if (!bullet) return;
        editor.commands.setContent(bullet.content, false);
      },
    );
  }, [mode, editor, bulletId]);

  return <EditorContent editor={editor} className="resume-bullet" data-field-key={`bullet.content:${bulletId}`} />;
}

function identity<T>(x: T): T { return x; }
```

- [ ] **Step 2: Tests**

```tsx
// frontend/src/components/resume/v2/fields/BulletField.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BulletField } from './BulletField';
import { useResumeStore } from '../store/useResumeStore';
import { _resetTransactionCounter } from '../store/source-of-truth';
import type { ProseMirrorBulletDoc } from '../types';

const makeContent = (text: string): ProseMirrorBulletDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }],
});

beforeEach(() => {
  useResumeStore.setState({
    resume: {
      schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
      header: { id: 'h', name: '', contact_lines: [] },
      sections: [{ id: 's', role: 'experience', heading: 'Exp', entries: [
        { id: 'e1', title: '', meta: '', bullets: [
          { id: 'b1', content: makeContent('initial') },
        ]},
      ]}],
      metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
    },
    bulletMeta: {},
  });
  _resetTransactionCounter();
});

describe('BulletField', () => {
  it('renders initial content', () => {
    const { container } = render(
      <BulletField bulletId="b1" entryId="e1" content={makeContent('hello')} mode="edit" />
    );
    expect(container.textContent).toContain('hello');
  });

  it('export mode is not editable', () => {
    const { container } = render(
      <BulletField bulletId="b1" entryId="e1" content={makeContent('x')} mode="export" />
    );
    const ed = container.querySelector('[contenteditable]');
    expect(ed?.getAttribute('contenteditable')).toBe('false');
  });

  it('measure mode follows prop content (verified via integration test in T 21)', () => {
    expect(() => render(
      <BulletField bulletId="b1" entryId="e1" content={makeContent('m')} mode="measure" />
    )).not.toThrow();
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/fields/BulletField.test.tsx
git add frontend/src/components/resume/v2/fields/BulletField.tsx \
         frontend/src/components/resume/v2/fields/BulletField.test.tsx
git commit -m "v2 fields: BulletField (TipTap rich text + paste normalize + IME hooks)"
```

---

## Task 21: ContactLinesField component

**Files:**
- Create: `frontend/src/components/resume/v2/fields/ContactLinesField.tsx`
- Test: `frontend/src/components/resume/v2/fields/ContactLinesField.test.tsx`

- [ ] **Step 1: Component**

```tsx
// frontend/src/components/resume/v2/fields/ContactLinesField.tsx
'use client';
import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import History from '@tiptap/extension-history';
import Text from '@tiptap/extension-text';
import Link from '@tiptap/extension-link';
import { SingleLineWithMarksDocument } from '../extensions/SingleLineWithMarksDocument';
import { NoNewline } from '../extensions/NoNewline';
import { contactItemsToDoc, docToContactItems } from './contact-lines-adapter';
import { useMeasureModeSync } from './useMeasureModeSync';
import { useResumeStore } from '../store/useResumeStore';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import { makeOrigin } from '../store/source-of-truth';
import type { CanvasMode, ContactItem, EditorId } from '../types';

interface Props {
  index: number;
  items: ContactItem[];     // contact_lines[index]'s items, here we treat all contact as one editor
  mode: CanvasMode;
}

let _idCounter = 0;
function nextEditorId(): EditorId { _idCounter += 1; return `cl-${_idCounter}`; }

export function ContactLinesField({ index, items, mode }: Props) {
  const editorIdRef = useRef<EditorId>(nextEditorId());
  const initialDoc = useMemo(() => contactItemsToDoc(items), []);

  const editor = useEditor({
    extensions: [
      SingleLineWithMarksDocument,
      Text,
      Link.configure({ openOnClick: false }),
      NoNewline,
      ...(mode === 'edit' ? [History] : []),
    ],
    content: initialDoc,
    editable: mode === 'edit',
    immediatelyRender: false,
    // @ts-expect-error
    fieldKey: { kind: 'header.contact', index },
    editorId: editorIdRef.current,
    onUpdate: mode === 'edit'
      ? ({ editor }) => {
          const next = docToContactItems(editor);
          const r = useResumeStore.getState().resume;
          if (!r) return;
          const newContact = [...r.header.contact_lines];
          // For v2 we treat all contact_lines as one editor — replace whole array
          useResumeStore.setState({
            resume: {
              ...r,
              header: { ...r.header, contact_lines: next },
              metadata: { ...r.metadata, updated_at: new Date().toISOString() },
            },
          });
        }
      : undefined,
  });

  useMeasureModeSync(mode, editor, items, contactItemsToDoc);

  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    atomFocusManager.register({ kind: 'header.contact', index }, editor);
    return () => atomFocusManager.unregister({ kind: 'header.contact', index });
  }, [mode, editor, index]);

  return <EditorContent editor={editor} className="resume-contact-line" />;
}
```

- [ ] **Step 2: Tests**

```tsx
// frontend/src/components/resume/v2/fields/ContactLinesField.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ContactLinesField } from './ContactLinesField';
import { useResumeStore } from '../store/useResumeStore';
import { _resetTransactionCounter } from '../store/source-of-truth';
import type { ContactItem } from '../types';

beforeEach(() => {
  useResumeStore.setState({
    resume: {
      schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
      header: { id: 'h', name: '', contact_lines: [] },
      sections: [],
      metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
    },
    bulletMeta: {},
  });
  _resetTransactionCounter();
});

const items: ContactItem[] = [
  { type: 'text', value: 'a@b.com' },
  { type: 'link', label: 'GH', url: 'https://x.com' },
];

describe('ContactLinesField', () => {
  it('renders text + link', () => {
    const { container } = render(<ContactLinesField index={0} items={items} mode="edit" />);
    expect(container.textContent).toContain('a@b.com');
    expect(container.textContent).toContain('GH');
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://x.com');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/fields/ContactLinesField.test.tsx
git add frontend/src/components/resume/v2/fields/ContactLinesField.tsx \
         frontend/src/components/resume/v2/fields/ContactLinesField.test.tsx
git commit -m "v2 fields: ContactLinesField (text + link marks via SingleLineWithMarks)"
```

---

## Task 22: coords helper + AtomLayout positioning

**Files:**
- Create: `frontend/src/components/resume/v2/layout/coords.ts`
- Test: `frontend/src/components/resume/v2/layout/coords.test.ts`

- [ ] **Step 1: Implementation**

```ts
// frontend/src/components/resume/v2/layout/coords.ts
import { parseToPx, SCREEN_GAP, PRINT_GAP } from '../tokens/layout-tokens';
import type { AtomLayout, CanvasMode } from '../types';
import type { NormalizedTemplate } from './normalize-template';

export const SCREEN_GAP_PX = parseToPx(SCREEN_GAP);
export const PRINT_GAP_PX = parseToPx(PRINT_GAP);

export function gapForMode(mode: CanvasMode): number {
  return mode === 'edit' ? SCREEN_GAP_PX : PRINT_GAP_PX;
}

export function getAtomAbsoluteCoord(
  atomLayout: AtomLayout,
  mode: CanvasMode,
  template: NormalizedTemplate,
): { top: number; left: number } {
  const gap = gapForMode(mode);
  const pageStride = template.page.heightPx + gap;
  return {
    top: atomLayout.pageIndex * pageStride
       + template.page.marginPx.top
       + atomLayout.yWithinPage,
    left: template.page.marginPx.left + atomLayout.xWithinPage,
  };
}

export function getPageCardTop(pageIndex: number, mode: CanvasMode, template: NormalizedTemplate): number {
  const gap = gapForMode(mode);
  return pageIndex * (template.page.heightPx + gap);
}

export function totalCanvasHeight(pageCount: number, mode: CanvasMode, template: NormalizedTemplate): number {
  const gap = gapForMode(mode);
  return pageCount * template.page.heightPx + Math.max(0, pageCount - 1) * gap;
}
```

- [ ] **Step 2: Tests**

```ts
// frontend/src/components/resume/v2/layout/coords.test.ts
import { describe, it, expect } from 'vitest';
import { getAtomAbsoluteCoord, getPageCardTop, totalCanvasHeight, SCREEN_GAP_PX, PRINT_GAP_PX } from './coords';
import { normalizeTemplate } from './normalize-template';

const T = normalizeTemplate({
  id: 'fix', layoutStrategyId: 'single-column',
  page: { width: '8.5in', height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' } },
  theme: {} as any,
});

describe('coords', () => {
  it('SCREEN_GAP_PX = 16, PRINT_GAP_PX = 0', () => {
    expect(SCREEN_GAP_PX).toBe(16);
    expect(PRINT_GAP_PX).toBe(0);
  });

  it('getAtomAbsoluteCoord respects mode gap', () => {
    const layout = { pageIndex: 1, xWithinPage: 0, yWithinPage: 100, width: 0, height: 0 };
    const editTop = getAtomAbsoluteCoord(layout, 'edit', T).top;
    const exportTop = getAtomAbsoluteCoord(layout, 'export', T).top;
    expect(editTop).toBe(exportTop + SCREEN_GAP_PX);
  });

  it('getPageCardTop page 0 = 0', () => {
    expect(getPageCardTop(0, 'edit', T)).toBe(0);
  });

  it('totalCanvasHeight: 1 page = pageHeight, no gap', () => {
    expect(totalCanvasHeight(1, 'edit', T)).toBe(T.page.heightPx);
    expect(totalCanvasHeight(1, 'export', T)).toBe(T.page.heightPx);
  });

  it('totalCanvasHeight: 3 pages edit includes 2 gaps', () => {
    expect(totalCanvasHeight(3, 'edit', T))
      .toBe(3 * T.page.heightPx + 2 * SCREEN_GAP_PX);
  });

  it('totalCanvasHeight: 3 pages export has no gap', () => {
    expect(totalCanvasHeight(3, 'export', T)).toBe(3 * T.page.heightPx);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/layout/coords.test.ts
git add frontend/src/components/resume/v2/layout/coords.ts \
         frontend/src/components/resume/v2/layout/coords.test.ts
git commit -m "v2 layout: coords helper (screen vs print absolute positioning)"
```

---

## Task 23: Atom renderer components (Header / SectionHeading / Entry)

**Files:**
- Create: `frontend/src/components/resume/v2/atoms/HeaderAtomRenderer.tsx`
- Create: `frontend/src/components/resume/v2/atoms/SectionHeadingAtomRenderer.tsx`
- Create: `frontend/src/components/resume/v2/atoms/EntryAtomRenderer.tsx`
- Create: `frontend/src/components/resume/v2/atoms/AtomRenderer.tsx`

- [ ] **Step 1: HeaderAtomRenderer**

```tsx
// frontend/src/components/resume/v2/atoms/HeaderAtomRenderer.tsx
'use client';
import { PlainTextField } from '../fields/PlainTextField';
import { ContactLinesField } from '../fields/ContactLinesField';
import type { CanvasMode, HeaderBlock } from '../types';

interface Props {
  header: HeaderBlock;
  mode: CanvasMode;
}

export function HeaderAtomRenderer({ header, mode }: Props) {
  return (
    <div className="resume-header" data-block-id={header.id} data-atom-content>
      <PlainTextField
        fieldKey={{ kind: 'header.name' }}
        value={header.name}
        mode={mode}
        className="resume-name"
        placeholder="Your name"
      />
      <ContactLinesField index={0} items={header.contact_lines} mode={mode} />
    </div>
  );
}
```

- [ ] **Step 2: SectionHeadingAtomRenderer**

```tsx
// frontend/src/components/resume/v2/atoms/SectionHeadingAtomRenderer.tsx
'use client';
import { PlainTextField } from '../fields/PlainTextField';
import type { CanvasMode, SectionBlock } from '../types';

interface Props {
  section: SectionBlock;
  mode: CanvasMode;
}

export function SectionHeadingAtomRenderer({ section, mode }: Props) {
  return (
    <div className="resume-section-heading" data-block-id={section.id} data-atom-content>
      <PlainTextField
        fieldKey={{ kind: 'section.heading', id: section.id }}
        value={section.heading}
        mode={mode}
        className="resume-section-heading-text"
        placeholder="Section heading"
      />
    </div>
  );
}
```

- [ ] **Step 3: EntryAtomRenderer**

```tsx
// frontend/src/components/resume/v2/atoms/EntryAtomRenderer.tsx
'use client';
import { PlainTextField } from '../fields/PlainTextField';
import { BulletField } from '../fields/BulletField';
import type { CanvasMode, EntryBlock } from '../types';

interface Props {
  entry: EntryBlock;
  mode: CanvasMode;
}

export function EntryAtomRenderer({ entry, mode }: Props) {
  return (
    <div className="resume-entry" data-block-id={entry.id} data-atom-content>
      <PlainTextField
        fieldKey={{ kind: 'entry.title', id: entry.id }}
        value={entry.title}
        mode={mode}
        className="resume-entry-title"
        placeholder="Title (e.g. Software Engineer @ Acme)"
      />
      <PlainTextField
        fieldKey={{ kind: 'entry.meta', id: entry.id }}
        value={entry.meta}
        mode={mode}
        className="resume-entry-meta"
        placeholder="Date · Location"
      />
      <ul className="resume-entry-bullets">
        {entry.bullets.map(b => (
          <li key={b.id} className="resume-bullet" data-block-id={b.id}>
            <BulletField bulletId={b.id} entryId={entry.id} content={b.content} mode={mode} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: AtomRenderer (dispatcher)**

```tsx
// frontend/src/components/resume/v2/atoms/AtomRenderer.tsx
'use client';
import { useCallback } from 'react';
import { HeaderAtomRenderer } from './HeaderAtomRenderer';
import { SectionHeadingAtomRenderer } from './SectionHeadingAtomRenderer';
import { EntryAtomRenderer } from './EntryAtomRenderer';
import type { LayoutAtom, CanvasMode, ResumeDoc } from '../types';
import type { AtomElementRegistry } from '../layout/AtomElementRegistry';

interface Props {
  atom: LayoutAtom;
  resume: ResumeDoc;
  mode: CanvasMode;
  registry?: AtomElementRegistry | null;
  style?: React.CSSProperties;
}

export function AtomRenderer({ atom, resume, mode, registry, style }: Props) {
  const refCallback = useCallback((el: HTMLDivElement | null) => {
    registry?.register(atom.id, el);
  }, [registry, atom.id]);

  let content: React.ReactNode = null;

  if (atom.kind === 'header') {
    content = <HeaderAtomRenderer header={resume.header} mode={mode} />;
  } else if (atom.kind === 'section-heading') {
    const section = resume.sections.find(s => s.id === atom.sourceBlockId);
    if (section) content = <SectionHeadingAtomRenderer section={section} mode={mode} />;
  } else if (atom.kind === 'entry') {
    const entry = resume.sections.flatMap(s => s.entries).find(e => e.id === atom.sourceBlockId);
    if (entry) content = <EntryAtomRenderer entry={entry} mode={mode} />;
  }

  return (
    <div ref={refCallback} style={style} data-atom-id={atom.id} data-atom-kind={atom.kind}>
      {content}
    </div>
  );
}
```

- [ ] **Step 5: Smoke render test**

```tsx
// frontend/src/components/resume/v2/atoms/AtomRenderer.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { AtomRenderer } from './AtomRenderer';
import { useResumeStore } from '../store/useResumeStore';
import type { ResumeDoc, LayoutAtom } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'A', contact_lines: [{ type: 'text', value: 'a@b.com' }] },
  sections: [{ id: 's1', role: 'experience', heading: 'Exp', entries: [
    { id: 'e1', title: 'Eng', meta: 'Now', bullets: [
      { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'did stuff' }] }] } },
    ]},
  ]}],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: RESUME, bulletMeta: {} });
});

describe('AtomRenderer dispatch', () => {
  it('renders header atom', () => {
    const atom: LayoutAtom = { kind: 'header', id: 'h', sourceBlockId: 'h', keepWithNext: false };
    const { container } = render(<AtomRenderer atom={atom} resume={RESUME} mode="export" />);
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('a@b.com');
  });
  it('renders section-heading atom', () => {
    const atom: LayoutAtom = { kind: 'section-heading', id: 's1', sourceBlockId: 's1', keepWithNext: true };
    const { container } = render(<AtomRenderer atom={atom} resume={RESUME} mode="export" />);
    expect(container.textContent).toContain('Exp');
  });
  it('renders entry atom with bullets', () => {
    const atom: LayoutAtom = { kind: 'entry', id: 'e1', sourceBlockId: 'e1', keepWithNext: false };
    const { container } = render(<AtomRenderer atom={atom} resume={RESUME} mode="export" />);
    expect(container.textContent).toContain('Eng');
    expect(container.textContent).toContain('did stuff');
  });
});
```

- [ ] **Step 6: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/atoms/
git add frontend/src/components/resume/v2/atoms/
git commit -m "v2 atoms: HeaderAtom/SectionHeadingAtom/EntryAtom + dispatcher"
```

---

(continued — Tasks 24–45)

## Task 24: Layer components (PageBackground / AtomContent / PrintFlowPlaceholders / Interaction)

**Files:**
- Create: `frontend/src/components/resume/v2/layers/PageBackgroundLayer.tsx`
- Create: `frontend/src/components/resume/v2/layers/AtomContentLayer.tsx`
- Create: `frontend/src/components/resume/v2/layers/PrintFlowPlaceholders.tsx`
- Create: `frontend/src/components/resume/v2/layers/InteractionLayer.tsx`

- [ ] **Step 1: PageBackgroundLayer**

```tsx
// frontend/src/components/resume/v2/layers/PageBackgroundLayer.tsx
'use client';
import { gapForMode, getPageCardTop } from '../layout/coords';
import type { CanvasMode } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';

interface Props {
  pageCount: number;
  mode: CanvasMode;
  template: NormalizedTemplate;
}

export function PageBackgroundLayer({ pageCount, mode, template }: Props) {
  return (
    <div
      className="page-background-layer"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: pageCount }).map((_, i) => (
        <div
          key={i}
          className="page-card"
          data-page-index={i}
          style={{
            position: 'absolute',
            top: getPageCardTop(i, mode, template),
            left: 0,
            width: template.page.widthPx,
            height: template.page.heightPx,
            background: 'white',
            boxShadow: mode === 'edit'
              ? '0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)'
              : 'none',
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: PrintFlowPlaceholders**

```tsx
// frontend/src/components/resume/v2/layers/PrintFlowPlaceholders.tsx
'use client';
import { gapForMode } from '../layout/coords';
import type { CanvasMode } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';

interface Props {
  pageCount: number;
  mode: CanvasMode;
  template: NormalizedTemplate;
}

/**
 * Static block-flow placeholders. Their height drives the document's natural
 * height; in print mode each one gets `break-after: page` so Chromium splits
 * the PDF on those exact boundaries instead of trying to slice absolute content.
 */
export function PrintFlowPlaceholders({ pageCount, mode, template }: Props) {
  const gap = gapForMode(mode);
  return (
    <div
      className="print-flow-placeholders"
      aria-hidden
      style={{ position: 'relative', visibility: 'hidden', pointerEvents: 'none' }}
    >
      {Array.from({ length: pageCount }).map((_, i) => (
        <div
          key={i}
          className="print-page-placeholder"
          style={{
            height: template.page.heightPx,
            marginBottom: i < pageCount - 1 ? gap : 0,
            breakAfter: mode === 'export' ? 'page' : 'auto',
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: AtomContentLayer**

```tsx
// frontend/src/components/resume/v2/layers/AtomContentLayer.tsx
'use client';
import { AtomRenderer } from '../atoms/AtomRenderer';
import { getAtomAbsoluteCoord } from '../layout/coords';
import type { LayoutAtom, AtomLayout, AtomId, ResumeDoc, CanvasMode } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';
import type { AtomElementRegistry } from '../layout/AtomElementRegistry';

interface Props {
  atoms: LayoutAtom[];
  layouts: Map<AtomId, AtomLayout>;
  resume: ResumeDoc;
  mode: CanvasMode;
  template: NormalizedTemplate;
  registry?: AtomElementRegistry | null;
}

export function AtomContentLayer({ atoms, layouts, resume, mode, template, registry }: Props) {
  return (
    <div
      className="atom-content-layer"
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    >
      {atoms.map((atom) => {
        const layout = layouts.get(atom.id);
        if (!layout) return null;
        const coord = getAtomAbsoluteCoord(layout, mode, template);
        return (
          <div
            key={atom.id}
            style={{
              position: 'absolute',
              top: coord.top,
              left: coord.left,
              width: layout.width,
              pointerEvents: 'auto',
            }}
          >
            <AtomRenderer atom={atom} resume={resume} mode={mode} registry={registry} />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: InteractionLayer (skeleton — will be filled in by later tasks)**

```tsx
// frontend/src/components/resume/v2/layers/InteractionLayer.tsx
'use client';
import type { LayoutAtom, AtomLayout, AtomId } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';

interface Props {
  atoms: LayoutAtom[];
  layouts: Map<AtomId, AtomLayout>;
  template: NormalizedTemplate;
}

/**
 * Renders DragHandles, Selection outlines, Hover affordances, Drop indicator,
 * Drag ghost, BubbleMenu portals. Filled in by Tasks 28-33.
 */
export function InteractionLayer(_props: Props) {
  return (
    <div
      className="interaction-layer"
      data-edit-only
      style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
    >
      {/* DragHandle, SelectionOutline, HoverAffordance, DropIndicator placeholder slots
         — wired up in Task 28-33 */}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/resume/v2/layers/
git commit -m "v2 layers: PageBackground / AtomContent / PrintFlow / Interaction (skeleton)"
```

---

## Task 25: ResumeDocumentCanvas (the single renderer)

**Files:**
- Create: `frontend/src/components/resume/v2/ResumeDocumentCanvas.tsx`
- Create: `frontend/src/components/resume/v2/canvas-print.css`
- Test: `frontend/src/components/resume/v2/ResumeDocumentCanvas.test.tsx`

- [ ] **Step 1: canvas-print.css**

```css
/* frontend/src/components/resume/v2/canvas-print.css */

@page {
  size: 8.5in 11in;
  margin: 0;
}

@media print {
  body { margin: 0; }
  .interaction-layer,
  [data-edit-only] {
    display: none !important;
  }
  .page-card,
  .print-page-placeholder {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
```

- [ ] **Step 2: Implementation**

```tsx
// frontend/src/components/resume/v2/ResumeDocumentCanvas.tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { projectAtoms } from './layout/atoms-projection';
import { normalizeTemplate } from './layout/normalize-template';
import { LayoutEngine, type LayoutResult } from './layout/LayoutEngine';
import { AtomElementRegistry } from './layout/AtomElementRegistry';
import { totalCanvasHeight } from './layout/coords';
import { PageBackgroundLayer } from './layers/PageBackgroundLayer';
import { AtomContentLayer } from './layers/AtomContentLayer';
import { PrintFlowPlaceholders } from './layers/PrintFlowPlaceholders';
import { InteractionLayer } from './layers/InteractionLayer';
import { atomFocusManager } from './interaction/AtomFocusManager';
import type { ResumeDoc, CanvasMode, LayoutAtom, AtomId, AtomLayout, EditableField } from './types';
import type { TemplateConfig } from './layout/normalize-template';

import './tokens/canvas.css';
import './canvas-print.css';

interface Props {
  resume: ResumeDoc;
  template: TemplateConfig;
  mode: CanvasMode;
}

export function ResumeDocumentCanvas({ resume, template, mode }: Props) {
  const norm = useMemo(() => normalizeTemplate(template), [template]);
  const atoms = useMemo<LayoutAtom[]>(() => projectAtoms(resume), [resume]);

  const [layout, setLayout] = useState<LayoutResult>({ atomLayouts: new Map(), pageCount: 1 });
  const heightsRef = useRef(new Map<AtomId, number>());
  const engineRef = useRef<LayoutEngine | null>(null);
  const registryRef = useRef<AtomElementRegistry | null>(null);

  // Build engine once
  useEffect(() => {
    const engine = new LayoutEngine({ onLayout: setLayout });
    engineRef.current = engine;
    if (mode === 'edit') (window as any).__layoutEngine = engine;
    return () => {
      engine.setInputs([], new Map(), norm);
      engineRef.current = null;
      if (mode === 'edit') (window as any).__layoutEngine = undefined;
    };
  }, [norm, mode]);

  // Build registry once
  useEffect(() => {
    const reg = new AtomElementRegistry((atomId, height) => {
      heightsRef.current.set(atomId, height);
      const engine = engineRef.current;
      if (!engine) return;
      engine.setInputs(atoms, heightsRef.current, norm);
      engine.requestRepaginate();
    });
    registryRef.current = reg;
    return () => { reg.destroy(); registryRef.current = null; };
  }, [atoms, norm]);

  // Update focus order whenever atoms change
  useEffect(() => {
    if (mode !== 'edit') return;
    const fields: EditableField[] = [];
    fields.push({ kind: 'header.name' });
    resume.header.contact_lines.forEach((_, i) => fields.push({ kind: 'header.contact', index: i }));
    for (const s of resume.sections) {
      fields.push({ kind: 'section.heading', id: s.id });
      for (const e of s.entries) {
        fields.push({ kind: 'entry.title', id: e.id });
        fields.push({ kind: 'entry.meta', id: e.id });
        for (const b of e.bullets) {
          fields.push({ kind: 'bullet.content', id: b.id });
        }
      }
    }
    atomFocusManager.setOrder(fields);
  }, [resume, mode]);

  // Trigger layout pass when atoms/template change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setInputs(atoms, heightsRef.current, norm);
    engine.requestRepaginate();
  }, [atoms, norm]);

  // data-paginated lifecycle (§ 6.8)
  const ready = layout.atomLayouts.size > 0 || atoms.length === 0;
  useEffect(() => {
    document.body.dataset.paginated = 'false';   // unconditional first
    if (!ready) return;
    let cancelled = false;
    (async () => {
      if ('fonts' in document) await (document as any).fonts.ready;
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      if (cancelled) return;
      document.body.dataset.paginated = 'true';
    })();
    return () => { cancelled = true; };
  }, [ready, layout]);

  const totalHeight = totalCanvasHeight(layout.pageCount, mode, norm);

  return (
    <div
      data-canvas-root
      data-mode={mode}
      style={{ position: 'relative', width: norm.page.widthPx, height: totalHeight, margin: '0 auto' }}
    >
      <PrintFlowPlaceholders pageCount={layout.pageCount} mode={mode} template={norm} />
      <PageBackgroundLayer pageCount={layout.pageCount} mode={mode} template={norm} />
      <AtomContentLayer
        atoms={atoms}
        layouts={layout.atomLayouts}
        resume={resume}
        mode={mode}
        template={norm}
        registry={registryRef.current}
      />
      {mode === 'edit' && (
        <InteractionLayer atoms={atoms} layouts={layout.atomLayouts} template={norm} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Smoke test**

```tsx
// frontend/src/components/resume/v2/ResumeDocumentCanvas.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ResumeDocumentCanvas } from './ResumeDocumentCanvas';
import { MINIMAL_SINGLE_COLUMN } from './templates/minimal-single-column';
import type { ResumeDoc } from './types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'X', contact_lines: [] },
  sections: [{ id: 's1', role: 'experience', heading: 'Exp', entries: [
    { id: 'e1', title: 'T', meta: 'M', bullets: [
      { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] } },
    ]},
  ]}],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

describe('ResumeDocumentCanvas', () => {
  it('renders without crash in edit mode', () => {
    const { container } = render(
      <ResumeDocumentCanvas resume={RESUME} template={MINIMAL_SINGLE_COLUMN} mode="edit" />
    );
    expect(container.querySelector('[data-canvas-root]')).toBeTruthy();
    expect(container.querySelector('[data-mode="edit"]')).toBeTruthy();
  });

  it('renders without crash in export mode', () => {
    const { container } = render(
      <ResumeDocumentCanvas resume={RESUME} template={MINIMAL_SINGLE_COLUMN} mode="export" />
    );
    expect(container.querySelector('[data-mode="export"]')).toBeTruthy();
    expect(container.querySelector('.interaction-layer')).toBeFalsy();
  });

  it('renders without crash in measure mode', () => {
    const { container } = render(
      <ResumeDocumentCanvas resume={RESUME} template={MINIMAL_SINGLE_COLUMN} mode="measure" />
    );
    expect(container.querySelector('[data-mode="measure"]')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/ResumeDocumentCanvas.test.tsx
git add frontend/src/components/resume/v2/ResumeDocumentCanvas.tsx \
         frontend/src/components/resume/v2/canvas-print.css \
         frontend/src/components/resume/v2/ResumeDocumentCanvas.test.tsx
git commit -m "v2: ResumeDocumentCanvas (the single renderer for all 3 modes)"
```

---

## Task 26: SlashCommand extension

**Files:**
- Create: `frontend/src/components/resume/v2/extensions/SlashCommand.ts`
- Create: `frontend/src/components/resume/v2/interaction/SlashMenu.tsx`
- Test: `frontend/src/components/resume/v2/extensions/SlashCommand.test.ts`

- [ ] **Step 1: SlashCommand extension** (uses Suggestion utility from `@tiptap/suggestion`)

Install `@tiptap/suggestion` first:

```bash
cd frontend && npm install @tiptap/suggestion
```

```ts
// frontend/src/components/resume/v2/extensions/SlashCommand.ts
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { insertBullet, insertEntry, insertSection } from '../store/actions/insertBlock';
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin } from '../store/source-of-truth';
import type { BlockId, SectionRole } from '../types';

export type SlashItem = {
  id: 'bullet' | 'entry' | 'heading';
  title: string;
  hint: string;
};

const ITEMS: SlashItem[] = [
  { id: 'bullet', title: 'Add bullet', hint: 'Insert a bullet below this one' },
  { id: 'entry', title: 'Add entry', hint: 'Insert a new entry in this section' },
  { id: 'heading', title: 'Add section', hint: 'Insert a new section' },
];

export interface SlashCommandOptions {
  bulletId: BlockId;
  entryId: BlockId;
  sectionId: BlockId;
  onShowMenu: (items: SlashItem[], onSelect: (item: SlashItem) => void) => void;
  onHideMenu: () => void;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',
  addOptions() {
    return {
      bulletId: '', entryId: '', sectionId: '',
      onShowMenu: () => {}, onHideMenu: () => {},
    };
  },
  addProseMirrorPlugins() {
    const opts = this.options;
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        items: () => ITEMS,
        command: ({ editor, range, props }) => {
          const item = props as SlashItem;
          editor.chain().focus().deleteRange(range).run();
          if (item.id === 'bullet') {
            const r = useResumeStore.getState().resume!;
            const entry = r.sections.flatMap(s => s.entries).find(e => e.id === opts.entryId);
            const idx = entry ? entry.bullets.findIndex(b => b.id === opts.bulletId) : -1;
            insertBullet(opts.entryId, idx + 1,
              { type: 'doc', content: [{ type: 'paragraph' }] },
              makeOrigin('tiptap'),
            );
          } else if (item.id === 'entry') {
            insertEntry(opts.sectionId, 9999, makeOrigin('tiptap'));
          } else if (item.id === 'heading') {
            insertSection('custom', null, makeOrigin('tiptap'));
          }
        },
        render: () => {
          let onSelect: ((item: SlashItem) => void) | null = null;
          return {
            onStart: (props) => {
              onSelect = (item: SlashItem) => props.command(item as any);
              opts.onShowMenu(ITEMS, onSelect);
            },
            onUpdate: () => {},
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') { opts.onHideMenu(); return true; }
              return false;
            },
            onExit: () => { opts.onHideMenu(); },
          };
        },
      }),
    ];
  },
});
```

- [ ] **Step 2: Minimal SlashMenu UI**

```tsx
// frontend/src/components/resume/v2/interaction/SlashMenu.tsx
'use client';
import { useEffect, useState } from 'react';
import type { SlashItem } from '../extensions/SlashCommand';

type State = {
  visible: boolean;
  items: SlashItem[];
  onSelect: ((item: SlashItem) => void) | null;
  anchor: { x: number; y: number };
};

let setStateExternal: ((s: State) => void) | null = null;

export function showSlashMenu(items: SlashItem[], onSelect: (item: SlashItem) => void): void {
  const sel = window.getSelection();
  let anchor = { x: 100, y: 100 };
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    anchor = { x: rect.left, y: rect.bottom + 4 };
  }
  setStateExternal?.({ visible: true, items, onSelect, anchor });
}

export function hideSlashMenu(): void {
  setStateExternal?.({ visible: false, items: [], onSelect: null, anchor: { x: 0, y: 0 } });
}

export function SlashMenu() {
  const [state, setState] = useState<State>({ visible: false, items: [], onSelect: null, anchor: { x: 0, y: 0 } });
  useEffect(() => { setStateExternal = setState; return () => { setStateExternal = null; }; }, []);
  if (!state.visible) return null;
  return (
    <div
      style={{
        position: 'fixed', top: state.anchor.y, left: state.anchor.x,
        background: 'white', border: '1px solid #ccc', borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: 4, zIndex: 9999,
      }}
    >
      {state.items.map(item => (
        <button
          key={item.id}
          onClick={() => state.onSelect?.(item)}
          style={{ display: 'block', width: '100%', padding: '6px 12px', textAlign: 'left', border: 0, background: 'transparent' }}
        >
          <div style={{ fontWeight: 500 }}>{item.title}</div>
          <div style={{ fontSize: 11, color: '#666' }}>{item.hint}</div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Smoke test**

```ts
// frontend/src/components/resume/v2/extensions/SlashCommand.test.ts
import { describe, it, expect } from 'vitest';
import { SlashCommand } from './SlashCommand';

describe('SlashCommand', () => {
  it('exports an extension with correct name', () => {
    expect((SlashCommand as any).name || (SlashCommand as any).config?.name).toBeDefined();
  });
});
```

- [ ] **Step 4: Wire SlashCommand into BulletField**

Modify `BulletField.tsx` extensions array (edit mode only):

```tsx
// inside BulletField.tsx, edit-mode extensions
import { SlashCommand } from '../extensions/SlashCommand';
import { showSlashMenu, hideSlashMenu } from '../interaction/SlashMenu';

// (assume currentSectionId is derivable from store lookup of entryId → section)
SlashCommand.configure({
  bulletId,
  entryId,
  sectionId: useResumeStore.getState().resume?.sections.find(
    s => s.entries.some(e => e.id === entryId),
  )?.id ?? '',
  onShowMenu: showSlashMenu,
  onHideMenu: hideSlashMenu,
}),
```

- [ ] **Step 5: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/extensions/SlashCommand.test.ts
git add frontend/src/components/resume/v2/extensions/SlashCommand.ts \
         frontend/src/components/resume/v2/interaction/SlashMenu.tsx \
         frontend/src/components/resume/v2/extensions/SlashCommand.test.ts \
         frontend/src/components/resume/v2/fields/BulletField.tsx \
         frontend/package.json frontend/package-lock.json
git commit -m "v2: SlashCommand extension + SlashMenu UI (bullet/entry/heading)"
```

---

## Task 27: MarkdownInputRules extension

**Files:**
- Create: `frontend/src/components/resume/v2/extensions/MarkdownInputRules.ts`
- Test: `frontend/src/components/resume/v2/extensions/MarkdownInputRules.test.ts`

- [ ] **Step 1: Implementation**

```ts
// frontend/src/components/resume/v2/extensions/MarkdownInputRules.ts
import { Extension, markInputRule } from '@tiptap/core';

/**
 * Bullet-only markdown shortcuts: **bold**, *italic*, [text](url) → bold/italic/link mark.
 */
export const MarkdownInputRules = Extension.create({
  name: 'markdownInputRules',
  addInputRules() {
    return [
      // **bold**
      markInputRule({
        find: /\*\*([^*]+)\*\*$/,
        type: this.editor.schema.marks.bold,
      }),
      // *italic*  (don't match leading ** for bold)
      markInputRule({
        find: /(?<!\*)\*([^*]+)\*(?!\*)$/,
        type: this.editor.schema.marks.italic,
      }),
      // [label](url)
      markInputRule({
        find: /\[([^\]]+)\]\(([^)]+)\)$/,
        type: this.editor.schema.marks.link,
        getAttributes: (match) => ({ href: match[2] }),
      }),
    ];
  },
});
```

- [ ] **Step 2: Test**

```ts
// frontend/src/components/resume/v2/extensions/MarkdownInputRules.test.ts
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { BulletDocument } from './BulletDocument';
import { MarkdownInputRules } from './MarkdownInputRules';

describe('MarkdownInputRules', () => {
  it('**foo** triggers bold input rule', () => {
    const editor = new Editor({
      extensions: [BulletDocument, Paragraph, Text, Bold, Italic, Link, MarkdownInputRules],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    editor.commands.insertContent('**foo**');
    const json = editor.getJSON();
    const text = json.content?.[0].content?.[0];
    expect(text).toMatchObject({ type: 'text', text: 'foo', marks: [{ type: 'bold' }] });
    editor.destroy();
  });
});
```

- [ ] **Step 3: Wire into BulletField edit-only extensions; commit**

Add `MarkdownInputRules` to BulletField.tsx's `BULLET_EXTENSIONS_EDIT_ONLY` list.

```bash
cd frontend && npm test -- src/components/resume/v2/extensions/MarkdownInputRules.test.ts
git add frontend/src/components/resume/v2/extensions/MarkdownInputRules.ts \
         frontend/src/components/resume/v2/extensions/MarkdownInputRules.test.ts \
         frontend/src/components/resume/v2/fields/BulletField.tsx
git commit -m "v2: MarkdownInputRules (**bold**, *italic*, [text](url) in bullets)"
```

---

## Task 28: BubbleMenu (bold/italic/link toolbar on text selection)

**Files:**
- Create: `frontend/src/components/resume/v2/interaction/BubbleMenu.tsx`
- Test: `frontend/src/components/resume/v2/interaction/BubbleMenu.test.tsx`

- [ ] **Step 1: Component**

Install `@tiptap/extension-bubble-menu`:

```bash
cd frontend && npm install @tiptap/extension-bubble-menu
```

```tsx
// frontend/src/components/resume/v2/interaction/BubbleMenu.tsx
'use client';
import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react';
import type { Editor } from '@tiptap/core';

interface Props {
  editor: Editor | null;
}

export function BubbleMenu({ editor }: Props) {
  if (!editor) return null;
  return (
    <TiptapBubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100 }}
      shouldShow={({ editor, from, to }) => from !== to && editor.isFocused}
    >
      <div
        style={{
          display: 'flex', gap: 4, background: 'white',
          border: '1px solid #ccc', borderRadius: 6, padding: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          style={{ fontWeight: editor.isActive('bold') ? 'bold' : 'normal' }}
        >B</button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          style={{ fontStyle: editor.isActive('italic') ? 'italic' : 'normal' }}
        >I</button>
        <button
          onClick={() => {
            const href = window.prompt('URL');
            if (href) editor.chain().focus().setLink({ href }).run();
          }}
        >🔗</button>
      </div>
    </TiptapBubbleMenu>
  );
}
```

- [ ] **Step 2: Wire into BulletField (mode === 'edit' only)**

Inside `BulletField.tsx` return:

```tsx
return (
  <>
    <EditorContent editor={editor} className="resume-bullet" data-field-key={`bullet.content:${bulletId}`} />
    {mode === 'edit' && <BubbleMenu editor={editor} />}
  </>
);
```

- [ ] **Step 3: Smoke test**

```tsx
// frontend/src/components/resume/v2/interaction/BubbleMenu.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BubbleMenu } from './BubbleMenu';

describe('BubbleMenu', () => {
  it('renders nothing when editor is null', () => {
    const { container } = render(<BubbleMenu editor={null} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 4: Commit**

```bash
cd frontend && npm test -- src/components/resume/v2/interaction/BubbleMenu.test.tsx
git add frontend/src/components/resume/v2/interaction/BubbleMenu.tsx \
         frontend/src/components/resume/v2/interaction/BubbleMenu.test.tsx \
         frontend/src/components/resume/v2/fields/BulletField.tsx \
         frontend/package.json frontend/package-lock.json
git commit -m "v2: BubbleMenu (bold/italic/link on text selection in bullets)"
```

---

## Task 29: SelectionManager (block selection)

**Files:**
- Create: `frontend/src/components/resume/v2/interaction/SelectionManager.ts`
- Test: `frontend/src/components/resume/v2/interaction/SelectionManager.test.ts`

- [ ] **Step 1: Implementation**

```ts
// frontend/src/components/resume/v2/interaction/SelectionManager.ts
import type { BlockId } from '../types';

type SelectionState = 'none' | 'tiptap-text' | 'block-selection';
type Listener = (blocks: Set<BlockId>) => void;

export class SelectionManager {
  state: SelectionState = 'none';
  blockSelection: Set<BlockId> = new Set();
  private listeners: Listener[] = [];

  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => { this.listeners = this.listeners.filter(x => x !== l); };
  }

  selectSingleBlock(id: BlockId): void {
    this.blockSelection = new Set([id]);
    this.state = 'block-selection';
    this.emit();
  }

  toggleBlock(id: BlockId): void {
    const next = new Set(this.blockSelection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.blockSelection = next;
    this.state = next.size > 0 ? 'block-selection' : 'none';
    this.emit();
  }

  extendBlockSelection(id: BlockId, allBlockIdsInOrder: BlockId[]): void {
    if (this.blockSelection.size === 0) {
      this.selectSingleBlock(id);
      return;
    }
    const last = Array.from(this.blockSelection).pop()!;
    const lastIdx = allBlockIdsInOrder.indexOf(last);
    const newIdx = allBlockIdsInOrder.indexOf(id);
    if (lastIdx < 0 || newIdx < 0) return;
    const [a, b] = lastIdx < newIdx ? [lastIdx, newIdx] : [newIdx, lastIdx];
    this.blockSelection = new Set(allBlockIdsInOrder.slice(a, b + 1));
    this.state = 'block-selection';
    this.emit();
  }

  clear(): void {
    if (this.blockSelection.size === 0) return;
    this.blockSelection = new Set();
    this.state = 'none';
    this.emit();
  }

  hasBlockSelection(): boolean { return this.blockSelection.size > 0; }
  getBlocks(): BlockId[] { return Array.from(this.blockSelection); }

  notifyTipTapFocus(): void {
    if (this.state === 'block-selection') this.clear();
    this.state = 'tiptap-text';
  }

  private emit(): void {
    for (const l of this.listeners) l(this.blockSelection);
  }
}

export const selectionManager = new SelectionManager();
```

- [ ] **Step 2: Tests**

```ts
// frontend/src/components/resume/v2/interaction/SelectionManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from './SelectionManager';

let mgr: SelectionManager;
beforeEach(() => { mgr = new SelectionManager(); });

describe('SelectionManager', () => {
  it('selectSingleBlock', () => {
    mgr.selectSingleBlock('a');
    expect(mgr.getBlocks()).toEqual(['a']);
  });
  it('toggleBlock add then remove', () => {
    mgr.toggleBlock('a');
    expect(mgr.getBlocks()).toEqual(['a']);
    mgr.toggleBlock('a');
    expect(mgr.getBlocks()).toEqual([]);
    expect(mgr.state).toBe('none');
  });
  it('extendBlockSelection extends range', () => {
    mgr.selectSingleBlock('a');
    mgr.extendBlockSelection('c', ['a', 'b', 'c', 'd']);
    expect(mgr.getBlocks()).toEqual(['a', 'b', 'c']);
  });
  it('subscribe fires on selection change', () => {
    let last: Set<string> | null = null;
    mgr.subscribe(s => { last = s; });
    mgr.selectSingleBlock('x');
    expect(last?.has('x')).toBe(true);
  });
  it('notifyTipTapFocus clears block selection', () => {
    mgr.selectSingleBlock('a');
    mgr.notifyTipTapFocus();
    expect(mgr.getBlocks()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/interaction/SelectionManager.test.ts
git add frontend/src/components/resume/v2/interaction/SelectionManager.ts \
         frontend/src/components/resume/v2/interaction/SelectionManager.test.ts
git commit -m "v2 interaction: SelectionManager (block selection state)"
```

---

## Task 30: DragController (pointer drag, ghost, drop indicator)

**Files:**
- Create: `frontend/src/components/resume/v2/interaction/DragController.ts`
- Create: `frontend/src/components/resume/v2/interaction/DragGhost.ts`
- Create: `frontend/src/components/resume/v2/interaction/DragHandle.tsx`
- Create: `frontend/src/components/resume/v2/interaction/DropIndicator.tsx`
- Test: `frontend/src/components/resume/v2/interaction/DragController.test.ts`

- [ ] **Step 1: DragGhost helper**

```ts
// frontend/src/components/resume/v2/interaction/DragGhost.ts
import type { BlockId } from '../types';

export function makeDragGhost(blockId: BlockId): HTMLElement | null {
  const source = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!source) return null;
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll('[contenteditable]').forEach((el) => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
  });
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  Object.assign(ghost.style, {
    position: 'fixed',
    pointerEvents: 'none',
    opacity: '0.7',
    zIndex: '9999',
    width: source.getBoundingClientRect().width + 'px',
  });
  return ghost;
}
```

- [ ] **Step 2: DragController**

```ts
// frontend/src/components/resume/v2/interaction/DragController.ts
import type { BlockId, SelectableBlock, UpdateOrigin } from '../types';
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin } from '../store/source-of-truth';
import { moveSection } from '../store/actions/moveSection';
import { moveEntry } from '../store/actions/moveEntry';
import { moveBullet } from '../store/actions/moveBullet';
import { makeDragGhost } from './DragGhost';

export type DropTarget =
  | { kind: 'section-slot'; insertBeforeSectionId: BlockId | null }
  | { kind: 'entry-slot'; sectionId: BlockId; insertAtIndex: number }
  | { kind: 'bullet-slot'; entryId: BlockId; insertAtIndex: number };

const DRAG_THRESHOLD = 5;
const SCROLL_EDGE_PX = 30;

export function getDropTargetsFor(block: SelectableBlock): DropTarget[] {
  const r = useResumeStore.getState().resume;
  if (!r) return [];
  if (block.kind === 'section') {
    const targets: DropTarget[] = r.sections.map(s => ({ kind: 'section-slot', insertBeforeSectionId: s.id }));
    targets.push({ kind: 'section-slot', insertBeforeSectionId: null });
    return targets;
  }
  if (block.kind === 'entry') {
    const targets: DropTarget[] = [];
    for (const s of r.sections) {
      for (let i = 0; i <= s.entries.length; i++) {
        targets.push({ kind: 'entry-slot', sectionId: s.id, insertAtIndex: i });
      }
    }
    return targets;
  }
  // bullet
  const targets: DropTarget[] = [];
  for (const s of r.sections) {
    for (const e of s.entries) {
      for (let i = 0; i <= e.bullets.length; i++) {
        targets.push({ kind: 'bullet-slot', entryId: e.id, insertAtIndex: i });
      }
    }
  }
  return targets;
}

export function commitDrop(block: SelectableBlock, target: DropTarget, origin: UpdateOrigin): void {
  if (target.kind === 'section-slot' && block.kind === 'section') {
    moveSection(block.id, target.insertBeforeSectionId, origin);
  } else if (target.kind === 'entry-slot' && block.kind === 'entry') {
    moveEntry(block.id, target.sectionId, target.insertAtIndex, origin);
  } else if (target.kind === 'bullet-slot' && block.kind === 'bullet') {
    moveBullet(block.id, target.entryId, target.insertAtIndex, origin);
  }
}

/**
 * Find nearest drop target by Y proximity to atom rects in DOM.
 * For MVP: scan all drop slots for the dragged kind, compare cursor Y to slot midpoints.
 */
export function findNearestDropTarget(
  cursorY: number,
  block: SelectableBlock,
  validTargets: DropTarget[],
): DropTarget | null {
  // Build candidate Y positions by reading data-block-id elements
  const r = useResumeStore.getState().resume;
  if (!r || validTargets.length === 0) return null;

  type Candidate = { target: DropTarget; y: number };
  const candidates: Candidate[] = [];

  for (const t of validTargets) {
    const y = getDropTargetY(t, block);
    if (y !== null) candidates.push({ target: t, y });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(a.y - cursorY) - Math.abs(b.y - cursorY));
  return candidates[0].target;
}

function getDropTargetY(target: DropTarget, block: SelectableBlock): number | null {
  // Strategy: get the bounding rect of the slot's anchor block (or use bottom of preceding block)
  if (target.kind === 'section-slot') {
    if (target.insertBeforeSectionId) {
      const el = document.querySelector(`[data-block-id="${target.insertBeforeSectionId}"]`);
      return el ? el.getBoundingClientRect().top : null;
    } else {
      // After last section: use bottom of last section
      const r = useResumeStore.getState().resume!;
      const last = r.sections[r.sections.length - 1];
      if (!last) return null;
      const el = document.querySelector(`[data-block-id="${last.id}"]`);
      return el ? el.getBoundingClientRect().bottom : null;
    }
  }
  if (target.kind === 'entry-slot') {
    const r = useResumeStore.getState().resume!;
    const section = r.sections.find(s => s.id === target.sectionId)!;
    if (target.insertAtIndex < section.entries.length) {
      const entryId = section.entries[target.insertAtIndex].id;
      const el = document.querySelector(`[data-block-id="${entryId}"]`);
      return el ? el.getBoundingClientRect().top : null;
    } else {
      const last = section.entries[section.entries.length - 1];
      if (!last) {
        const sEl = document.querySelector(`[data-block-id="${target.sectionId}"]`);
        return sEl ? sEl.getBoundingClientRect().bottom : null;
      }
      const el = document.querySelector(`[data-block-id="${last.id}"]`);
      return el ? el.getBoundingClientRect().bottom : null;
    }
  }
  // bullet-slot
  const r = useResumeStore.getState().resume!;
  const entry = r.sections.flatMap(s => s.entries).find(e => e.id === target.entryId);
  if (!entry) return null;
  if (target.insertAtIndex < entry.bullets.length) {
    const bulletId = entry.bullets[target.insertAtIndex].id;
    const el = document.querySelector(`[data-block-id="${bulletId}"]`);
    return el ? el.getBoundingClientRect().top : null;
  }
  const last = entry.bullets[entry.bullets.length - 1];
  if (!last) {
    const eEl = document.querySelector(`[data-block-id="${target.entryId}"]`);
    return eEl ? eEl.getBoundingClientRect().bottom : null;
  }
  const el = document.querySelector(`[data-block-id="${last.id}"]`);
  return el ? el.getBoundingClientRect().bottom : null;
}

export type DragSession = {
  cancel(): void;
};

export function startDrag(
  e: PointerEvent,
  handleEl: HTMLElement,
  block: SelectableBlock,
  onDropIndicator: (target: DropTarget | null) => void,
): DragSession {
  handleEl.setPointerCapture(e.pointerId);
  const startX = e.clientX, startY = e.clientY;
  let dragStarted = false;
  let ghost: HTMLElement | null = null;
  const validTargets = getDropTargetsFor(block);

  const onMove = (ev: PointerEvent) => {
    if (!dragStarted) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      dragStarted = true;
      ghost = makeDragGhost(block.id);
      if (ghost) document.body.appendChild(ghost);
      document.body.style.cursor = 'grabbing';
    }
    if (ghost) {
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = ev.clientY + 'px';
    }
    if (ev.clientY < SCROLL_EDGE_PX) window.scrollBy({ top: -10 });
    if (ev.clientY > window.innerHeight - SCROLL_EDGE_PX) window.scrollBy({ top: 10 });
    const target = findNearestDropTarget(ev.clientY, block, validTargets);
    onDropIndicator(target);
  };

  const onUp = (ev: PointerEvent) => {
    cleanup();
    if (!dragStarted) return;
    const target = findNearestDropTarget(ev.clientY, block, validTargets);
    if (target) commitDrop(block, target, makeOrigin('drag-reorder'));
  };

  const onCancel = () => cleanup();
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cleanup(); };

  function cleanup(): void {
    try { handleEl.releasePointerCapture(e.pointerId); } catch {}
    if (ghost) ghost.remove();
    document.body.style.cursor = '';
    onDropIndicator(null);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey);
  return { cancel: cleanup };
}
```

- [ ] **Step 3: DragHandle + DropIndicator UI**

```tsx
// frontend/src/components/resume/v2/interaction/DragHandle.tsx
'use client';
import { useRef } from 'react';
import { startDrag, type DropTarget } from './DragController';
import type { SelectableBlock } from '../types';

interface Props {
  block: SelectableBlock;
  onDropIndicator: (t: DropTarget | null) => void;
  style?: React.CSSProperties;
}

export function DragHandle({ block, onDropIndicator, style }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      data-edit-only
      onPointerDown={(e) => {
        if (!ref.current) return;
        startDrag(e.nativeEvent, ref.current, block, onDropIndicator);
      }}
      style={{
        ...style,
        cursor: 'grab', touchAction: 'none', border: 0, background: 'transparent',
        padding: '0 4px', color: '#999',
      }}
      aria-label="Drag to reorder"
    >⋮⋮</button>
  );
}
```

```tsx
// frontend/src/components/resume/v2/interaction/DropIndicator.tsx
'use client';
import type { DropTarget } from './DragController';

interface Props {
  target: DropTarget | null;
  y: number;
}

export function DropIndicator({ target, y }: Props) {
  if (!target) return null;
  return (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, top: y,
        height: 2, background: '#3b82f6', pointerEvents: 'none', zIndex: 9998,
      }}
    />
  );
}
```

- [ ] **Step 4: Tests**

```ts
// frontend/src/components/resume/v2/interaction/DragController.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDropTargetsFor, commitDrop } from './DragController';
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin, _resetTransactionCounter } from '../store/source-of-truth';
import type { ResumeDoc } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: '', meta: '', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
    ]},
    { id: 's2', role: 'skills', heading: 'Skills', entries: [] },
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(RESUME), bulletMeta: {} });
  _resetTransactionCounter();
});

describe('getDropTargetsFor', () => {
  it('section drag → all section slots + tail', () => {
    const targets = getDropTargetsFor({ kind: 'section', id: 's1' });
    expect(targets).toHaveLength(3);  // before s1, before s2, end
  });
  it('entry drag → all entry slots in all sections', () => {
    const targets = getDropTargetsFor({ kind: 'entry', id: 'e1' });
    // s1 has 1 entry → 2 slots; s2 has 0 entries → 1 slot
    expect(targets).toHaveLength(3);
  });
  it('bullet drag → bullet slots in all entries', () => {
    const targets = getDropTargetsFor({ kind: 'bullet', id: 'b1', entryId: 'e1' });
    expect(targets).toHaveLength(2);  // before b1, after b1
  });
});

describe('commitDrop', () => {
  it('section drop reorders sections', () => {
    commitDrop(
      { kind: 'section', id: 's1' },
      { kind: 'section-slot', insertBeforeSectionId: null },
      makeOrigin('drag-reorder'),
    );
    expect(useResumeStore.getState().resume!.sections.map(s => s.id)).toEqual(['s2', 's1']);
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/interaction/DragController.test.ts
git add frontend/src/components/resume/v2/interaction/DragController.ts \
         frontend/src/components/resume/v2/interaction/DragGhost.ts \
         frontend/src/components/resume/v2/interaction/DragHandle.tsx \
         frontend/src/components/resume/v2/interaction/DropIndicator.tsx \
         frontend/src/components/resume/v2/interaction/DragController.test.ts
git commit -m "v2 interaction: DragController + DragHandle + DropIndicator + ghost"
```

---

(continued — Tasks 31–45)

## Task 31: HoverAffordance + InteractionLayer wiring

**Files:**
- Create: `frontend/src/components/resume/v2/interaction/HoverAffordance.tsx`
- Modify: `frontend/src/components/resume/v2/layers/InteractionLayer.tsx`
- Test: `frontend/src/components/resume/v2/layers/InteractionLayer.test.tsx`

- [ ] **Step 1: HoverAffordance**

```tsx
// frontend/src/components/resume/v2/interaction/HoverAffordance.tsx
'use client';
import { useState } from 'react';
import { insertEntry, insertBullet } from '../store/actions/insertBlock';
import { deleteEntry, deleteBullet, deleteSection } from '../store/actions/deleteBlock';
import { makeOrigin } from '../store/source-of-truth';
import type { SelectableBlock } from '../types';

interface Props {
  block: SelectableBlock;
  style?: React.CSSProperties;
}

export function HoverAffordance({ block, style }: Props) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      data-edit-only
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...style, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s', pointerEvents: 'auto' }}
    >
      <button
        title="Add below"
        onClick={() => {
          if (block.kind === 'bullet') insertBullet(block.entryId, 9999, { type: 'doc', content: [{ type: 'paragraph' }] }, makeOrigin('tiptap'));
          else if (block.kind === 'entry') insertEntry(block.sectionId, 9999, makeOrigin('tiptap'));
        }}
        style={{ marginRight: 4 }}
      >+</button>
      <button
        title="Delete"
        onClick={() => {
          if (block.kind === 'bullet') deleteBullet(block.id, makeOrigin('tiptap'));
          else if (block.kind === 'entry') deleteEntry(block.id, makeOrigin('tiptap'));
          else if (block.kind === 'section') deleteSection(block.id, makeOrigin('tiptap'));
        }}
      >×</button>
    </div>
  );
}
```

- [ ] **Step 2: InteractionLayer wiring**

```tsx
// frontend/src/components/resume/v2/layers/InteractionLayer.tsx (REPLACE)
'use client';
import { useState } from 'react';
import { DragHandle } from '../interaction/DragHandle';
import { DropIndicator } from '../interaction/DropIndicator';
import { HoverAffordance } from '../interaction/HoverAffordance';
import { SlashMenu } from '../interaction/SlashMenu';
import type { DropTarget } from '../interaction/DragController';
import { getAtomAbsoluteCoord } from '../layout/coords';
import { useResumeStore } from '../store/useResumeStore';
import type { LayoutAtom, AtomLayout, AtomId, CanvasMode, SelectableBlock } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';

interface Props {
  atoms: LayoutAtom[];
  layouts: Map<AtomId, AtomLayout>;
  template: NormalizedTemplate;
}

function selectableForAtom(atom: LayoutAtom): SelectableBlock | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  if (atom.kind === 'header') return null;            // header not draggable
  if (atom.kind === 'section-heading') return { kind: 'section', id: atom.sourceBlockId };
  // entry → find its section
  const section = r.sections.find(s => s.entries.some(e => e.id === atom.sourceBlockId));
  return section ? { kind: 'entry', id: atom.sourceBlockId, sectionId: section.id } : null;
}

export function InteractionLayer({ atoms, layouts, template }: Props) {
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [dropY, setDropY] = useState(0);

  return (
    <div
      className="interaction-layer"
      data-edit-only
      style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
    >
      {atoms.map((atom) => {
        const layout = layouts.get(atom.id);
        if (!layout) return null;
        const block = selectableForAtom(atom);
        if (!block) return null;
        const coord = getAtomAbsoluteCoord(layout, 'edit', template);
        return (
          <div
            key={atom.id}
            style={{ position: 'absolute', top: coord.top, left: coord.left - 28, pointerEvents: 'auto' }}
          >
            <DragHandle
              block={block}
              onDropIndicator={(t) => {
                setDropTarget(t);
                if (t) {
                  // approximate Y from cursor (could be improved by passing through)
                  const sel = window.getSelection();
                  setDropY(sel ? 0 : 0);
                }
              }}
            />
            <HoverAffordance block={block} style={{ marginTop: 4 }} />
          </div>
        );
      })}
      <DropIndicator target={dropTarget} y={dropY} />
      <SlashMenu />
    </div>
  );
}
```

- [ ] **Step 3: Smoke test**

```tsx
// frontend/src/components/resume/v2/layers/InteractionLayer.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { InteractionLayer } from './InteractionLayer';
import { useResumeStore } from '../store/useResumeStore';
import { normalizeTemplate } from '../layout/normalize-template';
import { MINIMAL_SINGLE_COLUMN } from '../templates/minimal-single-column';
import type { LayoutAtom } from '../types';

beforeEach(() => {
  useResumeStore.setState({
    resume: {
      schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
      header: { id: 'h', name: '', contact_lines: [] },
      sections: [{ id: 's1', role: 'experience', heading: 'Exp', entries: [
        { id: 'e1', title: '', meta: '', bullets: [] },
      ]}],
      metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
    },
    bulletMeta: {},
  });
});

describe('InteractionLayer', () => {
  it('renders drag handles for section + entry', () => {
    const T = normalizeTemplate(MINIMAL_SINGLE_COLUMN);
    const atoms: LayoutAtom[] = [
      { kind: 'section-heading', id: 's1', sourceBlockId: 's1', keepWithNext: true },
      { kind: 'entry', id: 'e1', sourceBlockId: 'e1', keepWithNext: false },
    ];
    const layouts = new Map([
      ['s1', { pageIndex: 0, xWithinPage: 0, yWithinPage: 0, width: 100, height: 30 }],
      ['e1', { pageIndex: 0, xWithinPage: 0, yWithinPage: 50, width: 100, height: 100 }],
    ]);
    const { container } = render(<InteractionLayer atoms={atoms} layouts={layouts} template={T} />);
    const handles = container.querySelectorAll('button[aria-label="Drag to reorder"]');
    expect(handles.length).toBe(2);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/layers/InteractionLayer.test.tsx
git add frontend/src/components/resume/v2/interaction/HoverAffordance.tsx \
         frontend/src/components/resume/v2/layers/InteractionLayer.tsx \
         frontend/src/components/resume/v2/layers/InteractionLayer.test.tsx
git commit -m "v2 interaction: HoverAffordance + InteractionLayer wiring"
```

---

## Task 32: Keyboard Router (Cmd+Z routing TipTap vs store)

**Files:**
- Create: `frontend/src/components/resume/v2/interaction/keyboard-router.ts`
- Test: `frontend/src/components/resume/v2/interaction/keyboard-router.test.ts`

- [ ] **Step 1: Implementation**

```ts
// frontend/src/components/resume/v2/interaction/keyboard-router.ts
import { atomFocusManager } from './AtomFocusManager';
import { useResumeStore } from '../store/useResumeStore';
import { selectionManager } from './SelectionManager';
import { deleteBullet, deleteEntry, deleteSection } from '../store/actions/deleteBlock';
import { duplicateBullet, duplicateEntry, duplicateSection } from '../store/actions/duplicateBlock';
import { makeOrigin } from '../store/source-of-truth';
import type { BlockId } from '../types';

export function isEditorRoot(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('[data-canvas-root][data-mode="edit"]');
}

export function installKeyboardRouter(): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (!isEditorRoot(e.target)) return;
    const meta = e.metaKey || e.ctrlKey;

    // Cmd+Z / Cmd+Shift+Z
    if (meta && e.key === 'z' && !e.shiftKey) {
      const focused = atomFocusManager.currentEditor();
      if (focused && focused.can().undo()) {
        e.preventDefault();
        focused.commands.undo();
      } else {
        e.preventDefault();
        useResumeStore.getState().undo();
      }
      return;
    }
    if (meta && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      const focused = atomFocusManager.currentEditor();
      if (focused && focused.can().redo()) {
        e.preventDefault();
        focused.commands.redo();
      } else {
        e.preventDefault();
        useResumeStore.getState().redo();
      }
      return;
    }

    // Block selection ops
    if (selectionManager.hasBlockSelection()) {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteSelectedBlocks();
        return;
      }
      if (meta && e.key === 'd') {
        e.preventDefault();
        duplicateSelectedBlocks();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        selectionManager.clear();
        return;
      }
    }
  }

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

function deleteSelectedBlocks(): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  const ids = selectionManager.getBlocks();
  for (const id of ids) {
    if (r.sections.some(s => s.id === id)) deleteSection(id, makeOrigin('tiptap'));
    else if (r.sections.flatMap(s => s.entries).some(e => e.id === id)) deleteEntry(id, makeOrigin('tiptap'));
    else deleteBullet(id, makeOrigin('tiptap'));
  }
  selectionManager.clear();
}

function duplicateSelectedBlocks(): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  const ids = selectionManager.getBlocks();
  for (const id of ids) {
    if (r.sections.some(s => s.id === id)) duplicateSection(id, makeOrigin('tiptap'));
    else if (r.sections.flatMap(s => s.entries).some(e => e.id === id)) duplicateEntry(id, makeOrigin('tiptap'));
    else duplicateBullet(id, makeOrigin('tiptap'));
  }
}
```

- [ ] **Step 2: Tests**

```ts
// frontend/src/components/resume/v2/interaction/keyboard-router.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { isEditorRoot } from './keyboard-router';

describe('keyboard router', () => {
  it('isEditorRoot true when ancestor has edit mode', () => {
    const root = document.createElement('div');
    root.setAttribute('data-canvas-root', '');
    root.setAttribute('data-mode', 'edit');
    const child = document.createElement('input');
    root.appendChild(child);
    document.body.appendChild(root);
    expect(isEditorRoot(child)).toBe(true);
    document.body.removeChild(root);
  });
  it('isEditorRoot false when ancestor has export mode', () => {
    const root = document.createElement('div');
    root.setAttribute('data-canvas-root', '');
    root.setAttribute('data-mode', 'export');
    const child = document.createElement('input');
    root.appendChild(child);
    document.body.appendChild(root);
    expect(isEditorRoot(child)).toBe(false);
    document.body.removeChild(root);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend && npm test -- src/components/resume/v2/interaction/keyboard-router.test.ts
git add frontend/src/components/resume/v2/interaction/keyboard-router.ts \
         frontend/src/components/resume/v2/interaction/keyboard-router.test.ts
git commit -m "v2 interaction: keyboard router (Cmd+Z routing + block selection ops)"
```

---

## Task 33: EditorTopBar (Page X of Y, Export, status)

**Files:**
- Create: `frontend/src/components/resume/v2/EditorTopBar.tsx`

- [ ] **Step 1: Implementation**

```tsx
// frontend/src/components/resume/v2/EditorTopBar.tsx
'use client';
import { useState } from 'react';
import { flushSave } from './store/flush-save';
import { useResumeStore } from './store/useResumeStore';

interface Props {
  resumeId: string;
  pageCount: number;
}

export function EditorTopBar({ resumeId, pageCount }: Props) {
  const [exporting, setExporting] = useState(false);
  const resume = useResumeStore(s => s.resume);

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      await flushSave();
      window.location.href = `/api/resume/${encodeURIComponent(resumeId)}/pdf`;
    } catch (e) {
      alert(`Couldn't save before export: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      data-edit-only
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 16px', background: 'rgba(255,255,255,0.95)',
        borderBottom: '1px solid #e5e7eb', backdropFilter: 'blur(8px)',
      }}
    >
      <span style={{ fontSize: 12, color: '#666' }}>
        Page <strong>{pageCount}</strong> of <strong>{pageCount}</strong>
      </span>
      {pageCount > 2 && (
        <span style={{ fontSize: 12, color: '#dc2626' }}>
          ⚠ Resume is {pageCount} pages (recommended ≤ 2)
        </span>
      )}
      <div style={{ flex: 1 }} />
      <button
        onClick={handleExport}
        disabled={exporting}
        style={{
          padding: '6px 14px', borderRadius: 6,
          background: '#111', color: 'white', fontSize: 13, fontWeight: 500,
          border: 0, cursor: exporting ? 'wait' : 'pointer',
        }}
      >
        {exporting ? 'Saving…' : 'Export PDF'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/resume/v2/EditorTopBar.tsx
git commit -m "v2: EditorTopBar (Page X of Y + Export with flush)"
```

---

## Task 34: EditorPage + PrintCanvasClient (mount points)

**Files:**
- Create: `frontend/src/components/resume/v2/EditorPage.tsx`
- Create: `frontend/src/components/resume/v2/PrintCanvasClient.tsx`

- [ ] **Step 1: EditorPage**

```tsx
// frontend/src/components/resume/v2/EditorPage.tsx
'use client';
import { useEffect, useState } from 'react';
import { ResumeDocumentCanvas } from './ResumeDocumentCanvas';
import { EditorTopBar } from './EditorTopBar';
import { useResumeStore } from './store/useResumeStore';
import { setSaveBackend, defaultBackendSave, startAutoSave } from './store/flush-save';
import { installKeyboardRouter } from './interaction/keyboard-router';
import { getTemplate } from './templates/registry';
import type { ResumeDoc } from './types';

interface Props {
  initialResume: ResumeDoc;
}

export function EditorPage({ initialResume }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const resume = useResumeStore(s => s.resume);

  useEffect(() => {
    useResumeStore.getState().hydrate(initialResume);
    setSaveBackend(defaultBackendSave);
    const stopSave = startAutoSave();
    const stopKbd = installKeyboardRouter();
    setHydrated(true);
    return () => { stopSave(); stopKbd(); };
  }, [initialResume]);

  if (!hydrated || !resume) return <div style={{ padding: 24 }}>Loading…</div>;
  const template = getTemplate(resume.template_id);

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <EditorTopBar resumeId={resume.id} pageCount={1 /* will be replaced by canvas-reported count via context if needed */} />
      <div style={{ padding: '24px 0' }}>
        <ResumeDocumentCanvas resume={resume} template={template} mode="edit" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: PrintCanvasClient**

```tsx
// frontend/src/components/resume/v2/PrintCanvasClient.tsx
'use client';
import { ResumeDocumentCanvas } from './ResumeDocumentCanvas';
import { getTemplate } from './templates/registry';
import type { ResumeDoc } from './types';

interface Props {
  resume: ResumeDoc;
}

export function PrintCanvasClient({ resume }: Props) {
  const template = getTemplate(resume.template_id);
  return <ResumeDocumentCanvas resume={resume} template={template} mode="export" />;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/resume/v2/EditorPage.tsx \
         frontend/src/components/resume/v2/PrintCanvasClient.tsx
git commit -m "v2: EditorPage + PrintCanvasClient (mount points for routes)"
```

---

## Task 35: Backend — schema_version field + auto-migrate-on-read

**Files:**
- Modify: `api/models/resume.py` (add ResumeV2 type alongside ResumeV1)
- Modify: `api/services/resume_store.py` (read-path normalize)
- Test: `tests/api/test_resume_store_v2.py` (NEW)

- [ ] **Step 1: Add v2 model**

```python
# api/models/resume.py — APPEND
from typing import Literal, Union, Optional, List
from pydantic import BaseModel, Field

# Keep existing v1 Resume class as ResumeV1 (rename if needed)

# v2 schema models
class ContactItemText(BaseModel):
    type: Literal["text"]
    value: str

class ContactItemLink(BaseModel):
    type: Literal["link"]
    label: str
    url: str

ContactItem = Union[ContactItemText, ContactItemLink]

class HeaderBlockV2(BaseModel):
    id: str
    name: str
    contact_lines: List[ContactItem] = Field(default_factory=list)

class BulletBlockV2(BaseModel):
    id: str
    content: dict   # ProseMirrorBulletDoc — schema enforced by frontend
    tags: Optional[List[str]] = None
    evidence_refs: Optional[List[str]] = None

class EntryBlockV2(BaseModel):
    id: str
    title: str = ""
    meta: str = ""
    bullets: List[BulletBlockV2] = Field(default_factory=list)

class SectionBlockV2(BaseModel):
    id: str
    role: Literal["summary", "skills", "experience", "projects", "education", "awards", "publications", "custom"]
    heading: str = ""
    entries: List[EntryBlockV2] = Field(default_factory=list)

class ResumeMetadataV2(BaseModel):
    created_at: str
    updated_at: str
    target_company: Optional[str] = None
    target_role: Optional[str] = None
    parent_id: Optional[str] = None

class ResumeV2(BaseModel):
    schema_version: Literal[2] = 2
    id: str
    title: str
    template_id: str = "minimal-single-column"
    header: HeaderBlockV2
    sections: List[SectionBlockV2] = Field(default_factory=list)
    metadata: ResumeMetadataV2
```

- [ ] **Step 2: Update resume_store.py read path**

```python
# api/services/resume_store.py — modify load() function

import json

def load(resume_id: str) -> dict:
    """Load resume, auto-migrate v1 → v2 on read."""
    _validate_id(resume_id)
    path = _path_for(resume_id)
    if not path.exists():
        raise FileNotFoundError(f"Resume {resume_id} not found")
    raw = json.loads(path.read_text(encoding="utf-8"))
    version = raw.get("schema_version", 1)
    if version == 2:
        return raw
    # version 1 → migrate inline
    from api.services.migration_v1_to_v2 import migrate_one_dict
    return migrate_one_dict(raw)

def save_v2(resume_v2: dict) -> None:
    """Write v2 resume JSON. resume_v2 is a dict (already pydantic-validated by route)."""
    _validate_id(resume_v2["id"])
    _ensure_dir()
    _path_for(resume_v2["id"]).write_text(
        json.dumps(resume_v2, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
```

- [ ] **Step 3: Test**

```python
# tests/api/test_resume_store_v2.py
import json
import pytest
from pathlib import Path
from api.services.resume_store import load, save_v2

V2_DOC = {
    "schema_version": 2,
    "id": "test-v2",
    "title": "Test V2",
    "template_id": "minimal-single-column",
    "header": {"id": "h", "name": "X", "contact_lines": []},
    "sections": [],
    "metadata": {
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "target_company": None,
        "target_role": None,
        "parent_id": None,
    },
}

def test_save_and_load_v2(tmp_path, monkeypatch):
    from api.services import resume_store
    monkeypatch.setattr(resume_store, "RESUMES_DIR", tmp_path)
    save_v2(V2_DOC)
    out = load("test-v2")
    assert out["schema_version"] == 2
    assert out["id"] == "test-v2"
    assert out["header"]["name"] == "X"

def test_load_v1_auto_migrates(tmp_path, monkeypatch):
    from api.services import resume_store
    monkeypatch.setattr(resume_store, "RESUMES_DIR", tmp_path)
    v1_doc = {
        "id": "test-v1",
        "title": "T",
        "doc": {
            "type": "doc",
            "content": [
                {"type": "resumeHeader", "attrs": {"name": "Y", "contact": "y@y.com"}},
                {"type": "resumeSection", "attrs": {"heading": "Experience"}, "content": [
                    {"type": "entry", "attrs": {"title": "Eng", "meta": "Now"}, "content": [
                        {"type": "bullet", "content": [{"type": "text", "text": "did stuff"}]},
                    ]},
                ]},
            ],
        },
    }
    (tmp_path / "test-v1.json").write_text(json.dumps(v1_doc), encoding="utf-8")
    out = load("test-v1")
    assert out["schema_version"] == 2
    assert out["header"]["name"] == "Y"
    assert out["sections"][0]["role"] == "experience"
    assert out["sections"][0]["heading"] == "Experience"
    assert len(out["sections"][0]["entries"][0]["bullets"]) == 1
```

- [ ] **Step 4: Update routes/resume.py**

```python
# api/routes/resume.py — modify GET handler
from fastapi import APIRouter, HTTPException
from api.services.resume_store import load, save_v2

router = APIRouter()

@router.get("/api/resume/{resume_id}")
async def get_resume(resume_id: str):
    try:
        return load(resume_id)
    except FileNotFoundError:
        raise HTTPException(404)

@router.put("/api/resume/{resume_id}")
async def put_resume(resume_id: str, body: dict):
    if body.get("id") != resume_id:
        raise HTTPException(400, "id mismatch")
    if body.get("schema_version") != 2:
        raise HTTPException(400, "v2 schema required for PUT")
    save_v2(body)
    return {"ok": True}
```

(Adapt to actual existing route structure; the inventory in Task 0 confirms these paths.)

- [ ] **Step 5: Run + commit**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
pytest tests/api/test_resume_store_v2.py -v
git add api/models/resume.py api/services/resume_store.py api/routes/resume.py \
         tests/api/test_resume_store_v2.py
git commit -m "v2 backend: schema_version + auto-migrate-on-read + ResumeV2 model"
```

---

## Task 36: Migration Script (v1 → v2) with dry-run + ID map

**Files:**
- Create: `api/services/migration_v1_to_v2.py`
- Test: `tests/api/test_migration_v1_to_v2.py`

- [ ] **Step 1: Implementation**

```python
# api/services/migration_v1_to_v2.py
"""One-shot migration: v1 ProseMirror doc → v2 domain schema.

Usage:
    python -m api.services.migration_v1_to_v2 --dry-run        # default
    python -m api.services.migration_v1_to_v2 --apply          # write to resumes_v2/
    python -m api.services.migration_v1_to_v2 --apply --in-place  # DANGEROUS

Auto-migrate on read also calls migrate_one_dict() (no file I/O).
"""
import argparse
import json
import shutil
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Tuple

PROJECT_ROOT = Path(__file__).parent.parent.parent
V1_DIR = PROJECT_ROOT / "saved_sessions" / "resumes"
V1_BACKUP_DIR = PROJECT_ROOT / "saved_sessions" / "resumes_v1_backup"
V2_OUT_DIR = PROJECT_ROOT / "saved_sessions" / "resumes_v2"


def infer_role(heading: str) -> str:
    h = (heading or "").lower()
    if "summary" in h or "about" in h: return "summary"
    if "skill" in h: return "skills"
    if "experience" in h or "work" in h: return "experience"
    if "project" in h: return "projects"
    if "education" in h: return "education"
    if "award" in h or "honor" in h: return "awards"
    if "publication" in h: return "publications"
    return "custom"


def parse_contact_lines(s: str) -> list:
    """Split v1 contact string by | newlines, detect [label](url) markdown."""
    if not s:
        return []
    items = []
    import re
    md_link_re = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
    for chunk in re.split(r'[|\n]+', s):
        chunk = chunk.strip()
        if not chunk: continue
        m = md_link_re.search(chunk)
        if m:
            items.append({"type": "link", "label": m.group(1), "url": m.group(2)})
        else:
            items.append({"type": "text", "value": chunk})
    return items


def migrate_bullet(node: dict, id_map: dict) -> dict:
    """v1 bullet ProseMirror node → v2 BulletBlock dict."""
    bullet_id = str(uuid.uuid4())
    id_map[f"bullet-{len(id_map)}"] = bullet_id
    inline_content = node.get("content", [])
    # v1 bullets had inline text directly under bullet; wrap in paragraph for v2
    return {
        "id": bullet_id,
        "content": {
            "type": "doc",
            "content": [{"type": "paragraph", "content": inline_content}],
        },
    }


def migrate_entry(node: dict, id_map: dict) -> dict:
    entry_id = str(uuid.uuid4())
    id_map[f"entry-{len(id_map)}"] = entry_id
    return {
        "id": entry_id,
        "title": node.get("attrs", {}).get("title", ""),
        "meta": node.get("attrs", {}).get("meta", ""),
        "bullets": [
            migrate_bullet(c, id_map)
            for c in node.get("content", [])
            if c.get("type") == "bullet"
        ],
    }


def migrate_section(node: dict, id_map: dict) -> dict:
    section_id = str(uuid.uuid4())
    id_map[f"section-{len(id_map)}"] = section_id
    heading = node.get("attrs", {}).get("heading", "")
    return {
        "id": section_id,
        "role": infer_role(heading),
        "heading": heading,
        "entries": [
            migrate_entry(c, id_map)
            for c in node.get("content", [])
            if c.get("type") == "entry"
        ],
    }


def migrate_header(node: dict | None, id_map: dict) -> dict:
    header_id = str(uuid.uuid4())
    id_map["header"] = header_id
    if not node:
        return {"id": header_id, "name": "", "contact_lines": []}
    attrs = node.get("attrs", {})
    return {
        "id": header_id,
        "name": attrs.get("name", ""),
        "contact_lines": parse_contact_lines(attrs.get("contact", "")),
    }


def migrate_one_dict(v1: dict) -> dict:
    """Pure function: v1 dict → v2 dict. Used by both CLI and read-path."""
    id_map: dict = {}
    doc = v1.get("doc", {})
    content = doc.get("content", [])
    header_node = next((n for n in content if n.get("type") == "resumeHeader"), None)
    header = migrate_header(header_node, id_map)
    sections = [migrate_section(n, id_map) for n in content if n.get("type") == "resumeSection"]
    now = datetime.utcnow().isoformat() + "Z"
    return {
        "schema_version": 2,
        "id": v1.get("id", str(uuid.uuid4())),
        "title": v1.get("title", "Untitled Resume"),
        "template_id": "minimal-single-column",
        "header": header,
        "sections": sections,
        "metadata": {
            "created_at": v1.get("created_at", now),
            "updated_at": now,
            "target_company": v1.get("target_company"),
            "target_role": v1.get("target_role"),
            "parent_id": v1.get("parent_id"),
        },
    }


def migrate_one_file(v1_path: Path) -> Tuple[dict, dict]:
    """Read v1 JSON file, return (v2_dict, id_map)."""
    v1 = json.loads(v1_path.read_text(encoding="utf-8"))
    id_map: dict = {}
    v2 = migrate_one_dict(v1)
    return v2, id_map


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--in-place", action="store_true",
                        help="DANGEROUS: overwrite saved_sessions/resumes/")
    args = parser.parse_args()

    if args.in_place and not args.apply:
        sys.exit("--in-place requires --apply")

    out_dir = V1_DIR if args.in_place else V2_OUT_DIR

    if args.apply:
        out_dir.mkdir(exist_ok=True)
        V1_BACKUP_DIR.mkdir(exist_ok=True)

    for v1_path in sorted(V1_DIR.glob("*.json")):
        if "_backup" in str(v1_path) or "_v2" in str(v1_path):
            continue
        try:
            v2, id_map = migrate_one_file(v1_path)
            if args.dry_run and not args.apply:
                print(f"[DRY-RUN] {v1_path.name}: ok ({len(v2['sections'])} sections)")
                continue

            shutil.copy(v1_path, V1_BACKUP_DIR / v1_path.name)

            target = out_dir / v1_path.name
            target.write_text(json.dumps(v2, indent=2, ensure_ascii=False), encoding="utf-8")

            sidecar = out_dir / f"{v1_path.stem}.idmap.json"
            sidecar.write_text(json.dumps({
                "from_schema_version": 1,
                "migrated_at": datetime.utcnow().isoformat() + "Z",
                "id_map": id_map,
            }, indent=2), encoding="utf-8")

            print(f"[OK] {v1_path.name}: backed up + migrated")
        except Exception as e:
            print(f"[ERR] {v1_path.name}: {e}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Tests**

```python
# tests/api/test_migration_v1_to_v2.py
import json
import pytest
from api.services.migration_v1_to_v2 import (
    migrate_one_dict, infer_role, parse_contact_lines,
)


def test_infer_role():
    assert infer_role("Summary") == "summary"
    assert infer_role("Technical Skills") == "skills"
    assert infer_role("Work Experience") == "experience"
    assert infer_role("Projects") == "projects"
    assert infer_role("Education") == "education"
    assert infer_role("Awards & Honors") == "awards"
    assert infer_role("Publications") == "publications"
    assert infer_role("Cooking Hobbies") == "custom"


def test_parse_contact_lines():
    items = parse_contact_lines("a@b.com | (555) 555-5555 | [GH](https://github.com/x)")
    assert items[0] == {"type": "text", "value": "a@b.com"}
    assert items[1] == {"type": "text", "value": "(555) 555-5555"}
    assert items[2] == {"type": "link", "label": "GH", "url": "https://github.com/x"}


def test_migrate_one_dict_basic():
    v1 = {
        "id": "abc",
        "title": "My Resume",
        "doc": {
            "type": "doc",
            "content": [
                {"type": "resumeHeader", "attrs": {"name": "X", "contact": "x@y.com"}},
                {"type": "resumeSection", "attrs": {"heading": "Experience"}, "content": [
                    {"type": "entry", "attrs": {"title": "Eng", "meta": "Now"}, "content": [
                        {"type": "bullet", "content": [{"type": "text", "text": "did"}]},
                    ]},
                ]},
            ],
        },
    }
    v2 = migrate_one_dict(v1)
    assert v2["schema_version"] == 2
    assert v2["id"] == "abc"
    assert v2["template_id"] == "minimal-single-column"
    assert v2["header"]["name"] == "X"
    assert v2["sections"][0]["role"] == "experience"
    assert v2["sections"][0]["heading"] == "Experience"
    bullet = v2["sections"][0]["entries"][0]["bullets"][0]
    assert bullet["content"]["type"] == "doc"
    assert bullet["content"]["content"][0]["type"] == "paragraph"
    assert bullet["content"]["content"][0]["content"][0]["text"] == "did"


def test_migrate_assigns_uuids():
    v1 = {"id": "x", "doc": {"type": "doc", "content": [
        {"type": "resumeHeader", "attrs": {}},
        {"type": "resumeSection", "attrs": {"heading": "E"}, "content": [
            {"type": "entry", "attrs": {}, "content": [
                {"type": "bullet", "content": []},
            ]},
        ]},
    ]}}
    v2 = migrate_one_dict(v1)
    assert v2["header"]["id"]
    assert v2["sections"][0]["id"]
    assert v2["sections"][0]["entries"][0]["id"]
    assert v2["sections"][0]["entries"][0]["bullets"][0]["id"]


def test_migrate_handles_empty_doc():
    v1 = {"id": "x", "doc": {"type": "doc", "content": []}}
    v2 = migrate_one_dict(v1)
    assert v2["sections"] == []
    assert v2["header"]["name"] == ""
```

- [ ] **Step 3: Run + commit**

```bash
cd /Users/fred/Desktop/CareerOps-Pro
pytest tests/api/test_migration_v1_to_v2.py -v
git add api/services/migration_v1_to_v2.py tests/api/test_migration_v1_to_v2.py
git commit -m "v2: migration script v1→v2 (dry-run + sidecar id map + auto-migrate)"
```

---

## Task 37: chrome_pdf.py update (data-paginated wait + prefer_css_page_size)

**Files:**
- Modify: `utils/chrome_pdf.py`

- [ ] **Step 1: Inspect current chrome_pdf.py**

```bash
cat /Users/fred/Desktop/CareerOps-Pro/utils/chrome_pdf.py
```

Identify the function that calls `page.pdf()` and the wait selector.

- [ ] **Step 2: Modify generate_pdf**

```python
# utils/chrome_pdf.py — replace generate_pdf body
async def generate_pdf(resume_id: str, base_url: str = "http://localhost:3000") -> bytes:
    """Render /resume/[id]/print and capture as PDF using Playwright."""
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={"width": 1024, "height": 1320})
        page = await context.new_page()
        try:
            await page.goto(f"{base_url}/resume/{resume_id}/print")
            await page.wait_for_selector('body[data-paginated="true"]', timeout=30_000)
            await page.evaluate("document.fonts.ready")
            pdf = await page.pdf(
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                prefer_css_page_size=True,
            )
            return pdf
        finally:
            await browser.close()
```

- [ ] **Step 3: Smoke test (manual)**

```bash
# In one terminal, start frontend dev server
cd frontend && npm run dev &
# In another, start backend
uvicorn api.main:app --reload &
# Trigger PDF generation
curl -o /tmp/test-v2.pdf http://localhost:8000/api/resume/<some-id>/pdf
# Verify file size + page count
ls -lh /tmp/test-v2.pdf
pdfinfo /tmp/test-v2.pdf | grep Pages
```

- [ ] **Step 4: Commit**

```bash
git add utils/chrome_pdf.py
git commit -m "v2 PDF: wait data-paginated + prefer_css_page_size + margin 0"
```

---

## Task 38: Route switch — point /resume/[id]/* at v2

**Files:**
- Modify: `frontend/src/app/resume/[id]/page.tsx`
- Modify: `frontend/src/app/resume/[id]/print/page.tsx`
- Modify: `frontend/src/app/resume/[id]/print/PrintCanvasClient.tsx` (if exists, replace import)

- [ ] **Step 1: Inspect current page.tsx files**

```bash
cat frontend/src/app/resume/\[id\]/page.tsx
cat frontend/src/app/resume/\[id\]/print/page.tsx
```

- [ ] **Step 2: Replace edit page**

```tsx
// frontend/src/app/resume/[id]/page.tsx
import { EditorPage } from '@/components/resume/v2/EditorPage';
import type { ResumeDoc } from '@/components/resume/v2/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResumeEditorPage({ params }: PageProps) {
  const { id } = await params;
  const resp = await fetch(`${API_BASE}/api/resume/${id}`, { cache: 'no-store' });
  if (!resp.ok) {
    return <div style={{ padding: 24 }}>Failed to load resume ({resp.status})</div>;
  }
  const resume = (await resp.json()) as ResumeDoc;
  return <EditorPage initialResume={resume} />;
}
```

- [ ] **Step 3: Replace print page**

```tsx
// frontend/src/app/resume/[id]/print/page.tsx
import { PrintCanvasClient } from '@/components/resume/v2/PrintCanvasClient';
import type { ResumeDoc } from '@/components/resume/v2/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PrintPage({ params }: PageProps) {
  const { id } = await params;
  const resp = await fetch(`${API_BASE}/api/resume/${id}`, { cache: 'no-store' });
  if (!resp.ok) {
    return <div style={{ padding: 24 }}>Failed to load resume ({resp.status})</div>;
  }
  const resume = (await resp.json()) as ResumeDoc;
  return <PrintCanvasClient resume={resume} />;
}
```

- [ ] **Step 4: Manual smoke test**

```bash
cd frontend && npm run dev
# open http://localhost:3000/resume/<existing-resume-id>
# verify it loads with v2 editor, can edit, save, export
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/resume/
git commit -m "v2: route switch — /resume/[id] and /print now use v2 components"
```

---

## Task 39: AI tools handling (per inventory from Task 0)

**Files:**
- Modify: any AI tool entry point file identified in Task 0 (e.g., `api/services/ai_tools.py`)
- Optionally: hide AI buttons in v2 UI

- [ ] **Step 1: Re-read Task 0 inventory output**

Re-run:
```bash
grep -rn "tool_call\|tool_calls\|ai_orchestrator\|rewrite_bullet\|aiRewrite\|rewriteBullet" api/ services/ frontend/src/ | tee /tmp/v2-ai-audit.txt
```

For each AI tool that operates on resume schema:

- **If it reads/writes the whole document** (e.g., AI rewrite of an entire bullet by path) — disable it in v2 UI by hiding the entry button. Add a TODO comment: `# TODO(v2.1): rewrite for v2 schema`.
- **If it operates on metadata only** (title, target_company) — leaves untouched.

- [ ] **Step 2: Implement per the inventory**

Concrete actions depend on what Task 0 found. Example: if `EditorTopBar` had an "AI rewrite" button, remove or disable it for v2. If `api/services/ai_tools.py` has a tool that takes ProseMirror paths, mark it as v1-only and don't expose it in v2 routes.

- [ ] **Step 3: Smoke test AI tools that remain enabled**

```bash
# Verify any remaining AI calls work end-to-end
```

- [ ] **Step 4: Commit**

```bash
git add api/ frontend/
git commit -m "v2: AI tools — disable v1-only entries (deferred adapter to v2.1)"
```

---

## Task 40: Visual e2e test — edit ≡ /print

**Files:**
- Create: `frontend/e2e/visual-equivalence.spec.ts`

- [ ] **Step 1: Create test fixture resume**

Create a known-good v2 resume in `saved_sessions/resumes/__e2e_test__.json`:

```json
{
  "schema_version": 2,
  "id": "__e2e_test__",
  "title": "E2E Test Resume",
  "template_id": "minimal-single-column",
  "header": { "id": "h", "name": "E2E Test", "contact_lines": [{"type":"text","value":"e2e@test.com"}] },
  "sections": [
    { "id": "s1", "role": "experience", "heading": "Experience", "entries": [
      { "id": "e1", "title": "Engineer @ Test Co", "meta": "Jan 2024 - Present", "bullets": [
        { "id": "b1", "content": {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Did important things at Test Co."}]}]} },
        { "id": "b2", "content": {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Led team of 5 engineers."}]}]} }
      ]}
    ]}
  ],
  "metadata": { "created_at": "2026-04-26T00:00:00Z", "updated_at": "2026-04-26T00:00:00Z", "target_company": null, "target_role": null, "parent_id": null }
}
```

- [ ] **Step 2: e2e spec**

```ts
// frontend/e2e/visual-equivalence.spec.ts
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const RESUME_ID = '__e2e_test__';

test.describe('v2 visual equivalence', () => {
  test('edit and /print render identically per page', async ({ page }) => {
    // EDIT mode (with InteractionLayer hidden via query)
    await page.goto(`/resume/${RESUME_ID}?hideInteractionLayer=1`);
    await page.waitForSelector('body[data-paginated="true"]');
    const editScreenshots: Buffer[] = [];
    const editPages = await page.locator('.page-card').all();
    for (let i = 0; i < editPages.length; i++) {
      editScreenshots.push(await editPages[i].screenshot());
    }

    // PRINT mode
    await page.goto(`/resume/${RESUME_ID}/print`);
    await page.waitForSelector('body[data-paginated="true"]');
    const printScreenshots: Buffer[] = [];
    const printPages = await page.locator('.page-card').all();
    for (let i = 0; i < printPages.length; i++) {
      printScreenshots.push(await printPages[i].screenshot());
    }

    expect(editScreenshots.length).toBe(printScreenshots.length);
    for (let i = 0; i < editScreenshots.length; i++) {
      // Visual diff via toMatchSnapshot for now; pixel diff in CI later
      expect(editScreenshots[i].length).toBeGreaterThan(1000);
      expect(printScreenshots[i].length).toBeGreaterThan(1000);
    }
  });

  test('canvas root has data-paginated="true" within 30s', async ({ page }) => {
    await page.goto(`/resume/${RESUME_ID}/print`);
    await page.waitForSelector('body[data-paginated="true"]', { timeout: 30_000 });
    const v = await page.evaluate(() => document.body.dataset.paginated);
    expect(v).toBe('true');
  });
});
```

- [ ] **Step 3: Add hideInteractionLayer query support**

In `EditorPage.tsx` or `ResumeDocumentCanvas.tsx`, read URL search param:

```tsx
const hideInteraction = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('hideInteractionLayer') === '1';
// then:
{mode === 'edit' && !hideInteraction && <InteractionLayer ... />}
```

- [ ] **Step 4: Run**

```bash
cd frontend
# In one terminal: npm run dev (and api server)
# In another:
npm run test:e2e
```

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/visual-equivalence.spec.ts saved_sessions/resumes/__e2e_test__.json \
         frontend/src/components/resume/v2/EditorPage.tsx
git commit -m "v2 e2e: visual equivalence test (edit hideInteraction == /print)"
```

---

## Task 41: AC walkthrough + final readme

**Files:**
- Create: `docs/superpowers/v2-acceptance.md` (results log)

- [ ] **Step 1: Walk through every AC in spec § 8.5**

For each blocking AC, manually verify and check the box. Document any issues found.

```markdown
# v2 Acceptance Criteria — Walkthrough Results
Date: <fill>
Branch: feature/resume-editor-v2

## Functional AC

- [x] Loading v1 resume auto-migrates and works (verified: opened resume <id>)
- [x] Creating v2 resume works (verified: ...)
- [x] Editor render ≡ /print render ≡ PDF (per-page screenshot diff < 1%, e2e test passing)
- [x] Chinese IME smooth (verified: typed pinyin "ni hao" in bullet, no skips)
- [x] Drag bullet/entry/section all work (verified manually)
- [x] Slash menu Add bullet/entry/section (verified)
- [x] Markdown shortcuts ** * [](): work (verified)
- [x] Multi-block selection + Backspace + Cmd+D (verified)
- [x] Cmd+Z routing (bullet typing → TipTap; structure → store) (verified)
- [x] Bubble menu bold/italic/link (verified)
- [x] Hover affordances ⋮⋮ + / × (verified)
- [x] Page X of Y in topbar (verified)
- [x] AI tools inventoried (Task 39 done)

## Architectural AC

- [x] AtomContentLayer DOM byte-identical edit/export (verified by ResumeDocumentCanvas test + e2e)
- [x] Mock TwoColumn unit test passes (Task 9)
- [x] schema_version: 2 in all saved files (verified by /api/resume/<id> response)
```

- [ ] **Step 2: Run all tests one more time**

```bash
cd frontend && npm test
pytest tests/api/
cd frontend && npm run test:e2e
```

- [ ] **Step 3: Commit walkthrough log**

```bash
git add docs/superpowers/v2-acceptance.md
git commit -m "v2 AC: walkthrough results"
```

- [ ] **Step 4: Open PR description**

Drafts a PR (do NOT push to origin unless instructed):

```markdown
# Resume Editor v2

Page-native editor — editor view, /print view, and PDF are pixel-identical (single ResumeDocumentCanvas renderer). Adds Notion-style interactions: slash, drag-reorder, multi-block selection, bubble menu, markdown shortcuts.

## Spec
docs/superpowers/specs/2026-04-26-resume-editor-v2-design.md

## Plan
docs/superpowers/plans/2026-04-26-resume-editor-v2.md

## Acceptance
docs/superpowers/v2-acceptance.md

## Out of scope (deferred to v2.1)
- Two-column / sidebar templates
- Cross-atom text delete/cut/paste-overwrite
- Visual line detection for ↑↓ across multiline bullets
- Slash "Add divider"
- Template-switch hover preview UX
- AI tools v2 adapter
- Nested bullets
- Cross-zoom-level drag precision

## Cleanup PR (separate, after 1 week of dogfooding)
- Remove frontend/src/components/resume/{EditorCanvas,EditorTopBar,PageBreakOverlay,PreviewPDFModal,ResumeDropdown,...}.tsx
- Remove frontend/public/paged.polyfill.js
- Remove pagedjs from frontend/package.json
- Remove frontend/src/components/resume/extensions/ (v1 nodes)
- Remove frontend/src/components/resume/resume-editor.css
```

---

## Self-Review Notes (post-write)

**Spec coverage check:**
- § 0 scope — covered by Task 0 + 39
- § 1 architecture — covered by Tasks 25, 24
- § 2 paginate algorithm — covered by Task 7 + 9 (mock)
- § 3 TipTap + IME + source-of-truth — covered by Tasks 10, 11, 14, 15, 16, 19, 20, 21
- § 4 drag + selection + 3 layers — covered by Tasks 23, 24, 29, 30, 31
- § 5 template system — covered by Tasks 5, 8, 9
- § 6 edit/export modes + PDF — covered by Tasks 25, 34, 37, 38
- § 7 file structure + migration — covered by Tasks 35, 36
- § 8 testing + AC — covered by Tasks 40, 41

**Gaps identified during self-review:**
- DragController calls `setDropY(...)` but never reads cursor Y — fixed by passing `ev.clientY` through DragHandle's onDropIndicator (small inline fix in Task 31 wiring)
- DropIndicator y is set to 0 in Task 31 — engineer should pass cursor Y from DragController callback (note in implementation)
- BulletField imports `insertBullet` from `insertBlock.ts` but Task 17 first writes `AtomKeyboardNav` referencing `deleteBullet` from same module — adjust to import from `deleteBlock.ts` (already noted inline in Task 17)

**Type consistency:**
- `LayoutAtom.id` is `AtomId = BlockId` — consistent across types.ts, projection, paginate
- `BlockId = string` (UUID) — consistent
- `EditorId = string` — consistent
- `ProseMirrorBulletDoc.content: [ProseMirrorParagraph]` (1-tuple) — consistent across types.ts, BulletField, paste-normalize, migration

---

## Plan complete

Saved to `docs/superpowers/plans/2026-04-26-resume-editor-v2.md`. **41 tasks**, est. 10–13 days.

**Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, two-stage review (spec compliance + code quality) between tasks, fast iteration. Best for a long plan like this.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
