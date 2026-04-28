# Resume Editor AI Integration v0 — Design Spec

**Date:** 2026-04-28
**Status:** Approved direction, pending plan
**Branch:** `feature/resume-editor-v2`

---

## Goal

Wire AI editing into the v2 resume editor:

1. The global AI panel reads the **current resume context** (and on demand, any other user data — past resumes, application history) and can answer questions about it like Claude Code.
2. The user can ask AI to **modify the resume** in natural language. AI changes are applied as **structured tool calls**, surfaced as **reviewable Suggestions** before they touch the document.
3. Every AI change is **marked inline** in the editor with the **before/after** preserved so the user can see what changed.
4. The architecture is **multi-agent ready** — v0 ships 3 agents orchestrated by **LangGraph**, future versions add specialists / reviewer loops without restructuring.

**Non-goals (v0):**
- Style / template / font / color / alignment changes by AI
- Proactive AI (background observer suggesting unprompted changes)
- Document-level version history / time travel
- Semantic cross-data search (`search_user_data`)
- ReviewerAgent loop (deferred to v0.1)
- JD-specific input UI (v0 expects user to paste JD into chat)
- Inline AI quick-action menus (no "AI quantify"-style preset buttons on ⋮⋮)

---

## 0.5 Non-Regression Mandate (HARD CONSTRAINT)

**The existing v2 editor must work bit-for-bit identically after this feature ships.** Drag-and-drop especially went through many polish cycles (snapshot drop targets, clip-path cross-page animation, soft-drop settle, no-op slot filtering, scroll lock, optimistic concurrency for buildHypotheticalAtoms). None of it may regress.

**Explicit preservation list (P0 — any task that touches these must include a regression test):**

| Subsystem | What MUST keep working |
|-----------|------------------------|
| **Drag-and-drop** | section / entry / bullet / header-row drag; all 4 layers of fix (no-op filter, snapshot Y, clip-path, soft drop settle); cross-page transitions; scroll lock on commit; layout-aware preview; per-block hover ⋮⋮ |
| **Selection** | single click, shift-click range, cmd/ctrl toggle, Cmd+D / Cmd+C / Backspace on selection (`SelectionManager`) |
| **TipTap fields** | per-field instances, `SingleLineDocument` / `BulletDocument` schema, IME `compositionLock`, `useMeasureModeSync`, `originEditorId` reflection guard |
| **Notion-style key behaviors** | Backspace on empty single-line deletes structural unit; Bullet outdent two-step; placeholder rendering; Enter / Backspace at boundary |
| **Toolbar** | Bold / Italic / Underline / Color / Highlight / TextAlign; Font picker; undo/redo routing (TipTap when bullet focused, store undo otherwise) |
| **Layout / pagination** | `LayoutEngine`, `AtomContentLayer`, `PageBackgroundLayer`, `PrintFlowPlaceholders`; `print` mode === `edit` mode (pixel parity) |
| **Header rows** | name + contact row drag, `header.row_order`, `effectiveHeaderRowOrder` |
| **Existing undo stack** | `_pushUndo` for structural ops; TipTap undo per field; toolbar undo routing |
| **Existing global AI panel** | 3-height state machine (collapsed / compact / expanded); `pageContext` store; bottom-pinned position |
| **Resume schema** | v2 schema + migration; no breaking changes to `BlockId` semantics or block shapes |

**Operational rules for the implementation plan (non-negotiable):**

1. **No edits to existing files outside an explicit allowlist per task.** Each plan task declares the files it touches; AI write tools live in NEW files (`services/ai/...`, `frontend/src/components/.../ai/...`); existing v2 files are touched only when strictly necessary (e.g., `useResumeStore` to extend `_pushUndo`, `EditorPage` to mount sidebar, ⋮⋮ handler to register double-click).

2. **All v2 tests must pass before each commit.** The current 219+ test count in `frontend/src/components/resume/v2/` is the floor. New tests add to it; none disappear.

3. **Soft-lock visual must NOT replace `contenteditable` toggling with DOM removal or re-mount.** The TipTap instances must stay alive (just become readonly) — re-mounting kills cursor state, IME composition, and undo history. The lock toggles `editor.setEditable(false)` per affected field instance.

4. **Sidebar mount point must NOT shift the existing 3-pane editor layout permanently.** When sidebar is closed, the layout is exactly as today. Opening sidebar uses CSS overlay or transient grid-column add — no DOM restructuring of the editor.

5. **Drag-and-drop event handlers must keep working when sidebar is open.** Pointer events on ⋮⋮ are unaffected by sidebar visibility. (Verify: drag a bullet while sidebar is open → drag still works; drop → commit fires.)

6. **The undo stack extension (Section 8) must extend, not replace, `_pushUndo`.** Adds **one** optional `kind: 'aiApply'` discriminator to `UndoEntry` (single accept and batch accept both produce `aiApply` entries — they differ only in `suggestionIds.length`); adds a module-local `_undoSuppressed` flag with **one** early-return line in `_pushUndo`; adds `_aiApplyTransaction` helper. Existing structural / TipTap undo paths unchanged. `undo()` / `redo()` gain a 5-line dispatch on `entry.kind` to notify suggestion-store of reverted AI applies — see § 8.4.

7. **No changes to `useResumeStore` actions called by drag-and-drop** (`moveSection`, `moveEntry`, `moveBullet`, `moveHeaderRow`, `insertBlock` exports, `deleteBlock` exports, `setBulletKind`, `duplicate*`, `updateField`). AI applies invoke them as-is; semantics frozen. Two **additive** changes are allowed (and required by § 8.2 / § 8.4):

    - The structural lock-check (§ 6.2 last row): a top-of-action no-op guard inside each existing action — defensive fail-safe behind UI-level guards. No behavior change when not locked.
    - **Optional `forcedId` parameters** added to `insertBullet` and `insertEntry` (these are the only insert actions v0 AI tools invoke; `insertSection` is not in v0 write-tool inventory and stays untouched). Default `undefined` → existing call sites (drag, keyboard, slash command) behave exactly as today. AI apply passes server-minted (tool-emitted) stable UUIDs that were generated and persisted into `Suggestion.insertedBlock.id` at tool-emit time, so the persisted block id matches the suggestion record across reloads. Adding optional trailing parameters is non-breaking in TS and JS; existing tests (`structural.test.ts`) remain valid without modification.
    - **One new undo helper** `_aiApplyTransaction(label, meta, fn)` + a module-local `_undoSuppressed` flag inside `useResumeStore`. `_pushUndo` gains a single early-return when the flag is set; this is the only line touched in the existing `_pushUndo` function.
    - **`undo()` / `redo()` gain a 5-line dispatch** on `entry.kind` calling a registered suggestion-store callback when an `aiApply` entry is reverted/replayed. The default (kind absent) path is unchanged — structural undo behaves bit-for-bit identically.
    - **NO new `setBulletContent` action.** v2 already has `updateBullet(id, content, origin)`; AI apply uses it directly.

8. **No changes to `frontend/src/components/resume/v2/interaction/DragController.ts` are allowed unless the task explicitly justifies it AND adds new regression tests.** Same rule for `LayoutEngine`, `AtomContentLayer`, the projection helpers (`atoms-projection.ts`, `header-order.ts`), and `move*.ts` action files. These are the v2 polish surfaces; tasks that need to thread lock-check through them must declare the file explicitly + add tests covering both locked and unlocked behavior.

9. **Existing global AI panel must be preserved, not rewritten.** v0 swaps the panel's send-to-backend implementation (currently a mock) for the real `POST /api/ai/run` + SSE stream consumer, and adds chat-narration / "view in sidebar" button rendering. The following stay unchanged: `useAiPanelStore` (3-height state machine — collapsed / compact / expanded — at `frontend/src/stores/aiPanel.ts`), `useConversationStore` (message thread persistence — `frontend/src/stores/conversation.ts`), `usePageContextStore` (`frontend/src/stores/pageContext.ts`), AppShell overlay positioning, and the bottom-pinned anchor. The AI sidebar (this spec's § 6.1) is a **separate** new component, not a takeover of the panel.

10. **The `structural.test.ts` and `DragController.test.ts` suites must pass after every commit in this feature.** Both are the canonical regression nets for the polish work that just landed.

The plan must include a final "v2 regression sweep" task before merge, running the full v2 test suite (command in § 11 AC item 10) + manual QA against the items in the preservation list.

---

## 1. Architecture Overview

```
┌─────────────────────────────────── Frontend (Next.js / Zustand) ──────────────────────────────────┐
│                                                                                                    │
│   ResumeDocumentCanvas (existing v2)                  Global AI Panel (existing)                  │
│        ▲                                                     │                                    │
│        │ inline marks + soft lock                            │ user input                         │
│        │                                                     ▼                                    │
│   useSuggestionStore  ◀───── SSE events ──────  AISessionClient (websocket-style stream)          │
│        │                                                     │                                    │
│        │ apply / reject                                      │ POST /api/ai/run                   │
│        ▼                                                     │                                    │
│   useResumeStore (existing)                                  │                                    │
│                                                              ▼                                    │
└──────────────────────────────────────────────────────────────┼────────────────────────────────────┘
                                                               │
                                                               ▼
┌──────────────────────────────────── Backend (FastAPI + LangGraph) ────────────────────────────────┐
│                                                                                                    │
│        api/routes/ai.py                                                                            │
│            POST /api/ai/run                  ── starts an orchestration                            │
│            GET  /api/ai/runs/{runId}/events  ── SSE stream of agent events                         │
│            GET  /api/ai/suggestions          ── list pending suggestions                           │
│            POST /api/ai/suggestions/{id}/status   ── body {status} — accepted|rejected|superseded │
│                                                                                                    │
│        services/ai/orchestrator.py    LangGraph graph                                              │
│            ├── CoordinatorAgent       routes intent, holds read-tools                              │
│            ├── PolishAgent            single-block text rewrites                                   │
│            └── ExperienceAgent        structural ops on experience section                        │
│                                                                                                    │
│        services/ai/tools/                                                                          │
│            read_tools.py              get_resume / get_block / list_resumes / get_apps / ...      │
│            write_tools.py             update_bullet / insert_* / delete_* / move_* — emit         │
│                                       Suggestion records, NEVER mutate doc directly                │
│                                                                                                    │
│        services/ai/suggestions.py     Suggestion CRUD, per-resume persistence (file or DB)        │
│                                                                                                    │
│        existing: api/routes/resume.py / services/resume_*.py                                       │
│        new:      api/routes/jobs.py — wraps services/job_tracker.py reads                         │
│                                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Boundary contract:** Agents never mutate the resume directly. They emit `Suggestion` records via write-tools. Suggestions are persisted server-side and streamed to the frontend.

**Apply ownership: frontend.** The canonical resume edit state lives in `useResumeStore` (Zustand). Persistence to `saved_sessions/resumes/{id}/resume.json` happens via the existing `flush-save.ts` → `PUT /api/resume/{id}` flow. **The backend never mutates `resume.json` as a side effect of AI work.** When the user accepts a Suggestion:

1. Frontend `useSuggestionStore.accept(id)` validates concurrency and runs the matching store action on `useResumeStore` (already familiar with how to dispatch — same actions drag-and-drop uses).
2. Frontend pushes an `aiApply` entry onto the existing undo stack.
3. Frontend's existing `flush-save.ts` subscription catches the store mutation and PUTs the new resume state to the backend.
4. Frontend POSTs `/api/ai/suggestions/{id}/status` body `{status: 'accepted' | 'rejected' | 'superseded' | 'pending'}` — **status transition only, no resume payload**. Backend updates the persisted Suggestion record's status field; nothing touches `resume.json` from this route. (`pending` is used by the undo dispatch hook in § 8.4 to revert an AI accept's status.)

This keeps frontend as the single source of truth for resume edit state and avoids stale-state races between Zustand and disk.

---

## 2. Trigger Model

**Single invocation path:** the global AI chat input. There are no inline AI quick-action menus.

**Selection is the implicit focus context.** When the user invokes AI, the Coordinator reads `useSelectionStore.selectedBlockIds`. Selected block(s) become the focus passed to subagents.

```
User flow A: chat-triggered
  1. (optional) User clicks ⋮⋮ on a block → block selected
  2. User types "改短一点" / "tailor 这个 entry to ..." in chat
  3. Coordinator reads chat input + selection → routes to PolishAgent or ExperienceAgent
  4. Chat replies briefly, sidebar stays closed
  5. Soft lock applies to affected section(s) during agent run
  6. Chat shows progress narration ("ExperienceAgent has produced 3/5 changes...")
  7. Run ends → chat shows summary + [📋 查看详情] button
  8. Click button → sidebar opens with pending Suggestions

User flow B: ⋮⋮ double-click
  1. User double-clicks ⋮⋮ on a block → block selected + sidebar opens immediately
     (sidebar shows current pending Suggestions for that scope; if none, it's an empty state
      ready to receive whatever the user types in chat next)

User flow C: chat without selection
  1. User types "@Snapbrillia 改第二条 bullet 短一点"
  2. Coordinator parses @-mention to find the block id, treats it as focus
  3. Otherwise same as flow A
```

**Trigger summary:** chat is the only invocation. Selection narrows scope. ⋮⋮ controls sidebar visibility, not AI invocation.

---

## 3. Tool Surface

Agents only see and use the tools their `contextContract` declares. Tools split into **read** (idempotent, no side effect) and **write** (emit Suggestions).

### 3.1 Read tools (v0)

| Tool | Backing route | Returns |
|------|---------------|---------|
| `get_current_resume()` | `GET /api/resume/{id}` (current id from session) | full ResumeDoc |
| `get_resume_block(blockId)` | derived helper | single Block JSON |
| `list_user_resumes()` | `GET /api/resume/` | `[{id, title, updated_at, target_company?, target_role?}]` |
| `get_resume_by_id(id)` | `GET /api/resume/{id}` | full ResumeDoc |
| `get_application_history(filters?)` | **NEW** `GET /api/jobs/` | `[{id, company, role, status, applied_at, jd_excerpt?}]` |
| `get_application_by_id(id)` | **NEW** `GET /api/jobs/{id}` | single Application incl. full JD |

`filters` for `get_application_history` (v0): `status`, `since`, `company`, `limit`. Existing `services/job_tracker.py` already supports filtering by status — just expose it.

### 3.2 Read tools deferred to v0.1+

- `search_user_data(query, scope?)` — semantic search across resumes + applications. Requires embedding + index work. **defer**.
- `get_user_profile()` — needs a UserProfile model. **defer**.

### 3.3 Write tools (v0)

All write tools emit a `Suggestion` record and **never mutate** the canonical resume. The orchestrator collects emitted Suggestions and persists them. **Tool input types match the actual store shape**, not a uniform TipTapDoc — most fields in v2 are plain strings; only bullet `content` is a TipTap JSON doc.

| Tool | Used by | Op | Input value type |
|------|---------|-----|------------------|
| `update_bullet(blockId, content)` | PolishAgent, ExperienceAgent | `update` | `TipTapDoc` (full doc with marks) |
| `update_entry_title(entryId, value)` | PolishAgent, ExperienceAgent | `update` | `string` (plain) |
| `update_entry_meta(entryId, value)` | PolishAgent, ExperienceAgent | `update` | `string` (plain) |
| `update_section_heading(sectionId, value)` | PolishAgent, ExperienceAgent | `update` | `string` (plain) |
| `update_header_name(value)` | PolishAgent | `update` | `string` (plain; header is singleton — no blockId arg) |
| `insert_bullet(parentEntryId, atIndex, content)` | ExperienceAgent | `insert` | `TipTapDoc` |
| `delete_bullet(blockId)` | ExperienceAgent | `delete` | — |
| `move_bullet(blockId, newParentEntryId, atIndex)` | ExperienceAgent | `move` | — |
| `insert_entry(sectionId, atIndex, payload)` | ExperienceAgent | `insert` | `EntryPayload` (see below) |
| `delete_entry(entryId)` | ExperienceAgent | `delete` | — |
| `move_entry(entryId, newSectionId, atIndex)` | ExperienceAgent | `move` | — |

```typescript
// Tool input — what the LLM sees & generates. NO ids — LLMs are bad at id discipline.
type EntryPayload = {
  title: string;            // plain
  meta: string;             // plain
  bullets: TipTapDoc[];     // ≥1 bullet content; tool layer mints ids when emitting suggestion
};
```

**Tool emit responsibility:** when `insert_entry` fires, the tool implementation (server-side, not the LLM) mints stable UUIDs (`uuid v4`, generated once at emit and persisted) for the new entry id and each bullet, and writes them into the `InsertSuggestion.insertedBlock` snapshot:

```typescript
// Conceptually inside the tool implementation:
const entryId = uuid();
const bulletIds = payload.bullets.map(() => uuid());
emitSuggestion({
  op: 'insert',
  parentId: sectionId,
  atIndex: ...,
  beforeChildIds: ...,
  insertedBlock: {
    kind: 'entry', id: entryId, title: payload.title, meta: payload.meta,
    bullets: payload.bullets.map((content, i) => ({ kind: 'bullet', id: bulletIds[i], content })),
  },
});
```

**Apply layer reads ids from `insertedBlock.bullets[i].id` (not from any `payload.bullets`).** The Suggestion record is the source of truth for ids post-emit; `EntryPayload` is only the LLM's input shape.

**Tool input type rationale:** v2 stores `entry.title`, `entry.meta`, `section.heading`, `header.name`, `header.contact_lines[].value` as plain strings (see `useResumeStore.updateField: (field, value: string, ...)`). Only `BulletBlock.content` is `TipTapDoc`. Treating everything as TipTapDoc would force the apply layer to do JSON↔string conversion and would diverge from how the editor itself writes these fields.

**Header contact lines are out of v0 scope** for AI editing. They are complex `ContactItem[]` (text/link discriminated union); polishing email / phone / URL is low-value and high-error-risk. Defer to v0.2.

**Scope guards (runtime, in tool layer):**
- PolishAgent allowed: `update_bullet`, `update_entry_title`, `update_entry_meta`, `update_section_heading`, `update_header_name`. Anything else → tool returns `ToolError("PolishAgent cannot perform structural ops")` and the agent loop sees it.
- ExperienceAgent allowed (explicit list — does NOT include `update_header_name`):
  - `update_bullet`, `update_entry_title`, `update_entry_meta`, `update_section_heading`
  - `insert_bullet`, `insert_entry`, `delete_bullet`, `delete_entry`, `move_bullet`, `move_entry`
  Every target id is checked at runtime: must resolve to a block in a section with `role === 'experience'`. Cross-section moves and skills/projects/education writes are rejected with `ToolError`. `update_header_name` and any header-targeted call is rejected unconditionally.

The Suggestion record stores the appropriate value type per op + field, mirroring the table above. The discriminated union in § 5.1 explicitly names `BlockContent` as `TipTapDoc | string | EntryFields | …`.

### 3.4 New backend route: `api/routes/jobs.py`

```python
# api/routes/jobs.py
@router.get("/")
def list_jobs(status: str | None = None, since: str | None = None,
              company: str | None = None, limit: int = 50):
    """Wraps services/job_tracker.get_jobs_by_status / load_tracker filtering."""

@router.get("/{job_id}")
def get_job(job_id: str):
    """Single job application incl. full JD text."""
```

Both routes are **read-only**, no auth changes (single-user app). Implementation is thin: load the existing `saved_sessions/job_tracker.json` via `services/job_tracker.py` helpers.

---

## 4. Agent Inventory (v0)

### 4.1 Roster

| Agent | Role | Context | Tools | Lock scope |
|-------|------|---------|-------|------------|
| **Coordinator** | Routes user intent. Answers questions using read tools. Dispatches modification work to subagents. | skeleton + chat history + selection | read tools + `dispatch_to(agentName, focus, brief)` | none (no write) |
| **PolishAgent** | Single-block text rewrites: rephrase, shorten, quantify, change tone. **Works on ANY text-bearing block** — bullet content, entry title, entry meta, section heading, or header.name — regardless of which section the block belongs to (Experience / Skills / Projects / Education etc.). Not restricted to experience. Cannot do structural ops (insert / delete / move). Header contact lines are out of v0 scope (see § 3.3). | skeleton + focus block (full content) | `update_bullet`, `update_entry_title`, `update_entry_meta`, `update_section_heading`, `update_header_name` | the focus block (during run) |
| **ExperienceAgent** | Structural + textual ops on experience sections only (one section at a time). Tools are runtime-guarded: any tool call whose target is not in a `section.role==='experience'` is rejected by the tool layer. **Does NOT have `update_header_name` or any header tool** — header is global and out of this agent's scope. | skeleton + entire experience section (full content) | `update_bullet`, `update_entry_title`, `update_entry_meta`, `update_section_heading` (only on experience sections), plus all `insert_*`, `delete_*`, `move_*` tools (also experience-scoped via runtime guard) | the entire experience section (during run) |

**Scope summary:** Skills / Projects / Education sections in v0 get **text polish only** via PolishAgent. Structural changes to those sections (add/delete/reorder Skills row etc.) are **out of v0 scope** — wait for v0.1 generic SectionAgent or v0.2 specialists. AC § 11 deliberately does not promise structural tailoring on non-experience sections.

### 4.2 `contextContract` (per-agent input shape)

Every agent declares what input it gets. The orchestrator builds the input payload from the contract.

```python
class ContextContract(TypedDict):
    detail: Literal["skeleton", "section", "block"]
    section_filter: list[str] | None     # for "section" — section roles to include in full
    focus_kind: Literal["block", "section", "none"]
    extra: dict | None                    # ad hoc per agent (chat history, etc.)

CONTRACTS = {
    "Coordinator":      ContextContract(detail="skeleton", focus_kind="none",
                                        extra={"chat_history": True}),
    "PolishAgent":      ContextContract(detail="block",     focus_kind="block",  extra=None),
    "ExperienceAgent":  ContextContract(detail="section",   section_filter=["experience"],
                                        focus_kind="section", extra=None),
}
```

**Skeleton shape (~200 tokens for typical 1-page resume):**

```json
{
  "header": {"id": "h", "name": "Fred Gao"},
  "sections": [
    {"id": "s1", "heading": "Experience", "role": "experience", "entries": [
      {"id": "e_snap", "title_excerpt": "Founding Engineer @ Snapbrillia", "bullet_count": 4},
      {"id": "e_lync", "title_excerpt": "Engineer @ Lync",                  "bullet_count": 3}
    ]},
    {"id": "s2", "heading": "Skills", "role": "skills", "entry_count": 4}
  ]
}
```

When `detail="section"` with `section_filter=["experience"]`, the section objects in `experience` are returned as full nested entries+bullets+content; other sections stay as skeleton.

When `detail="block"`, only the focus block's full content + skeleton are returned.

**Lazy escape hatch:** any agent can call `get_resume_block(id)` mid-run to fetch a block outside its default contract. Used for cross-section reasoning.

### 4.3 LangGraph orchestration shape

```
                     ┌─────────────────┐
   user input ──▶───▶│   Coordinator   │
                     └────┬────────────┘
                          │ decides
                  ┌───────┼───────────────┐
                  ▼       ▼               ▼
              answer   dispatch       dispatch
              user     PolishAgent    ExperienceAgent
              (no                       │
               agent)                   │ tool calls (write)
                          │             │   │
                          ▼             ▼   ▼
                       (one Suggestion)   Suggestions[]
                                         │
                                         ▼
                              END (run finalized,
                                  Suggestions transition
                                  streaming → pending)
```

**LangGraph state (`AIRunState`):**

```python
class AIRunState(TypedDict):
    run_id: str
    resume_id: str
    user_input: str
    selection: list[BlockId]
    chat_history: list[ChatMessage]
    coordinator_decision: dict | None     # {kind: "answer"|"dispatch", target?, focus?, brief?}
    pending_suggestions: list[Suggestion]
    status: Literal["running", "done", "error"]
    error: str | None
```

Edges:

- `Coordinator → PolishAgent` (conditional: decision.target == "PolishAgent")
- `Coordinator → ExperienceAgent` (conditional: decision.target == "ExperienceAgent")
- `Coordinator → END` (conditional: decision.kind == "answer", no dispatch)
- `PolishAgent → END`
- `ExperienceAgent → END`

v0 has no fan-out (sequential single-subagent dispatch per turn). v0.1 will add ReviewerAgent + multi-section parallel dispatch.

### 4.4 Streaming events (SSE)

`GET /api/ai/runs/{runId}/events` (Server-Sent Events). Event types:

```
event: run.started        data: {runId, agents: [...]}
event: agent.started      data: {agentId, lockedBlockIds: [...]}
event: agent.narration    data: {agentId, text}             # for chat narration
event: suggestion.streamed data: {suggestion: {...}}        # status="streaming"
event: agent.completed    data: {agentId, runId}
event: run.completed      data: {runId, suggestionIds: [...]}  # transition to "pending"
event: run.error          data: {runId, error}
```

Frontend `AISessionClient` consumes the stream and updates `useSuggestionStore` + chat narration state.

---

## 5. Suggestion Data Model + Apply Semantics

### 5.1 Schema (op-specific payloads — discriminated union)

`before`/`after` payload differs per op so concurrency checks have what they need. A single `BlockSnapshot` field is **insufficient** for `insert` / `delete` / `move` because those depend on the parent's children-id ordering, not just the affected block's content. Schema is a discriminated union on `op`:

```typescript
type SuggestionStatus = "streaming" | "pending" | "accepted" | "rejected" | "superseded";

// Common envelope shared by all variants:
interface SuggestionBase {
  id: string;
  runId: string;                 // groups Suggestions from one orchestration run
  agentId: string;
  resumeId: string;
  status: SuggestionStatus;
  createdAt: number;             // ms epoch — also defines batch apply order
  appliedAt?: number;            // set on accepted; cleared on transition back to pending
  rejectedAt?: number;           // set on rejected;  cleared on transition back to pending
  supersededAt?: number;         // set on superseded; cleared on transition back to pending
  source: { kind: "agent"; agentId: string; runId: string };
  // future-reserved (v0.1+): reviewerNote, reviewerStatus, supersededBy
}

type Suggestion =
  | UpdateSuggestion
  | InsertSuggestion
  | DeleteSuggestion
  | MoveSuggestion;

interface UpdateSuggestion extends SuggestionBase {
  op: "update";
  field: EditableField;          // ★ unambiguous target — discriminator for which field on which block
                                 // (existing v2 union: header.name / header.contact / section.heading /
                                 // entry.title / entry.meta / bullet.content)
  before: BlockContent;          // type derived from field.kind (see BlockContent below)
  after:  BlockContent;          // type derived from field.kind
}

interface InsertSuggestion extends SuggestionBase {
  op: "insert";
  parentId: BlockId;             // parent that receives the new child
  atIndex: number;               // intended index in parent.children at emit time
  beforeChildIds: BlockId[];     // parent.children ids snapshot at emit time
  insertedBlock: BlockSnapshot;  // the new block — id is a stable UUID minted by the tool layer at
                                 // emit time and persisted into the Suggestion record. Apply layer
                                 // passes this id to the insert action via the new optional
                                 // `forcedId` parameter (see § 0.5 rule #7) so the persisted block
                                 // id matches the suggestion record across reloads.
}

interface DeleteSuggestion extends SuggestionBase {
  op: "delete";
  parentId: BlockId;
  blockId: BlockId;              // child being deleted
  beforeChildIds: BlockId[];     // parent.children ids snapshot at emit time (must match for delete to apply)
  deletedBlock: BlockSnapshot;   // captured at emit so undo can restore exact content
}

interface MoveSuggestion extends SuggestionBase {
  op: "move";
  blockId: BlockId;              // block being moved
  fromParentId: BlockId;
  fromIndex: number;
  fromBeforeChildIds: BlockId[]; // source parent's children at emit time
  toParentId: BlockId;
  toIndex: number;
  toBeforeChildIds: BlockId[];   // dest parent's children at emit time
}

/**
 * Helper for sidebar grouping / scope filtering (UpdateSuggestion has no top-level
 * `blockId`, so derive one). Returns the block id this suggestion is "about" for
 * UI grouping purposes.
 */
function suggestionBlockId(s: Suggestion): BlockId {
  switch (s.op) {
    case "update":
      return s.field.kind === "header.name" || s.field.kind === "header.contact"
        ? "<header.id from current resume>"   // singleton header
        : s.field.id;
    case "insert": return s.parentId;          // grouping under parent
    case "delete": return s.blockId;
    case "move":   return s.blockId;
  }
}

// Content variants — type derived from UpdateSuggestion.field.kind (matches v2 store):
//   field.kind === "bullet.content"  → BlockContent = TipTapDoc
//   field.kind === "header.name"     → BlockContent = string
//   field.kind === "section.heading" → BlockContent = string
//   field.kind === "entry.title"     → BlockContent = string
//   field.kind === "entry.meta"      → BlockContent = string
//   (field.kind === "header.contact" is OUT of v0 scope — see § 3.3)
type BlockContent = TipTapDoc | string;          // disambiguated by sibling field.kind

type BlockSnapshot =
  | { kind: "bullet";  id: BlockId; content: TipTapDoc }                           // bullet.content
  | { kind: "entry";   id: BlockId; title: string; meta: string; bullets: BlockSnapshot[] }  // plain strings + nested
  | { kind: "section"; id: BlockId; heading: string; role: string; entries: BlockSnapshot[] };
```

**Concurrency check rules per op (run by frontend at apply time):**

| Op | Pass when | Fail mode |
|----|-----------|-----------|
| `update` | `currentValueFor(field) === before` (where `currentValueFor` reads the field per v2 schema) | superseded |
| `insert` | `parent(parentId).children.map(c => c.id) === beforeChildIds` AND `parentId` exists | superseded |
| `delete` | `parent(parentId).children.map(c => c.id) === beforeChildIds` AND `blockId` is in current children | superseded |
| `move`   | both `fromParent` and `toParent` exist AND each parent's current children-ids === captured `*BeforeChildIds` | superseded |

Equality:
- For `BlockContent` of `string` (entry.title / entry.meta / section.heading / header.name) → strict `===`.
- For `BlockContent` of `TipTapDoc` (bullet.content) → JSON-stringify-equality (TipTap docs are deterministic JSON in v2).
- For `beforeChildIds` arrays → element-wise `===`.

### 5.2 Apply semantics

**All apply logic is frontend-driven.** Backend endpoints exist only to record status transitions on the persisted Suggestion record. The actual mutation of the resume happens in `useResumeStore` and is persisted via the existing `flush-save.ts` → `PUT /api/resume/{id}` autosave path.

**Per-button UI mutex (concurrency on the button itself):** when the user clicks ✓ Accept on a Suggestion (or Accept-all on a run), the corresponding button enters a `disabledUntilSettled` state until the operation finishes (success, supersede, or error). Prevents double-fire from rapid clicks. Mutex lives in component state — no need for a transport-level `applying` SuggestionStatus, which would pollute the lifecycle state machine and reducer logic.

**Single accept (frontend `useSuggestionStore.accept(id)`):**

1. UI sets `disabledUntilSettled = true` on the row.
2. Read current Suggestion record from store. If status ≠ `pending`, abort silently (already settled).
3. Run the **op-specific concurrency check** (§ 5.1 table) against current `useResumeStore` state.
4. If check fails → set Suggestion status to `superseded` locally + `POST /api/ai/suggestions/{id}/status` body `{status:'superseded'}`; row UI shows "已被你修改 — 跳过"; release mutex; return.
5. If check passes → wrap step 6 in `_aiApplyTransaction(label, {runId}, fn)`. `fn` performs the mutation and **returns** `{appliedSuggestionIds: [id], mutated: true}`. Transaction snapshots the full ResumeDoc before, suppresses inner `_pushUndo`, and pushes ONE `aiApply` entry on the existing UndoStack with the returned ids — see § 8.
6. Inside the transaction `fn`: invoke the per-op composition from § 8.5 — for `update`(bullet) → `updateBullet`; for `update`(other) → `updateField`; for `insert` → `insertBullet/insertEntry` with `forcedId`; for `delete` → `deleteBullet/Entry/Section`; for `move` → `moveBullet/moveEntry`. **All of these are existing store actions; semantics frozen. The only additive change is the optional `forcedId` parameter on the `insert*` actions** (§ 0.5 rule #7).
7. Set Suggestion status to `accepted` locally + `POST /api/ai/suggestions/{id}/status` body `{status:'accepted'}`.
8. `flush-save.ts` autosave subscription detects the resume mutation and PUTs to `/api/resume/{id}`.
9. Release mutex.

**Batch accept (frontend `useSuggestionStore.acceptAll(runId, scope?)`):**

1. UI sets Accept-all button to `disabledUntilSettled = true`.
2. Build the candidate list: all `pending` Suggestions matching the run (and current sidebar scope if applicable), sorted by `createdAt` ascending (creation order — deterministic).
3. Wrap the loop in a SINGLE `_aiApplyTransaction(label, {runId}, fn)`. `fn` accumulates `appliedSuggestionIds` + `mutated` across iterations and returns them at the end (transaction helper reads from return value, not from upfront param):
   ```typescript
   const result = _aiApplyTransaction(label, {runId}, () => {
     const appliedSuggestionIds: string[] = [];
     let mutated = false;
     for (const cand of candidates) {
       // 4a. re-read current useResumeStore state
       // 4b. op-specific concurrency check
       if (!checkPasses(cand, current)) { skipped.push(cand.id); markSuperseded(cand); continue; }
       // 4c. apply via per-op composition (§ 8.5)
       applyComposition(cand);
       appliedSuggestionIds.push(cand.id);
       mutated = true;
     }
     return { appliedSuggestionIds, mutated };
   });
   ```
4. (See pseudocode above — loop body is steps 4a/4b/4c.)
5. After the transaction returns, POST status transitions per id (`accepted` for applied, `superseded` for skipped) — single batched HTTP call preferred (e.g., `POST /api/ai/suggestions:bulk-status` body `{updates: [{id, status}, ...]}`, or N parallel single-status posts; plan-level decision).
6. `flush-save.ts` autosave triggers once (Zustand subscriber debounced).
7. Release mutex. Return `{accepted: result.appliedSuggestionIds.length, skipped: skipped.length}` for sidebar to display.

**No `aiApplyBatch` kind** — the same `aiApply` undo entry shape is used; only `suggestionIds.length` differs.

**All-skipped batch:** if every candidate supersedes, `result.mutated === false` and the transaction helper skips the undo push (§ 8.2 guard). Status routes are still POSTed for the superseded markers. Sidebar shows the user a "0 accepted, N skipped" toast.

**Apply ordering:** strict createdAt order. The apply layer **re-resolves indices at each step** — e.g., if `insert_bullet(parent=e1, atIndex=2)` was emitted when `e1` had 3 children, but at apply time `e1` has 5 (because user added two), the concurrency check fails (`beforeChildIds` mismatch) and that suggestion supersedes. The next candidate is then evaluated against the now-current state. This guarantees ID stability + correctness across batches at the cost of accepting fewer changes when concurrent edits intervene — which is the right tradeoff for v0.

**Single reject (frontend `useSuggestionStore.reject(id)`):**

1. Set status `rejected` locally + `POST /api/ai/suggestions/{id}/status` body `{status:'rejected'}`.
2. No store mutation, no undo entry (nothing to undo).
3. Mutex pattern unchanged.

**Backend status route (single, body-discriminated — passive, record only):**

```
POST /api/ai/suggestions/{id}/status
  body: { status: "accepted" | "rejected" | "superseded" | "pending" }
```

**Timestamp side effects per target status (must be applied atomically with the status field write):**

| Target status | `appliedAt` | `rejectedAt` | `supersededAt` |
|---------------|-------------|--------------|----------------|
| `accepted`    | set to now  | clear        | clear          |
| `rejected`    | clear       | set to now   | clear          |
| `superseded`  | clear       | clear        | set to now     |
| `pending`     | **clear**   | **clear**    | **clear**      |

The `pending` target — used by the undo-driven status revert (§ 8.4) — explicitly clears all terminal-state timestamps. Without this, an undone-then-re-pending Suggestion would still carry a stale `appliedAt`, confusing the 24 h GC sweep and the sidebar's "accepted X minutes ago" display.

`supersededAt` is added to the `Suggestion` schema (was implicit before — § 5.1's `SuggestionBase` previously only declared `appliedAt` / `rejectedAt`; spec author note: add `supersededAt?: number` to the base alongside those).

The route is idempotent — re-POSTing the same status is a 200 no-op (timestamps not re-set). POSTing a transition that conflicts with the current state (e.g., already `rejected` → trying to set `accepted`) returns 200 + `{ok: false, current: <status>}` for v0 resilience; client respects current.

### 5.3 Persistence + retention

- Suggestion records stored server-side per resume (file: `saved_sessions/resumes/{id}/suggestions.json`, mirror of resume sidecar pattern; or new SQLite table — v0 chooses file for simplicity, in line with rest of repo).
- Records survive page reload; on resume open, frontend hydrates `useSuggestionStore` from `GET /api/ai/suggestions?resumeId={id}&status=pending,streaming`.
- **Retention rule (v0):** records with status ∈ {`accepted`, `rejected`, `superseded`} are kept for **24 hours** after their terminal transition then garbage-collected by a sidecar sweep. v0.1 may make this configurable.
- `streaming` Suggestions older than 5 minutes are also GC'd (assumed orphaned by a crashed run).

---

## 6. UX Surfaces

### 6.1 Sidebar

**Layout:**

- Width: 360 px
- Position: right-side, overlay on top of editor (does NOT push content) when there's room; pushes content (collapsing left nav first) when viewport < 1400 px
- Open / close: animation 200 ms ease-out
- Initial state on page load: closed

**Responsive collapse rules:**

| Viewport width | Left nav | Doc area | Sidebar |
|----------------|----------|----------|---------|
| ≥ 1400 px | full (240) | full (~800) | open (360, overlay-style; doc unaffected because viewport has room) |
| 1100 – 1399 px | collapsed (40 strip) | full | open (360, pushed) |
| < 1100 px | collapsed | shrunk to fit (~min 600) | open (360, pushed); doc may horizontal-scroll if shrunk past min |

**Content (single pane, scope-driven):**

Sidebar content depends on `useSelectionStore.selection`:

- `selection.length === 0`: shows ALL pending Suggestions for this resume (whole-doc view), grouped by `runId`.
- `selection` is one block: shows pending Suggestions whose `suggestionBlockId(s)` (helper from § 5.1; derives the target block id per op type — for `update` it reads `field.id` / `header.id`; for `insert/delete/move` it uses the explicit block ids on the variant) matches the selected block OR a descendant of it (e.g., selecting an entry → shows Suggestions on its bullets too).
- `selection` is multiple blocks: union of the above.

Each Suggestion row:

```
┌────────────────────────────────────────┐
│ Snapbrillia · bullet 2  ·  PolishAgent │  ← block path + agent badge
│ ─ Built features                       │  ← before (muted, strikethrough on hover)
│ + Shipped 3 LLM features serving 10k   │  ← after
│   DAU                                  │
│              [ ✓ Accept ] [ ✗ Reject ] │
└────────────────────────────────────────┘
```

If status=`streaming`: row appears with an animated `✦ generating...` strip; ✓/✗ buttons disabled.

If status=`superseded`: row is dimmed, label "已被你修改过 — 跳过" added; ✗ enabled, ✓ disabled.

Bottom of sidebar: `[ ✓ Accept all ]  [ ✗ Reject all ]` (only act on currently visible scope).

### 6.2 Soft lock — visual + structural protection

Lock state lives in `useAILockStore.lockedBlockIds: Set<BlockId>`. When an agent run starts, the orchestrator emits `agent.started` with `lockedBlockIds`; frontend adds them to the set. When `agent.completed` fires, frontend removes them. Lock acquirer expands its declared scope to **all descendants**: e.g., ExperienceAgent locking the `experience` section adds `section.id` + every `entry.id` + every `bullet.id` underneath.

**Visual treatment** (the "cool" part the user wants):

- Locked blocks: opacity 0.55 + 1 px subtle accent-colored border + slow ✦ pulse marker in the gutter (where ⋮⋮ lives)
- Other blocks: fully interactive — no visual change
- Lock releases on `agent.completed`; visual fades 200 ms ease-out

**Structural protection (mandatory — visual alone is not enough).** Every mutation entry point must check `useAILockStore` before acting:

| Entry point | Check | Behavior on locked |
|-------------|-------|---------------------|
| TipTap editor on a locked block | `editor.setEditable(false)` per locked field | Typing / IME blocked; cursor visible but inert |
| `DragController.startDrag(block)` | `block.id ∈ lockedBlockIds` | Return a no-op `DragSession`; pointer ignored |
| `DragController.commitDrop` | source.id OR target parentId ∈ lockedBlockIds | Abort commit, restore visual position |
| Keyboard delete / Backspace at structural boundary | any selected block id ∈ lockedBlockIds | Suppress; no store mutation |
| `Cmd+D` (duplicate selection) | any selected block id ∈ lockedBlockIds | Suppress |
| Toolbar structural buttons (delete-block etc.) | same | Disabled state in toolbar |
| Slash command insert | resolve cursor's parent block id; if ∈ lockedBlockIds | Suppress |
| Store actions (`moveSection`, `moveEntry`, `moveBullet`, `moveHeaderRow`, `insertBlock`, `deleteBlock`) | top-of-action check: any block in operation's affected set ∈ lockedBlockIds | No-op + console warn (last line of defense; UI should already block) |

**Why TipTap stays alive (not unmounted) during lock:** unmounting kills cursor, IME composition state, and per-field undo history — all of which are P0 v2 features we won't sacrifice. `editor.setEditable(false)` keeps the instance and just gates input. (Reinforces § 0.5 rule #3.)

Lock release reverses all above: `editor.setEditable(true)`, drag handlers re-enable, keyboard / toolbar guards pass through.

```
┌─────────────────── Editor ──────────────────┐
│ Header                                      │
│                                             │
│ ── Skills ──────────────────────────────── │
│  · Product & AI Development                 │
│  · Full-Stack Engineering                   │
│                                             │
│ ── Experience ─────────────────────────── ┐│
│ │ ✦  Snapbrillia · Founding Eng       50%││  ← locked section, dimmed
│ │ ✦    · Built features                  ││
│ │ ✦    · Did backend stuff               ││
│ │  …                                      ││
│ └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### 6.3 Inline marks (post-acceptance, persistence-bound)

After a Suggestion is `accepted`, the affected block carries an `inline mark` for a fade window (default **5 minutes**). The mark:

- Renders as a thin colored left border (green for new content, amber for changed) + a small ✦ glyph in the gutter
- Hovering the block surfaces a popover with `before` content (read from the accepted Suggestion record)
- Clicking the popover's "🗙 dismiss" clears the mark immediately

After the window expires, marks are cleared automatically. The Suggestion record itself remains until 24 h GC.

### 6.4 Chat integration

- Chat-triggered runs:
  1. User types → chat shows assistant reply ≤ 1 short sentence ("好的，让 ExperienceAgent 处理…")
  2. During run: chat appends an in-place narration line that updates ("✦ ExperienceAgent · 已生成 3/5 处建议") — this is a single message that re-renders, not multiple new messages
  3. Run done: chat appends a completion message: "提议了 5 处改动 — 3 处改写 / 2 处删除。 [📋 查看详情]"
  4. Click [📋 查看详情] → sidebar opens (if not already), scrolls/highlights the runId group
- ⋮⋮ double-click → sidebar opens; chat is untouched
- "答疑" turns (Coordinator answers without dispatching): plain chat message, no sidebar interaction

### 6.5 Selection ↔ Sidebar coupling

- Selection change while sidebar open → sidebar content re-filters to new scope
- Sidebar Suggestion row click → scrolls editor to that block + flashes the inline mark briefly
- Selecting nothing while sidebar open → reverts to whole-doc Suggestion view

---

## 7. Concurrency

**Optimistic supersede (the only real conflict mechanism):**

- Lock prevents concurrent edits on the locked block during agent run, eliminating mid-flight conflicts.
- After the agent run completes (Suggestions `pending`), the user can edit the same block.
- If user edits a block that has pending Suggestions → those Suggestions transition to `superseded` on the next apply attempt (their `before` no longer matches `current`).
- Sidebar listens to resume mutations; it can also proactively flag `superseded` state visually before the user hits accept.

**Edge cases:**

| Scenario | Outcome |
|----------|---------|
| User deletes a block with a pending `update` Suggestion | Suggestion → `superseded` |
| User edits a block then hits Accept on a stale Suggestion | Frontend `useSuggestionStore.accept` runs the op-specific concurrency check, fails it, marks Suggestion `superseded` locally, POSTs `/api/ai/suggestions/{id}/status` body `{status:'superseded'}`, updates the sidebar row inline. No HTTP 409 — the conflict is detected client-side before any backend call. |
| Two pending Suggestions on the same block from different runs | Both visible. Accepting one causes the other's `before` to no longer match → `superseded` on accept attempt |
| Lock acquired by Agent A, user attempts to type in locked block | TipTap blocks input (contenteditable=false); attempting clicks no-op silently |
| Soft lock fails to release (agent crashes) | Backend timeout (60 s) emits `run.error`, frontend releases lock + marks streaming Suggestions superseded |

---

## 8. Undo Integration

### 8.1 Constraints from existing v2 undo stack

Verified against `frontend/src/components/resume/v2/store/undo-stack.ts` and `useResumeStore.ts`:

- `UndoStack` stores entries shaped `{doc: ResumeDoc, label: string}` — **full resume snapshot per entry**, not partial.
- `useResumeStore.undo()` does `set({resume: past.doc, bulletMeta: {}})` — full document swap, no merge.
- `redo()` symmetric.
- `_pushUndo(label)` snapshots the whole current resume into the stack.
- `updateBullet(id, content, origin)` **already exists** as a store action; it does not push undo (TipTap history per field handles user typing). AI apply uses it directly — **no new primitive needed.** (An earlier draft proposed `setBulletContent`; that was a mistake — `updateBullet` already does the same job.)
- `updateField` for plain-string fields (entry.title / entry.meta / section.heading / header.name) also does not push undo.
- All `insert*` / `delete*` / `move*` / `setBulletKind` / `duplicate*` actions DO push undo. If AI apply naively invokes these and *also* pushes an `aiApply` entry, every accept produces 2 undo entries; batch accept produces N + 1; Cmd+Z behaviour becomes incoherent.

The AI apply design must work with this stack shape, not against it. We do not rewrite `UndoStack` / `undo()` / `redo()` — only minor additive extensions are needed.

### 8.2 Solution shape — three additive extensions

**(a) Suppression flag** so internal `_pushUndo` calls from `insert/delete/move` actions don't pollute the stack while a composite AI apply transaction runs:

```typescript
// useResumeStore.ts (additive)
let _undoSuppressed = false;

// _pushUndo gains ONE early-return line; everything else unchanged:
export function _pushUndo(label: string): void {
  if (_undoSuppressed) return;             // ★ NEW (only addition)
  const r = useResumeStore.getState().resume;
  if (!r) return;
  useResumeStore.getState()._undo.push({ doc: r, label });
}
```

**(b) Transaction helper** that snapshots the **full ResumeDoc BEFORE** running `fn`, suppresses inner pushes, and conditionally pushes ONE entry using the existing `{doc, label}` shape plus optional AI metadata. `fn` returns which suggestion ids ACTUALLY applied (only known mid-loop for batch) plus a `mutated` flag so the helper can skip the undo push when there's nothing to undo:

```typescript
// useResumeStore.ts (additive)
export type AiTxResult = {
  appliedSuggestionIds: string[];   // discovered during fn; empty when nothing applied
  mutated: boolean;                  // true iff fn actually changed `resume`
};

export function _aiApplyTransaction(
  label: string,
  meta: { runId: string },           // ★ no longer takes suggestionIds upfront — fn returns them
  fn: () => AiTxResult,
): AiTxResult {
  const r = useResumeStore.getState().resume;
  if (!r) return { appliedSuggestionIds: [], mutated: false };
  // Snapshot BEFORE: capture the entire ResumeDoc as it is RIGHT NOW.
  // Matches existing UndoEntry shape; works with existing undo()/redo() set({doc}).
  const snapshotBefore = r;

  const wasSuppressed = _undoSuppressed;
  _undoSuppressed = true;
  let result: AiTxResult;
  try {
    result = fn();
  } catch (err) {
    // ★ ATOMIC-ISH ROLLBACK: if fn threw mid-mutation, the resume may be in a
    // partially-applied state. Restore to snapshotBefore, do NOT push undo, do
    // NOT post any status transitions. Caller (useSuggestionStore.accept /
    // acceptAll) catches and surfaces the error to the user. Suggestions stay
    // in `pending` so the user can retry.
    useResumeStore.setState({ resume: snapshotBefore, bulletMeta: {} });
    throw err;
  } finally {
    _undoSuppressed = wasSuppressed;
  }

  // ★ GUARD: skip the undo push if nothing actually applied. Without this guard,
  // a batch where every Suggestion superseded would push a no-op entry that
  // Cmd+Z would "restore to identical state" — confusing.
  if (!result.mutated || result.appliedSuggestionIds.length === 0) return result;

  useResumeStore.getState()._undo.push({
    doc: snapshotBefore,
    label,
    kind: 'aiApply',
    runId: meta.runId,
    suggestionIds: result.appliedSuggestionIds,
  });
  return result;
}
```

**Single accept** is just batch-of-1: `fn` returns `{appliedSuggestionIds: [id], mutated: true}` on success, `{appliedSuggestionIds: [], mutated: false}` on supersede.

**Batch accept** `fn` accumulates `appliedSuggestionIds` and `mutated` across the loop and returns at the end.

**(c) `undo()` / `redo()` dispatch extension (~5 lines per direction)** — see § 8.4. Notifies a registered callback when an `aiApply` entry is undone/redone so the suggestion store can flip statuses.

### 8.3 UndoEntry type — additive optional fields

```typescript
// undo-stack.ts (additive — existing callers untouched)
export type UndoEntry = {
  doc: ResumeDoc;            // existing — full ResumeDoc snapshot
  label: string;             // existing
  // ★ NEW optional fields, only set by _aiApplyTransaction:
  kind?: 'aiApply';          // absent → existing structural undo entry
  runId?: string;
  suggestionIds?: string[];
};
```

The `UndoStack` class itself does not change — it's already a generic `UndoEntry`-stack. Only the type widens. Existing callers (`_pushUndo`) construct entries without `kind/runId/suggestionIds` exactly as today; behavior unchanged. **There is no separate `aiApplyBatch` kind** — single accept and batch accept both produce `aiApply` entries that differ only in `suggestionIds.length`.

### 8.4 `undo()` / `redo()` — minimal dispatch extension

Existing body keeps doing `set({resume: past.doc, bulletMeta: {}})` (full document swap from snapshot). We add a small dispatch on `entry.kind` that notifies the suggestion store about reverted AI applies, so accepted Suggestions flip back to `pending` (allowing re-accept) and stay in sync with the rolled-back doc state:

```typescript
// useResumeStore.ts (additive: ~5 lines per direction)
type AiApplyUndoDirection = 'undo' | 'redo' | 'redo:precheck';
type AiApplyUndoCallback = (
  suggestionIds: string[],
  direction: AiApplyUndoDirection,
) => boolean | void;          // boolean only meaningful for 'redo:precheck' (true = allow)
let _onAiApplyUndo: AiApplyUndoCallback | null = null;

// useSuggestionStore registers this once at module init:
export function _registerAiApplyUndoCallback(cb: AiApplyUndoCallback): void {
  _onAiApplyUndo = cb;
}

// undo() — existing body + 3 lines at the bottom:
undo: () => {
  const r = get().resume;
  if (!r) return;
  const past = get()._undo.popPast();
  if (!past) return;
  // ★ Future entry preserves the FULL shape (incl. kind/runId/suggestionIds)
  //   so that a subsequent redo still knows it's an aiApply entry:
  get()._undo.pushFuture({ ...past, doc: r, label: 'redo:' + past.label });
  set({ resume: past.doc, bulletMeta: {} });
  // ★ NEW: notify suggestion store if this was an AI apply
  if (past.kind === 'aiApply' && past.suggestionIds && _onAiApplyUndo) {
    _onAiApplyUndo(past.suggestionIds, 'undo');
  }
},

// redo() — explicit symmetric, with integrated AI precheck (§ 8.6):
redo: () => {
  const r = get().resume;
  if (!r) return;
  const fut = get()._undo.popFuture();
  if (!fut) return;
  // ★ AI precheck FIRST — before any doc swap or stack mutation.
  //   If any of fut.suggestionIds are no longer 'pending' (user rejected /
  //   superseded one of them after the undo), the suggestion-store callback
  //   returns false. Block the redo: re-push the future entry intact and
  //   return without swapping doc. Suggestion-store surfaces a toast.
  if (fut.kind === 'aiApply' && fut.suggestionIds && _onAiApplyUndo) {
    const allowed = _onAiApplyUndo(fut.suggestionIds, 'redo:precheck');
    if (allowed === false) {
      get()._undo.pushFuture(fut);   // restore: redo is non-destructive on block
      return;
    }
  }
  // Past entry preserves the FULL shape so chains of undo/redo keep AI metadata:
  get()._undo.push({ ...fut, doc: r, label: 'undo:' + fut.label });
  set({ resume: fut.doc, bulletMeta: {} });
  // Post-swap notification — flips suggestion statuses back to 'accepted':
  if (fut.kind === 'aiApply' && fut.suggestionIds && _onAiApplyUndo) {
    _onAiApplyUndo(fut.suggestionIds, 'redo');
  }
},
```

**Both directions spread `...past` / `...fut`** so `kind/runId/suggestionIds` survive arbitrary chains of undo/redo. Without this spread, the second undo/redo would see a future/past entry stripped of AI metadata and skip the callback — the doc would swap correctly but suggestion statuses would silently desync.

`useSuggestionStore` registers a callback that, on `'undo'`, flips its local copy of those suggestions back to `'pending'` and POSTs `/api/ai/suggestions/{id}/status` with `{status: 'pending'}` (route defined in § 5.2). On `'redo'`, flips back to `'accepted'`.

This is the **only** change to `undo()` / `redo()`. Structural undo (the 95% case) goes through unchanged because the new branch only fires when `entry.kind === 'aiApply'`.

### 8.5 Per-op apply procedures (called inside `_aiApplyTransaction`)

| Suggestion op | Composition inside the transaction `fn` |
|---------------|------------------------------------------|
| `update` (`field.kind === 'bullet.content'`) | `useResumeStore.getState().updateBullet(field.id, after, origin)` — **existing** action, doesn't push undo. No new primitive. |
| `update` (other field.kinds: header.name / section.heading / entry.title / entry.meta) | `useResumeStore.getState().updateField(field, after, origin)` — existing, doesn't push undo. |
| `insert` (bullet) | `insertBullet(parentEntryId, atIndex, content, origin, kind?, forcedId)` — existing action gains an optional `forcedId?: BlockId` param (§ 0.5 rule #7). Apply layer passes `insertedBlock.id` from the Suggestion so the persisted block id matches the suggestion record across reloads. Internal `_pushUndo` is suppressed by the transaction flag. |
| `insert` (entry) | Read **from `Suggestion.insertedBlock`** (which has the stable UUIDs minted at tool-emit, see § 3.3). Let `IB = Suggestion.insertedBlock`. Sequence:<br>1. `insertEntry(parentId, atIndex, origin, IB.id, IB.bullets[0].id)` — existing action gains two optional forced-id params.<br>2. `updateField({kind:'entry.title', id: IB.id}, IB.title, origin)`<br>3. `updateField({kind:'entry.meta', id: IB.id}, IB.meta, origin)`<br>4. For `IB.bullets[0]` → `updateBullet(IB.bullets[0].id, IB.bullets[0].content, origin)` (overwrites the provisional empty bullet `insertEntry` provisioned).<br>5. For `IB.bullets[1..n]` → `insertBullet(IB.id, i, IB.bullets[i].content, origin, undefined, IB.bullets[i].id)`.<br>All inside ONE outer `_aiApplyTransaction` → ONE composite `aiApply` undo entry. |
| `delete` (bullet/entry/section) | `deleteBullet(id, origin)` / `deleteEntry(id, origin)` / `deleteSection(id, origin)` — existing. Internal `_pushUndo` suppressed. |
| `move` (bullet/entry) | `moveBullet(...)` / `moveEntry(...)` — existing. Internal `_pushUndo` suppressed. |

**Corner case (TipTap focus + Cmd+Z):** If the user clicks into a TipTap field after an AI accept and immediately hits Cmd+Z, the existing toolbar-undo router sends the keystroke to TipTap (focused-bullet path). TipTap doesn't see the AI edit in its history (content arrived via reflective binding, not a TipTap op), so Cmd+Z there is a no-op (or undoes user's last typing). To undo the AI edit, defocus (click outside the field) and Cmd+Z routes to store undo, which swaps in the `aiApply` snapshot. This matches existing v2 store-vs-TipTap undo routing and is acceptable for v0.

### 8.6 Undo behaviors (user-facing)

- `Cmd+Z` after single accept → existing `undo()` swaps `resume` back to `snapshotBefore`. Dispatch hook flips the Suggestion's status `accepted` → `pending`. User can re-accept by clicking ✓ again, OR keep typing to mark it `superseded` on the next attempt.
- `Cmd+Z` after Accept-all → same: `resume` swaps back to the `snapshotBefore` taken at start of the batch transaction; ALL `suggestionIds` in the entry flip back to `pending`.
- Toolbar undo button: routes via existing logic (TipTap when bullet-focused, store undo otherwise). Unchanged.
- Redo (`Cmd+Shift+Z` / `Cmd+Y`): existing `redo()` swaps `resume` to the post-apply state again; dispatch hook flips suggestions `pending` → `accepted`.
- Reject is **not** undoable in v0 — rejected Suggestions can be regenerated by re-asking.

**Redo status-conflict rule (corner case — implementation in § 8.4 redo code block):** between the undo and the would-be redo, the user might manually reject or supersede some of the same Suggestions (e.g., they undo, then click ✗ Reject in the sidebar). Their statuses are then no longer `pending`. Without a guard, redo would optimistically flip `accepted` → `accepted` for those (backend refuses; frontend goes stale → doc state diverges from suggestion status).

**Rule:** the precheck (`'redo:precheck'` direction passed to `_onAiApplyUndo`) consults the suggestion-store. If ALL `suggestionIds` in the future entry are still in `pending`, callback returns `true` and redo proceeds. If any are not, callback returns `false`; `redo()` re-pushes the future entry intact and returns without swapping doc. Suggestion-store surfaces a toast: "Cannot redo — N change(s) were rejected after the undo. Use the sidebar to manually re-apply."

The future entry stays in the stack intact (same `suggestionIds`). The user can resolve the conflicting Suggestions in the sidebar (re-accept or leave rejected), then retry the redo — the precheck will pass once all ids are back to `pending`.

This block-and-notify approach is simpler than partial-redo (which would require splitting the future entry) and matches v0's "Suggestions are atomic per record" model. Cost: the user occasionally hits a redo that fails — acceptable v0 UX given the rarity of the scenario. The full integrated implementation lives in the `redo()` code block in § 8.4.

### 8.7 Memory bounds

Each `aiApply` entry stores a full `ResumeDoc` snapshot — same as existing structural entries. Matches the current shape and the existing `MAX_DEPTH=100` bound in `UndoStack`. For a 1-page resume (~5 KB JSON), worst-case stack memory is ~500 KB — acceptable. AI applies count against the same bound as drag/insert/delete; nothing new.

---

## 9. Persistence Summary

| What | Where | Lifetime |
|------|-------|----------|
| Resume doc | `saved_sessions/resumes/{id}/resume.json` (existing) | persistent |
| Suggestion records | `saved_sessions/resumes/{id}/suggestions.json` (NEW sidecar) | 24 h after terminal status, then GC |
| Inline mark window | `useSuggestionStore` in-memory + a `markUntil` timestamp on Suggestion record | 5 minutes after accept |
| Undo stack | `useResumeStore` in-memory | session lifetime (existing) |
| AI run state mid-flight | `services/ai/runs/{runId}.json` (NEW) | until `run.completed` + 5 min, then GC |
| Chat history | `useConversationStore` (`frontend/src/stores/conversation.ts`) for messages; `useAiPanelStore` (`frontend/src/stores/aiPanel.ts`) for panel open/height state | unchanged from current global AI panel |

---

## 10. Error Handling

| Failure | Detection | Recovery |
|---------|-----------|----------|
| LLM API timeout | per-call timeout 60 s | mark streaming Suggestions of run as superseded; emit `run.error`; chat shows "AI 超时，请重试"; release locks |
| Tool call references non-existent blockId | tool layer validates before emitting Suggestion | emit `agent.narration` "blockId X 不存在，跳过该步" — agent continues |
| Tool call out of agent's scope (e.g., PolishAgent calls `delete_bullet`) | tool layer scope guard | reject silently to LLM as a tool error; LLM gets the error and can recover |
| Frontend SSE stream drops | client `EventSource.onerror` | exponential reconnect; on reconnect, resume from last `eventId` if backend supports it (v0 just refetches `GET /api/ai/runs/{runId}`) |
| Backend crash mid-run | restart sweep marks orphan runs error | sidebar shows orphaned run as failed, suggestions purged |
| User clicks Accept while a previous Accept is still applying | UI mutex (§ 5.2 `disabledUntilSettled` per-button + frontend single-flight per-resume apply queue in `useSuggestionStore`) | second click is no-op (button disabled) until first apply settles; backend never sees overlapping mutations because frontend serializes |

**Runtime guards (cross-cutting):**

- Tool calls with malformed JSON content → reject with structured error (LLM retries)
- Suggestion payload must validate against the **op-specific schema** (§ 5.1 union):
  - `update` (bullet) → `after` is a parseable TipTapDoc; emit-time `before` snapshot is captured from current store
  - `update` (string fields) → `after` is a non-null string ≤ field-specific max length
  - `insert` → `parentId` resolves to an existing block; `beforeChildIds` matches current; `insertedBlock` schema-valid
  - `delete` → `parentId` + `blockId` both exist; `beforeChildIds` matches
  - `move` → both parents exist; both `beforeChildIds` match
  - Failure: tool returns `ToolError`, agent loop sees it and can recover or skip
- Each agent has a hard turn budget (8 tool calls / 6000 output tokens) — exceeding kills run with `run.error`

---

## 11. Acceptance Criteria

A v0 implementation is complete when **all** of the following pass against a fresh test resume:

1. **Read-only chat:** type "我现在简历里 experience 有几条 bullet?" → Coordinator answers correctly using `get_current_resume`. No sidebar opens.
2. **Polish single bullet:** select a bullet via ⋮⋮; type "改写得更动作化"; sidebar opens via [📋 查看详情] button; one Suggestion appears with correct `before`/`after`; Accept → bullet content updates, inline mark appears for 5 min, Cmd+Z undoes the accept.
3. **Tailor experience section:** type "按这段 JD tailor 整个 experience: <paste>"; experience section soft-locks during run (~10–30 s); chat narration progresses; sidebar opens to show ≥3 Suggestions of mixed types (update + insert + delete); Accept all → all applied as one undo unit.
4. **Optimistic supersede:** after a Suggestion is `pending`, edit the affected block manually; Suggestion row dims and shows "已被你修改 — 跳过"; Accept button disabled.
5. **Application history query:** type "我最近申请过哪些 PM 岗？"; Coordinator calls `get_application_history(filter status='applied')` (or similar) and answers correctly.
6. **Persistence:** start a run; reload page mid-flight; orphan run marked error; pending Suggestions from completed runs survive reload.
7. **Concurrent agents (deferred verification):** simulate 2 agents running in parallel locked on different sections; both progress independently; sidebar lists Suggestions grouped by `runId`. *(For v0 only one agent runs at a time per turn — this is a v0.1 prep AC.)*
8. **Soft lock UX:** during agent run, locked section is visibly dimmed with ✦ pulse; non-locked sections fully editable; lock releases at `agent.completed`.
9. **Backend new routes work:** `GET /api/jobs/`, `GET /api/jobs/{id}` return correct data from existing `job_tracker.json`.
10. **No regressions (per § 0.5 mandate):** the full v2 unit suite passes —

    ```bash
    cd frontend && npx vitest run src/components/resume/v2
    ```

    Required floor: every test passing on `feature/resume-editor-v2` HEAD before this feature lands must still pass. New tests add to that count.

    Manual smoke (run before merge): drag (section / entry / bullet / header-row, including same-section adjacent swap and cross-page); Notion-style Backspace on empty single-line + bullet outdent two-step; font picker; color / highlight; text alignment; IME composition (Chinese pinyin into name + bullet); soft-lock acquire → release → resume editing on same block. Sidebar open-state does not affect any of the above (verify drag works while sidebar is open).

---

## 12. Out of Scope (v0) — pushed to v0.1+

| Feature | Target version |
|---------|----------------|
| ReviewerAgent (revise / approve loop) | v0.1 |
| SkillsAgent / EducationAgent (parameterize SectionAgent) | v0.1 |
| Parallel multi-agent dispatch in one turn | v0.1 |
| Document-level version history / time travel | unscheduled |
| Style / template / font / color / alignment AI ops | v0.2 |
| `search_user_data` semantic search across user data | v0.2 |
| Dedicated JD input UI (separate from chat) | v0.2 |
| Inline AI quick-action menus / preset buttons | unscheduled |
| Proactive Observer agent | unscheduled |
| Real-time collaboration | unscheduled |
| Multi-LLM provider fallback | v0.2 |
| User-configurable agent behavior / system prompts | v0.2 |

---

## 13. Decision Record (full chain)

| # | Decision | Selected | Why |
|---|----------|----------|-----|
| 1 | Acceptance UX | Always sidebar | Simpler state machine; single block popover deferred |
| 2 | AI action radius | Text + structure (no styles) | Style/template AI is high-risk; defer |
| 3 | Apply mechanism | Tool calls (function calling) | Granular, validated, streamable, agent-agnostic |
| 4 | Routing rule (suggest vs preview) | Auto block-count + user toggle override | Sidebar always opens — routing was simplified out at decision 1 |
| 5 | Trigger model | Chat only + selection as focus | No preset action menus; chat is the single voice interface |
| 6 | Context contract | Per-agent declared (e + d hybrid) | Multi-agent ready; default = skeleton + focus |
| 7 | Snapshot mechanism | Per-tool-call before/after, persisted | Each tool call → one Suggestion; **`before` captured at tool-emit time** so optimistic supersede has something to compare against at apply time. Op-specific payload (§ 5.1 union) handles insert/move/delete parent-children-id snapshots. |
| 8 | Concurrency model | Optimistic supersede + soft lock visual | Lock prevents in-flight conflict; supersede catches post-pending edits |
| 9 | v0 agent inventory | Coordinator + PolishAgent + ExperienceAgent | Smallest slice that exercises full multi-agent path |
| 10 | Streaming UX | Suggestions stream visible + runId gates accept | Live feedback without enabling premature accept |
| 11 | Chat / sidebar split | Chat = narration, sidebar = detail; chat-triggered runs surface sidebar via button | Chat stays clean; sidebar opens on user demand |
| 12 | Chat omniscience | Coordinator has read-tools across user data | Behaves like Claude Code — fetches what it needs on demand |
| 13 | Undo integration | AI Apply pushes onto existing undo stack | Cmd+Z undoes accept; batch accepts as one unit |
| 14 | ~~Doc-level version history~~ | **Cut** | User deferred — uncertain it's worth building |
| 15 | ~~Cross-delete reference tracking~~ | **Cut** | Moot without history feature |
| 16 | Backend implementation lang | Python + LangGraph | Most mature LangGraph ecosystem; SSE to frontend |
| 17 | New backend routes | `GET /api/jobs/`, `GET /api/jobs/{id}` | Wraps existing `job_tracker.py` |

---

## 14. Open Questions (revisit before plan)

- **LLM provider for v0:** the existing `services/resume_*.py` use a `model_choice` parameter that suggests multi-provider support already exists. v0 should pick **one** primary (likely Anthropic Claude for tool-calling stability) and pass through `model_choice`. Decision deferred to plan.
- **Chat-history budget in Coordinator's context:** how many turns of chat to include? v0 default: last 10 turns or 4000 tokens, whichever lower. Tunable.
- **Cost / token budget per run:** spec hard-caps per-agent at 8 tool calls / 6000 output tokens. No hard $ cap in v0 (single user). Add observability via SSE event payloads.

(Removed: "Suggestion ordering for batch apply" — resolved in § 5.2 to **stable createdAt order + per-step re-resolve via op-specific concurrency check**. Failed items supersede; surviving items continue.)
