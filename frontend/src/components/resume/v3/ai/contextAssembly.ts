// Spec ref: § 6.4 — AI context assembly.
//
// `assembleAIContext(state)` produces a human-semantic structure for LLM
// prompts: { header, sections → entries → rows, orphanRows }. The PM doc is
// NOT exposed to the AI; this file is the only adapter between PM doc + groups
// plugin state and the AI prompt context.
//
// F4 orphan-tolerant: rows whose group is missing from plugin state, or whose
// entry parent section is missing, never crash. They land in `orphanRows`
// or under their nearest preceding section as appropriate. Pure read function;
// never mutates state.
//
// IDs (rowId, groupId) are preserved so the AI can reference them in
// suggestions; the resolver in § 6.2 maps back to current PM positions.

import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { groupsPluginKey } from '../plugins/GroupsPlugin';
import type { GroupId, RowId, SectionRole, SemanticGroup } from '../schema/types';

export interface AIContextRow {
  rowId: RowId;
  kind: string;            // e.g. 'plain', 'bullet', 'entry.meta'
  text: string;            // plain-text content (marks stripped via PM textContent)
}

export interface AIContextEntry {
  groupId: GroupId;
  title: string;
  meta?: string;
  bullets: string[];       // bullet rows' text in document order
  otherRows: AIContextRow[]; // any plain rows tagged with this entry's gid
}

export interface AIContextSection {
  groupId: GroupId;
  role: SectionRole | 'custom';
  heading: string;
  entries: AIContextEntry[];
  directRows: AIContextRow[]; // plain/bullet rows directly in the section, no entry group
}

export interface AIContextHeader {
  name: string;
  contact: string[];
}

export interface AIContext {
  header: AIContextHeader;
  sections: AIContextSection[];
  orphanRows: AIContextRow[];
}

interface RowSnap {
  node: PMNode;
  rowId: RowId;
  kind: string;             // dotted form, e.g. 'header.name'
  groupId?: GroupId;
  text: string;
}

function snapshotRow(node: PMNode): RowSnap {
  const kind = node.type.name.replace('_', '.');
  const rowId = (node.attrs.id ?? '') as RowId;
  const rawGid = node.attrs.semanticGroupId as string | null | undefined;
  const groupId = rawGid ? (rawGid as GroupId) : undefined;
  return { node, rowId, kind, groupId, text: node.textContent };
}

function asRow(snap: RowSnap): AIContextRow {
  return { rowId: snap.rowId, kind: snap.kind, text: snap.text };
}

/**
 * Assemble human-semantic AI context from PM EditorState (doc + groups plugin).
 * Pure read; never throws on missing groups (F4 orphan-tolerant).
 */
export function assembleAIContext(state: EditorState): AIContext {
  const groupsState = groupsPluginKey.getState(state) ?? { byId: new Map<GroupId, SemanticGroup>() };
  const groupsById = groupsState.byId;

  // 1. Snapshot top-level rows in document order.
  const rows: RowSnap[] = [];
  state.doc.forEach((node) => rows.push(snapshotRow(node)));

  // 2. Header aggregation — name + contact rows are tagged by kind, not by group.
  let name = '';
  const contact: string[] = [];
  for (const r of rows) {
    if (r.kind === 'header.name') name = r.text;
    else if (r.kind === 'header.contact' && r.text) contact.push(r.text);
  }

  // 3. Build sections + entries by walking the doc.
  // - section.heading row opens a new section (must have a section group).
  // - entry.title row inside a section opens a new entry.
  // - bullet / plain / entry.meta rows attach to the current entry if any,
  //   otherwise to the current section's directRows, otherwise to orphanRows.
  // - F4: if a row's group resolves to one that doesn't match the current
  //   structural position (e.g. entry whose parent section group is missing
  //   from groups state), the row still lands somewhere — never crashes.
  const sections: AIContextSection[] = [];
  const orphanRows: AIContextRow[] = [];

  let currentSection: AIContextSection | null = null;
  let currentEntry: AIContextEntry | null = null;

  for (const r of rows) {
    if (r.kind === 'header.name' || r.kind === 'header.contact') continue;

    if (r.kind === 'section.heading') {
      // Open a new section. Resolve role from groups state if available.
      const gid = r.groupId;
      let role: SectionRole | 'custom' = 'custom';
      if (gid) {
        const g = groupsById.get(gid);
        if (g && g.kind === 'section') role = g.role;
      }
      currentSection = {
        groupId: gid ?? ('' as GroupId),
        role,
        heading: r.text,
        entries: [],
        directRows: [],
      };
      currentEntry = null;
      sections.push(currentSection);
      continue;
    }

    if (r.kind === 'entry.title') {
      // Open a new entry. F4: if entry's parent section group is missing OR
      // there's no current section, this is an orphan entry — drop its rows
      // into orphanRows by treating currentEntry as a synthetic free-floating
      // entry attached to no section. We still create an entry shell for
      // bullets/meta to attach to in document order.
      const gid = r.groupId;
      const g = gid ? groupsById.get(gid) : undefined;
      const parentSectionGid =
        g && g.kind === 'entry' ? g.parentSectionGroupId : undefined;

      // Validate: entry's parent section must match the current section's group
      // (if parent is specified). If mismatch or missing, treat as orphan.
      const isOrphanEntry =
        !currentSection ||
        (parentSectionGid !== undefined &&
          currentSection.groupId !== parentSectionGid) ||
        (gid !== undefined && g === undefined);
      // Note on the third check: if the row carries a groupId but the group
      // is absent from plugin state, we can't trust the structural position.
      // We still place the entry under currentSection if one exists (best
      // effort), but this branch flags genuinely-broken entries.

      if (isOrphanEntry) {
        // Push the entry.title itself + any subsequent attached rows as orphan
        // rows. Do NOT attach to any section.
        orphanRows.push(asRow(r));
        // Open a "phantom" entry whose owner is orphanRows, so subsequent
        // bullets/meta with this group land in orphanRows too.
        currentEntry = {
          groupId: gid ?? ('' as GroupId),
          title: r.text,
          bullets: [],
          otherRows: [],
        };
        // Mark so we can detect orphan status on subsequent rows.
        (currentEntry as { __orphan?: boolean }).__orphan = true;
        continue;
      }

      currentEntry = {
        groupId: gid ?? ('' as GroupId),
        title: r.text,
        bullets: [],
        otherRows: [],
      };
      currentSection!.entries.push(currentEntry);
      continue;
    }

    // bullet | plain | entry.meta
    const isEntryOrphan =
      currentEntry && (currentEntry as { __orphan?: boolean }).__orphan;

    if (r.kind === 'entry.meta') {
      if (currentEntry && !isEntryOrphan) {
        if (!currentEntry.meta) currentEntry.meta = r.text;
        else currentEntry.otherRows.push(asRow(r));
      } else if (currentEntry && isEntryOrphan) {
        orphanRows.push(asRow(r));
      } else if (currentSection) {
        currentSection.directRows.push(asRow(r));
      } else {
        orphanRows.push(asRow(r));
      }
      continue;
    }

    if (r.kind === 'bullet') {
      if (currentEntry && !isEntryOrphan) {
        currentEntry.bullets.push(r.text);
      } else if (currentEntry && isEntryOrphan) {
        orphanRows.push(asRow(r));
      } else if (currentSection) {
        currentSection.directRows.push(asRow(r));
      } else {
        orphanRows.push(asRow(r));
      }
      continue;
    }

    // 'plain' (or any other) — attach to entry.otherRows / section.directRows
    // / orphans depending on structural position.
    if (currentEntry && !isEntryOrphan) {
      currentEntry.otherRows.push(asRow(r));
    } else if (currentEntry && isEntryOrphan) {
      orphanRows.push(asRow(r));
    } else if (currentSection) {
      currentSection.directRows.push(asRow(r));
    } else {
      orphanRows.push(asRow(r));
    }
  }

  // Strip the internal __orphan marker before returning.
  for (const s of sections) {
    for (const e of s.entries) {
      delete (e as { __orphan?: boolean }).__orphan;
    }
  }

  return {
    header: { name, contact },
    sections,
    orphanRows,
  };
}
