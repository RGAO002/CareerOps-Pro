# Resume Editor v1 — Design Spec

**Date:** 2026-04-25
**Status:** Approved direction (replaces 2026-04-20 spec for editor MVP scope)
**Owner:** CareerOps Pro frontend + backend
**Replaces:** Plans B/C/D scope from `2026-04-20-resume-editor-design.md` (kept for reference; this spec is the authoritative v1 plan)
**Related strategy doc:** `PRODUCT_NOTES.md` (especially §2 multi-agent, §3.1 经历重新框架, §4 data strategy, §13 AI panel architecture)

---

## 0. Why this spec exists

Plan A (the walking skeleton) shipped a TipTap editor at `/resume/[id]` that loads seed data, lets users edit text, and autosaves to localStorage. The editor is **not yet usable for real resumes** because it is missing: PDF import, structural operations (add/delete/reorder), real persistence, multiple-resume support, real PDF export with visual fidelity, history, and any AI editing capability.

This spec defines the v1 scope — the smallest set of features required for the editor to be **usable end-to-end on a real user's resume** — plus the technical architecture decisions (especially around PDF rendering) that the previous spec left underspecified.

It explicitly defers the "Notion-style polish" features (selection-aware bubble menus, side drawer, per-element history) to Phase 2. Those are real features that we will build, but they are not on the critical path for usability.

---

## 1. Scope

### 1.1 IN — v1 must ship

1. **PDF upload → parse → import** — user uploads a PDF, backend parses it via the existing Streamlit-era parser, content lands in the editor as a TipTap doc
2. **Structural operations** — add/delete/reorder bullets, entries, and sections; hover affordance (drag handle + button cluster) on each block
3. **Multi-page visualization** — dashed page-break lines + "Page X of Y" indicator, computed from canvas height
4. **Backend JSON persistence** — replaces localStorage with a real per-user resume store under `saved_sessions/resumes/`
5. **Multiple resumes + variants** — top-bar dropdown switches between resumes; "+ New variant from this" forks the current resume
6. **Always-visible save status** — "Saved · just now" / "Saving…" / "Offline" pill in top bar with live relative time
7. **PDF export** — `window.print()` with a polished `@media print` stylesheet (zero-conversion, guaranteed visual match)
8. **Document-level history + restore** — every save creates a doc snapshot; user can browse and restore prior snapshots
9. **AI bullet rewrite (minimal)** — per-bullet "✨ Rewrite" button → AI proposes a new version → user accepts/rejects. This is the seed for the multi-agent capability described in PRODUCT_NOTES §13 and §3.1.

### 1.2 OUT — explicitly deferred

| Feature | Defer to | Rationale |
|---|---|---|
| Selection-aware bubble menu (Notion-style) | Phase 2 | Polish, not table-stakes |
| Side drawer (per-element panel) | Phase 2 | Polish, depends on bubble menu trigger |
| Per-element version history | Phase 2 | Requires block-level stable IDs + storage redesign |
| Two-column sidebar layout | Phase 1.5 | Visual upgrade to match the existing PDF template |
| Multi-canvas page rendering ("Google Docs cards") | Phase 1.5 | Visual polish — single canvas with dashed lines is functional |
| Server-side PDF (Playwright) | Phase 1.5 | `window.print()` is functional; Playwright removes the print-dialog UX wart |
| Walkthrough / Debate / multi-agent disagreement | Multi-agent phase | Tracked in PRODUCT_NOTES §2 |
| Bilingual mode / 中式英文检测 / cultural translation | Multi-agent phase | Best implemented as agent capabilities |
| Cover Letter editor | Separate spec | Different document, different flow |
| Job Matching / Keyword Profile / Humanizer | Separate specs | Not editor concerns |

### 1.3 Constraints inherited from PRODUCT_NOTES

These are not features but spec-level rules that apply to v1:

- **Data strategy (§4)** — every snapshot we store must be designed to be **anonymizable**. Add `is_user_consented_for_benchmark: bool` to the resume record schema from day one (default `false`). Snapshots must support hard-delete (GDPR/CCPA right-to-be-forgotten).
- **AI tool protocol (§13)** — the v1 AI bullet rewrite tool is the first instance of the broader `update_resume_section`-class tool surface defined in §13. **Naming and contracts must align with that doc** so the multi-agent phase can layer on without rewriting tool definitions.
- **Page context protocol (§13)** — the editor must register `pageContext` with a Chinese `summary` field (already partially implemented). Format must follow §13's spec.
- **Anti-anxiety design principle (§10)** — UI copy in save badges, AI feedback, and history operations uses encouraging/neutral language ("Saved · just now"; "Restored to earlier version"), not error-y language ("Save failed"; "Reverted change").
- **Future multi-agent compatibility** — the v1 single-tool AI invocation must go through an interface that is **structurally compatible** with LangGraph multi-agent calls. Concretely: the backend AI invocation handler accepts a list of tool calls and dispatches them, even though v1 only ever sends one tool. This avoids a backend rewrite at multi-agent phase.

---

## 2. Critical Architecture Decision: PDF Rendering Pipeline

### 2.1 The problem

The previous spec assumed `tiptap_to_html() → WeasyPrint` as the PDF pipeline. This guarantees **visual mismatch between editor and PDF** because:

- The editor canvas is rendered by the user's browser (Chromium / WebKit / Gecko)
- WeasyPrint is an independent Python CSS engine
- Even with identical HTML + CSS, the two engines produce different output:
  - Different font metric calculations (kerning, line-height)
  - Different page-break heuristics (orphan/widow handling)
  - Different default styles for `<ul>`, `<li>`, etc.
  - WeasyPrint does not support some modern CSS (e.g. `:has()`, certain `flex` and `grid` edge cases)

For a WYSIWYG editor where the user expects "the PDF looks exactly like what I'm editing", this engine mismatch is a permanent UX cost we cannot pay down.

### 2.2 Decision

**v1 abandons WeasyPrint. PDF generation goes through the same Chromium engine that renders the editor canvas.**

```
v1 pipeline:
  Editor canvas (Chrome renders TipTap → DOM)
                        │
                        │  user clicks Export PDF
                        ▼
  window.print() (same Chrome instance, same DOM, @media print rules applied)
                        │
                        ▼
  Browser print dialog → user picks "Save as PDF"
                        │
                        ▼
  PDF that is **bit-for-bit consistent** with what the user saw
```

### 2.3 Why this works

- The editor's `.resume-canvas` element is what the browser is rendering live
- `@media print` CSS rules:
  - Hide everything outside `.resume-canvas` (top bar, sidebar, AI panel)
  - Strip the canvas chrome (box-shadow, surrounding margin, ProseMirror cursor)
  - Set `@page { size: Letter; margin: 0; }` so the print engine respects the canvas's own padding
- `window.print()` triggers Chromium's print pipeline, which renders the **exact same DOM with the exact same computed styles** to PDF
- The user always sees their own browser's render in the editor and gets that same browser's render as PDF — **mismatch is not physically possible**

### 2.4 Trade-offs and Phase 1.5 upgrade path

**v1 trade-off:** The user is sent through their browser's native print dialog (must pick "Save as PDF" destination). This is functional but not "one-click download".

**Phase 1.5 upgrade — Server-side Playwright:**
```
POST /api/resume/:id/pdf
  ↓
Backend launches headless Chromium via Playwright
  ↓
Loads /resume/{id}/print (a print-only route)
  ↓
page.pdf() → PDF bytes
  ↓
Streams back to client (real one-click download)
```

The headless-Chrome path **also uses the same engine as the editor** (Chromium), so visual fidelity is preserved. The only added complexity is server-side dependency (~150 MB Chromium binary).

**Why not v1:** Adds infrastructure burden (deploy Chromium on the API host, manage browser lifecycle, handle PDF streaming) for a single UX wart. v1 ships faster with `window.print()`.

### 2.5 What this means for the editor's CSS

The single source of CSS truth is `frontend/src/components/resume/resume-editor.css`. It must:

- Style the on-screen canvas correctly (the editor view)
- Include `@media print` rules that produce the desired PDF appearance from the same DOM
- Use `break-inside: avoid` on `.resume-entry`, `break-after: avoid` on `.resume-section-heading` so the print engine's page breaks land in sensible places
- Use only fonts that are available on the user's machine (Inter via web font fallback chain — no font that "only works in WeasyPrint")

The existing `templates/resume_template.html` (the Streamlit-era template) is **no longer the source of truth**. Its CSS is a reference for visual style only; the editor CSS supersedes it.

---

## 3. Multi-page Visualization

### 3.1 Approach

Single TipTap canvas. JavaScript measures the rendered height after every doc change, divides by 11" (1056 px @ 96 dpi) to compute page count, and overlays:

- A dashed horizontal line at every page boundary
- A small badge "Page 2 of 3" anchored at the right edge of each break

The page-break lines are visual overlays (siblings of the canvas, absolutely positioned) and are **excluded from print** via `@media print { .page-break-overlay { display: none; } }`.

### 3.2 Why this matches the actual PDF page breaks

Because the same Chromium engine that draws the editor is the one that decides where to break pages on print:

- `break-inside: avoid` on `.resume-entry` tells the engine not to split an entry mid-content
- `break-after: avoid` on `.resume-section-heading` tells the engine not to leave a heading orphaned
- The editor measures `scrollHeight` and divides by 1056 px → those positions match where the print engine would break

For v1 this is "good enough alignment" — minor edge cases (e.g., a single bullet straddling a page edge by 5 px) may shift the print-time break by one block. Phase 1.5 can add finer measurement using `IntersectionObserver` on each block to detect actual break candidates.

### 3.3 What v1 does NOT attempt

- Multi-canvas rendering (separate page-shaped cards with gaps between them) — Phase 1.5
- Pixel-perfect print preview — Phase 1.5 / 2 if needed
- Page-by-page editing focus — out of scope

---

## 4. PDF Upload & Import Flow

### 4.1 User-facing flow

```
Upload entry points (any of):
  - Landing page "Upload Resume" CTA
  - Editor top bar "+ New from PDF"
  - Sidebar "Editor" item when user has zero resumes
        │
        ▼
File picker / drag-drop  →  POST /api/resume/parse (multipart/form-data)
        │
        ▼
Backend:
  1. services/resume_parser.parse_resume()  →  legacy JSON (RESUME_SCHEMA)
  2. legacy_json_to_tiptap_doc()             →  TipTap doc JSON
  3. Persist (saved_sessions/resumes/{uuid}.json)
  4. Return {id, meta, doc}
        │
        ▼
Frontend navigates to /resume/{id} with content loaded
        │
        ▼
Orange banner: "Just imported — please review for parse errors"
(banner dismissible; v1 does not promise perfect parsing)
```

### 4.2 The legacy → TipTap converter

The Streamlit parser outputs a flat JSON shape:

```json
{
  "name": "...",
  "role": "...",
  "contact": ["email", "phone", ...],
  "skills": { "Languages": "Python, Go", ... },
  "summary": "...",
  "experience": [{ "company", "role", "date", "bullets": [...] }],
  "projects": [...],
  "education": [...]
}
```

A new pure function `legacy_json_to_tiptap_doc(legacy)` (lives in `api/converters/resume.py`) maps each legacy section to TipTap nodes:

- `name` + `contact` → `resumeHeader` node (with `contacts` attr)
- `summary` → `resumeSection` node titled "Summary" with one `entry` containing one `bullet`
- `skills` → `resumeSection` titled "Skills"; each category becomes one `entry`
- `experience` → `resumeSection` titled "Experience"; each item becomes one `entry` with bullets
- `projects` → `resumeSection` titled "Projects"; each item becomes one `entry`
- `education` → `resumeSection` titled "Education"; each item becomes one `entry`

This is a one-way conversion at import time. After import, the canonical store is the TipTap doc.

### 4.3 Edge cases

- Scanned PDF (no extractable text) — parser falls back to vision API (already implemented in `parse_resume_from_image`); same flow downstream
- Parse fails entirely — backend returns 422 with error message; frontend shows error and offers "Start blank resume instead"
- PDF too large (>10 MB) — backend rejects with 413; frontend shows clear size limit message

---

## 5. Structural Operations (No Bubble Menu in v1)

### 5.1 Hover affordance per block

Every block (`bullet`, `entry`, `resumeSection`) gets a hover affordance rendered via TipTap's `NodeView` API:

```
       hover area extends to left of block
              │
              ▼
   [⋮⋮ drag]  • The block content here.................
   [+ ⋯ menu]                                          [🗑]
```

- **Left side**: drag handle (`⋮⋮`) — press and drag to reorder
- **Below/inline**: `+` button to insert a sibling of the same kind below
- **Right side or in `⋯` menu**: delete button

### 5.2 "+ Add section here"

Between sections, a thin hoverable strip reveals "+ Add section". Clicking opens a small chooser (modal or inline popover):

- Experience
- Projects
- Education
- Skills
- Custom (text input for heading)

The new section starts with one empty entry and one empty bullet.

### 5.3 Drag-and-drop reorder

Implemented via a TipTap plugin built on `@dnd-kit/core` (already a known good combo with ProseMirror). Drag handles dispatch reorder commands; ProseMirror schema enforces validity (e.g., a `resumeSection` cannot be dragged into a `bullet`).

### 5.4 Why no bubble menu in v1

Bubble menus are a real UX win but a real implementation cost (selection state, positioning, focus management, content-by-context routing). Hover affordances cover the structural operations the user needs immediately. Bubble menu is on the Phase 2 roadmap.

The existing `FormatToolbar` (in the top bar) continues to provide bold/italic/underline/link via the persistent toolbar.

---

## 6. Save Status

The top-bar `SaveBadge` is replaced with an always-visible status pill:

| State | Display | Visual |
|---|---|---|
| `saving` | "● Saving…" | Pulsing blue dot |
| `saved` (just now) | "✓ Saved · just now" | Steady green dot |
| `saved` (older) | "✓ Saved · 3 min ago" | Steady green dot, relative time updates every 30s |
| `offline` | "⚠ Offline · changes kept locally" | Amber dot |
| `error` | "× Save failed · Retry" | Red dot, click to retry |

State transitions are driven by the resume editor store. Relative time updates via a `useInterval` hook (no library needed, just `setInterval` cleanup).

Tooltip on hover shows absolute timestamp.

---

## 7. Backend & Persistence

### 7.1 Storage (no Postgres, file-based)

```
saved_sessions/
  resumes/
    {resume_id}.json      ← canonical resume record (meta + doc)
    snapshots/
      {resume_id}/
        {snapshot_id}.json
```

`{resume_id}.json` shape:

```json
{
  "id": "uuid",
  "user_id": "current-user",
  "parent_id": null,
  "is_base": true,
  "title": "Base resume",
  "schema_version": 1,
  "created_at": 1735000000000,
  "updated_at": 1735000050000,
  "target_company": null,
  "target_company_domain": null,
  "target_role": null,
  "is_user_consented_for_benchmark": false,
  "doc": { "type": "doc", "content": [...] }
}
```

Snapshot shape:

```json
{
  "id": "uuid",
  "resume_id": "uuid",
  "created_at": 1735000050000,
  "trigger": "auto" | "manual_save" | "ai_edit" | "checkpoint",
  "label": "...",
  "ai_message_id": null,
  "diff_summary": "Rewrote Snapbrillia bullet 2",
  "doc": { "type": "doc", "content": [...] }
}
```

### 7.2 API surface (FastAPI, under `api/routes/resume.py`)

| Method + Path | Purpose |
|---|---|
| `POST   /api/resume/parse` | Upload PDF, return new resume record (id, meta, doc) |
| `GET    /api/resume`       | List current user's resumes (id, title, target_company, updated_at) |
| `GET    /api/resume/:id`   | Get one resume (full meta + doc) |
| `PUT    /api/resume/:id`   | Update doc + meta (debounced from frontend) |
| `POST   /api/resume/:id/snapshot` | Create explicit snapshot (label optional) |
| `GET    /api/resume/:id/snapshots` | List snapshots (paginated, newest first) |
| `POST   /api/resume/:id/restore`   | Restore from snapshot (creates new "auto" snapshot of pre-restore state) |
| `POST   /api/resume/:id/variant`   | Fork current resume into a new variant |
| `POST   /api/resume/:id/ai/rewrite-bullet` | AI rewrite a single bullet (returns suggestion; user accepts client-side) |

User authentication is out of v1 scope; all endpoints assume a single hard-coded user (`"current-user"`) until auth lands.

### 7.3 Snapshot retention

- `ai_edit` and `checkpoint`: keep forever
- `manual_save` and `auto`: rolling window of 50 most recent (combined cap)
- Trigger `auto` snapshots only if the doc actually changed since the last snapshot AND at least 30 seconds of idle have passed (matches previous spec)

### 7.4 Multi-agent compatibility (PRODUCT_NOTES §13)

The `/api/resume/:id/ai/rewrite-bullet` endpoint internally delegates to a generic AI orchestration handler:

```python
# api/services/ai_orchestrator.py (new)
def execute_resume_tool_calls(resume_id: str, tool_calls: list[ToolCall]) -> list[ToolResult]:
    """Execute one or more tool calls against a resume.

    v1 only ever receives a single tool call (rewrite_bullet). The list-based
    interface exists so the multi-agent phase can dispatch parallel calls from
    a LangGraph node without API changes.
    """
```

The bullet-rewrite endpoint constructs a single `rewrite_bullet` tool call and passes it through this orchestrator. When the multi-agent phase ships, the same orchestrator handles multi-tool dispatch from LangGraph nodes.

---

## 8. Multiple Resumes + Variants

### 8.1 Top-bar dropdown

The current top-bar resume title becomes a dropdown showing all of the user's resumes:

```
┌────────────────────────────────────────┐
│ ▾ Stripe Backend                       │
├────────────────────────────────────────┤
│   Base resume                          │
│   Stripe Backend          ✓ (current)  │
│   Meta SWE                             │
│   Anthropic Eng                        │
├────────────────────────────────────────┤
│ + New variant from this                │
│ + Upload another PDF                   │
└────────────────────────────────────────┘
```

Clicking a resume navigates to `/resume/{that_id}` (full page transition).

### 8.2 Variant fork

"+ New variant from this" → small modal:

- Variant name (default: "Copy of {current title}")
- Target company (optional)
- Target role (optional)

Submitting POSTs to `/api/resume/:id/variant`, which deep-copies the doc, generates a new id, sets `parent_id` to the source's id, and returns the new resume. Frontend navigates to it.

Variants are independent — editing the variant does not propagate to the parent.

### 8.3 Why no list page (`/resume` index)

Per the previous spec's IA decision: a user always lands on a specific resume via dashboard / sidebar / tracker. The dropdown serves the "switch resumes" need without needing an index page. v1 keeps this.

---

## 9. AI Bullet Rewrite (v1's only AI editing capability)

### 9.1 User-facing flow

Each bullet has a small ✨ button that appears on hover (in the same hover affordance area as the drag handle):

```
[⋮⋮]  • Designed and shipped 12 REST APIs in Node.js, ...   [✨] [🗑]
```

Clicking ✨ opens a small inline popover:

```
┌──────────────────────────────────────────┐
│ ✨ Rewrite this bullet                    │
├──────────────────────────────────────────┤
│ Style:  [Default ▾]                      │
│         · Default                        │
│         · Add quantitative impact        │
│         · Stronger ownership verbs       │
│         · Tailored to current variant    │
├──────────────────────────────────────────┤
│ Custom instructions (optional):          │
│ [                                      ] │
├──────────────────────────────────────────┤
│              [Cancel]  [Generate]        │
└──────────────────────────────────────────┘
```

After "Generate", the popover shows the proposed text and:

- [Replace] — substitutes the bullet content
- [Try again] — generates another variant with the same instructions
- [Cancel] — discards

A successful replace creates an `ai_edit` snapshot with `diff_summary: "Rewrote bullet (X→Y words)"`.

### 9.2 Why the four "style" presets

These align with PRODUCT_NOTES §3.1 (经历重新框架) — the deepest insight is that Chinese students underclaim ownership and omit quantification. The presets are the v1 surface for that thesis:

- **Default** — neutral rewrite for clarity
- **Add quantitative impact** — prompts for numbers, percentages, scale
- **Stronger ownership verbs** — replaces "participated / helped / assisted" with "led / built / designed"
- **Tailored to current variant** — uses the variant's `target_company` + `target_role` as context

The presets are prompt templates, not separate models. A single LLM call with the appropriate system prompt handles all four.

### 9.3 Why we are NOT building "bubble menu with full action set" in v1

The bubble menu (Phase 2) will offer these same actions plus more (translate, shorten, lengthen) and will surface them on text selection without requiring the user to find the ✨ button. v1's hover-✨ affordance is the simplest possible UI that delivers the AI capability — discoverable, low-stakes, no positioning gymnastics.

---

## 10. Open / Deferred Items (with rationale)

| Item | Why deferred | Where it lands |
|---|---|---|
| Selection-aware bubble menu | UX polish, not blocking usability | Phase 2 |
| On-demand right-side drawer | Polish, depends on bubble | Phase 2 |
| Per-element history | Requires block-level stable IDs | Phase 2 |
| Two-column sidebar layout (matches existing PDF template) | Visual upgrade; current single-column is a complete resume layout | Phase 1.5 |
| Multi-canvas page rendering | Visual polish; dashed-line single canvas is functional | Phase 1.5 |
| Server-side Playwright PDF | Removes print-dialog UX wart | Phase 1.5 |
| User authentication | Single-user assumption is fine for personal/dev use | Separate spec |
| Multi-agent (Recruiter / Hiring Manager / Career Coach) | PRODUCT_NOTES §2 — major separate arc | Multi-agent phase |
| Walkthrough Mode (PRODUCT_NOTES §13 closing) | Built on multi-agent foundation | Multi-agent phase |
| Bilingual / 经历重新框架 v2 / cultural translation | Best as agent capabilities | Multi-agent phase |

---

## 11. Acceptance Criteria

A user opens the app fresh (no resumes yet) and:

1. **AC1** Clicks "Upload Resume" on landing → file picker → selects a PDF → progress indicator → lands on `/resume/{new_id}` with parsed content visible
2. **AC2** Sees an orange "Just imported — please review" banner; clicks ✕ to dismiss
3. **AC3** Clicks any text in the editor → cursor appears, can type, change is reflected immediately
4. **AC4** Hovers a bullet → drag handle (⋮⋮), ✨ rewrite, and 🗑 buttons appear; mouseout → they disappear
5. **AC5** Drags a section to reorder it; layout updates and autosaves
6. **AC6** Clicks "+ Add section here" between two sections → chooser appears → picks "Awards" → new empty section appears
7. **AC7** Clicks 🗑 on a bullet → bullet removed; an undo confirms via ⌘Z
8. **AC8** Edits any text → top-bar status pill shows "● Saving…" then "✓ Saved · just now"
9. **AC9** Waits 1 minute → status pill reads "✓ Saved · 1 min ago"
10. **AC10** Disconnects from network → status pill shows "⚠ Offline · changes kept locally"; reconnects → flushes to backend, returns to "Saved"
11. **AC11** Resume content is long enough to span 2 pages → dashed line appears at the page boundary; "Page 2 of 2" badge visible at right edge
12. **AC12** Clicks "Export PDF" → browser print dialog opens → user saves PDF → opening the PDF shows **visually identical content** to what was on screen — same fonts rendered at same sizes, same line breaks within each block, same page-break positions. (Not "byte-identical" because PDF metadata/timestamps differ; what matters is that the rendered pixels match.)
13. **AC13** Clicks the title dropdown → sees their resume(s) listed → clicks "+ New variant from this" → fills in "Stripe Backend" / "Stripe" / "Backend SWE" → variant created → redirected to it; original resume unchanged
14. **AC14** Hovers a bullet → clicks ✨ → picks "Add quantitative impact" → clicks Generate → sees suggested rewrite with numbers added → clicks Replace → bullet text changes; status pill flashes saving → saved
15. **AC15** Opens the History panel → sees a list of snapshots (auto + the ai_edit from AC14) with relative times → clicks an earlier snapshot → preview → "Restore" → editor content reverts; a new snapshot of the pre-restore state is created (so restore itself is undoable)

---

## 12. What This Spec Does NOT Cover

- The bubble menu, side drawer, and per-element history (Phase 2 — separate spec when we get there)
- Two-column sidebar layout migration (Phase 1.5 — separate spec)
- Multi-agent orchestration / Walkthrough / Debate (PRODUCT_NOTES §2 — major separate arc)
- Cover letter, job matching, mock interview, humanizer (separate specs)
- User authentication, multi-user data isolation, sharing
- Resume import from sources other than PDF (LinkedIn export, .docx, etc.)
- Mobile / tablet layout (v1 is desktop-first)

---

## 13. Open Questions for Implementation

These are flagged for the writing-plans phase to resolve:

- **Q1**: Where exactly does the file upload live in the landing page UI? (Current landing page has a simulated upload — need to wire it to real `/api/resume/parse`.)
- **Q2**: For the AI bullet rewrite, which model does the backend use? (Default to whatever the global AI panel uses; needs alignment check.)
- **Q3**: Does v1 ship with a "Start blank resume" alternative entry, or is PDF upload the only way in?
- **Q4**: How does the History panel get triggered from the UI? (Top-bar button labeled "History"? Sidebar item? Keyboard shortcut?)
