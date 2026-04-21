# Resume Editor — Design Spec

**Date:** 2026-04-20
**Status:** Approved direction, pending implementation plan
**Owner:** CareerOps Pro frontend + backend
**Replaces:** the Streamlit-era resume edit page (`pages/`, `services/resume_editor.py` UI surface)

---

## Goal

Build a Google-Docs-feeling resume editor where users edit content directly in a WYSIWYG canvas that visually matches the generated PDF. AI can read the full resume structure and modify it through structured commands, with automatic version snapshots so any AI change can be reverted.

---

## MVP Scope (v1)

### In scope

**Editing**
- TipTap-based WYSIWYG editor with a simple, opinionated toolbar (bold / italic / underline / link)
- Strict resume schema (header, sections, entries, bullets — defined below)
- Click-anywhere to edit; selection-aware floating mini-toolbar
- Section drag-to-reorder
- Section show/hide per resume variant
- Undo / Redo (TipTap built-in: ⌘Z / ⌘⇧Z)
- Autosave (debounced 500 ms, status indicator in top bar)

**Multi-variant**
- One user has one base resume + N variants derived from it
- Variant = full copy of base at the moment of derivation; further edits are independent
- Top-bar dropdown switches variant; "+ New variant for [job]" creates one bound to a target company/role
- Each variant carries optional `target_company`, `target_company_domain`, `target_role`

**Job-targeting (visual minimum)**
- Top bar shows "Tailoring for: [Company] · [Role]" as plain text
- Logo treatment is **out of MVP**, deferred to v1.5 (FM-style angled badge concept noted)

**Versioning**
- Snapshots automatically captured on:
  - Every AI edit (`trigger=ai_edit`)
  - 30-second editing-idle (`trigger=auto`, only if doc changed since last snapshot)
  - User explicit "Save as checkpoint" (`trigger=checkpoint`, with a label)
- History panel (slide-out from right edge) lists snapshots with relative time, trigger badge, and one-line diff summary
- Click a snapshot → preview diff (new vs current) → "Restore this version" button
- Retention: keep all `ai_edit` and `checkpoint` snapshots forever; rotate `auto` to keep most recent 50

**PDF & rendering parity**
- The editor canvas uses the **same CSS** as the WeasyPrint PDF template
- Page-break dashed lines visible in the canvas at the actual A4/Letter break position
- "Export PDF" button calls existing backend (`utils/html_renderer.py` adapted to consume TipTap doc → HTML)

**AI integration**
- Page registers itself with `pageContext` so the global AI panel auto-enters "Resume Editor mode"
- The AI panel can read the current TipTap doc (JSON) and the rendered HTML
- AI changes are written back as a new doc state and trigger a snapshot
- AI surfaces a one-line diff summary along with each change so the snapshot has a meaningful label

### Out of MVP (Backlog)

- Inline ghost-text suggestions / Cursor-Tab-style autocomplete
- Slash commands inline (`/quantify`, `/shorten`, `/translate`)
- Track-changes mode (AI proposes; user accepts/rejects)
- Three-agent inline comments
- JD reference sidebar / live keyword-match meter / missing-skills highlighter
- Multiple resume design templates / template switcher
- `.docx` and ATS plain-text export
- Bilingual mode / "经历重新框架" lint / STAR lint
- **FM-style angled, faded, beautified company logo badge in top bar** (parked, design exploration noted)
- Per-bullet history panel (only document-level history in MVP)

---

## Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Editor core | `@tiptap/react` v3 + `@tiptap/pm` | ProseMirror under the hood; mature, schema-driven |
| State | Zustand store per editor instance | Mirrors existing patterns in `frontend/src/stores/` |
| Styling | Existing Tailwind + `globals.css` design tokens | Editor canvas CSS shared with PDF |
| PDF | Reuse `utils/html_renderer.py` + WeasyPrint | Adapter: `TiptapDoc → HTML` runs server-side |
| Persistence | New tables `resumes`, `resume_snapshots` | Postgres (deferred — MVP can use file/JSON store; design for both) |
| AI panel | Existing `feature/global-ai-panel` work + `usePageContext` hook | Already built |

---

## Information Architecture

### Routes (Next.js App Router)

```
/resume/[id]              → Editor page (the entire scope of this spec)
/resume/[id]/preview      → (deferred) Full-screen PDF preview overlay
```

A user always lands on a specific resume id — no `/resume` index page. Variant switching happens inside the editor's top bar dropdown.

### Entry points

| From | URL |
|---|---|
| Dashboard "Edit resume" CTA | `/resume/{base_id}` |
| Sidebar "Editor" item | `/resume/{last_active_id}` (falls back to base) |
| Application tracker, per job row | `/resume/{variant_id_for_job}` (auto-derive from base if missing) |
| Landing-page resume upload completion | `/resume/{newly_created_base_id}` |

---

## Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ TopBar  [Resume ▾]   Tailoring for: Stripe · Backend SWE   [⤓ PDF] │  ← 56px fixed
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                                                                     │
│            ┌───────────────────────────────────────┐                │
│            │                                       │                │
│            │       EDITOR CANVAS (TipTap)         │                │
│            │       Letter-sized "paper" centered   │                │
│            │       White background, real page     │                │
│            │       break dashed lines              │                │
│            │                                       │                │
│            └───────────────────────────────────────┘                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Bottom: Existing global AI panel (Resume Editor mode)
```

- **No sidebar editor or property inspector.** Selecting text shows a small floating toolbar (bold/italic/underline/link); structural moves (drag-section, add-section, hide-section) live in a hover affordance per section.
- **Top bar** holds: variant dropdown (left), tailoring label (center), Export PDF (right), History trigger (right).
- **Canvas width** matches Letter (8.5″ × ~11″) or A4 (auto-detected from existing template); actual rendered page-break lines drawn from WeasyPrint's pagination output.

The fancy company-logo treatment (FM-style angled/faded badge) is intentionally deferred; v1 ships with a plain text "Tailoring for: …" so we can test the editor itself without blocking on visual flourish.

---

## Data Model

### Resume

```ts
interface Resume {
  id: string;                          // uuid
  user_id: string;
  parent_id: string | null;            // null = base; else points to base
  is_base: boolean;
  title: string;                       // user-editable e.g. "Base resume" / "Stripe Backend"

  target_company: string | null;       // "Stripe"
  target_company_domain: string | null;// "stripe.com" — used by future logo lookup
  target_role: string | null;          // "Backend SWE"

  doc: TiptapDoc;                      // canonical content (ProseMirror JSON)

  created_at: number;                  // epoch ms
  updated_at: number;
}
```

### Snapshot

```ts
type SnapshotTrigger = "ai_edit" | "manual_save" | "checkpoint" | "auto";

interface ResumeSnapshot {
  id: string;
  resume_id: string;
  doc: TiptapDoc;                      // full snapshot (no diffs in MVP)
  created_at: number;

  trigger: SnapshotTrigger;
  label: string | null;                // for explicit checkpoints
  ai_message_id: string | null;        // for ai_edit, joins to conversation
  diff_summary: string | null;         // human-readable: "Rewrote bullet 3 in Snapbrillia"
}
```

### Retention

- `ai_edit` and `checkpoint`: keep forever
- `auto`: rolling window of 50 most recent
- `manual_save`: rolling window of 50 most recent (combined cap with `auto`)

---

## TipTap Schema (Resume-Specific)

```
doc
  ├─ resumeHeader              (1, required, top of doc)
  │    ├─ name: text           (single line)
  │    └─ contactLine[]        (each is one paragraph; e.g. email, phone, location, links)
  │
  └─ resumeSection[]           (any number, draggable)
       ├─ heading: text        ("Experience", "Education", "Projects", …)
       └─ entry[]
            ├─ entryTitle: text     ("Software Engineer @ Snapbrillia")
            ├─ entryMeta: text      ("Jan 2024 – Present · Remote")
            └─ bullet[]
                 └─ paragraph (rich text: bold, italic, underline, link)
```

**Constraints (enforced by schema):**
- `bullet` allows inline marks but no nested lists
- `entryTitle` and `entryMeta` are single-line text (no line breaks)
- `resumeSection` only contains `entry`s (no free-floating paragraphs)
- A `bullet` Enter → new bullet; trailing-empty bullet Enter → exit list (new entry); trailing-empty entry Enter → exit entry list (prompt to add a new section)
- Section drag-to-reorder operates on the `resumeSection` array

**Why strict:**
1. AI gets clean structured commands (`add_bullet`, `update_entry_title`, `reorder_section`) instead of guessing HTML
2. PDF renderer maps each node 1:1 to HTML; layout cannot be broken by edit
3. Multi-template future is easier — swap the renderer, schema stays

---

## PDF Export Pipeline

```
TipTap doc (JSON)  ─►  /api/resume/:id/pdf  ─►  Python: tiptap_to_html(doc)
                                                       │
                                                       ▼
                                          HTML using existing CSS
                                                       │
                                                       ▼
                                              WeasyPrint → PDF
                                                       │
                                                       ▼
                                              Stream back to client
```

- `tiptap_to_html(doc)` is a new pure function (Python) that walks the doc and emits the same HTML structure the existing `templates/resume_template.html` produces today
- The CSS file used by WeasyPrint is **also imported by the editor canvas** (or extracted into a shared stylesheet) so WYSIWYG matches the PDF
- Page-break detection: client makes a "dry-run" call returning page-break Y-positions, draws dashed lines at those positions in the editor canvas

---

## AI Integration

### Page-context registration

The editor calls:

```ts
usePageContext({
  page: "resume_editor",
  summary: `正在编辑「${resume.title}」简历，目标 ${resume.target_company ?? "未指定"} · ${resume.target_role ?? ""}`,
  data: { resume_id, target_company, target_role },
});
```

### Tools the AI can call

| Tool | Args | Effect |
|---|---|---|
| `read_resume_doc` | `()` | Returns current TipTap doc JSON |
| `read_resume_html` | `()` | Returns rendered HTML (for visual reasoning) |
| `update_bullet` | `(section, entry, bullet_index, new_paragraph)` | Replaces a single bullet's text |
| `add_bullet` | `(section, entry, text)` | Appends a bullet |
| `delete_bullet` | `(section, entry, bullet_index)` | Removes a bullet |
| `update_entry_title` | `(section, entry, new_title)` | Edits title line |
| `add_entry` | `(section, entry_data)` | Adds an entry to a section |
| `reorder_section` | `(section, new_index)` | Moves a section |
| `replace_doc` | `(new_doc, summary)` | Bulk replace (escape hatch); requires summary string |

Every successful tool call:
1. Mutates the canonical doc via TipTap commands (preserves undo)
2. Triggers a `snapshot(trigger="ai_edit", ai_message_id, diff_summary=tool's natural-language summary)`

### Snapshot revert flow

User opens History panel → selects a snapshot → "Restore" → editor's doc is replaced with snapshot's doc → a new `auto` snapshot is created (so the act of reverting itself is reversible).

---

## Acceptance Criteria

A user opens `/resume/{base_id}` and:

1. Sees the editor with their resume content rendered, identical to what their PDF would look like
2. Can click any text and immediately edit it
3. Selecting text shows a floating toolbar with bold/italic/underline/link
4. Can drag a section to reorder it
5. Can hide/show a section via a hover affordance on each section
6. Edits autosave within 500 ms and the top bar shows a brief "Saved" indicator
7. Can press ⌘Z to undo and ⌘⇧Z to redo
8. Can open the variant dropdown and switch to a different resume — URL changes, content swaps without page reload
9. Can click "Export PDF" and download a PDF that visually matches what they see
10. Page-break dashed lines appear at the correct A4/Letter break positions
11. Can open History panel, see a list of snapshots with relative time, and restore any snapshot
12. Asks the AI panel "shorten my Snapbrillia bullet 2" → AI calls `update_bullet` → bullet visibly changes → an `ai_edit` snapshot appears in History with summary "Shortened Snapbrillia bullet 2"
13. Restores the previous snapshot → bullet returns; a new `auto` snapshot is created so the restore itself is reversible

---

## Open / Deferred Items

- **Backend persistence** — design supports Postgres but MVP can use file/JSON store; pick at writing-plans time based on what's already running
- **Schema migration** — when we extend the TipTap schema later, we need a doc version field; add `schema_version: 1` to `Resume.doc` from day one
- **Real-time collab** — out of MVP; design left compatible with Yjs adapter later
- **Logo treatment** — FM-style angled/faded badge in top bar (concept: like a stylized soccer-club crest mounted at an angle, low contrast, evokes sense of "playing for this team"). Parked.
- **Per-bullet diff inspect** — for now, snapshots are document-level; v1.5 may expose per-node diffs

---

## What This Spec Does NOT Cover

- The `feature/global-ai-panel` branch's AI panel itself (already designed; this spec only adds the `usePageContext` registration and tool surface)
- Authentication / login flow
- Application tracker integration beyond "click 'edit resume' for this job → land here"
- Mock interview integration
