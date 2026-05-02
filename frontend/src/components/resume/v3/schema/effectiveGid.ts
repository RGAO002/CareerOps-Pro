import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { ResumeDocV3, GroupId } from './types';

/**
 * Compute the effective semanticGroupId for a row at the given index.
 *
 * Rules (spec § 2.2, revised 2026-05-02 — containment model):
 *
 *  - Non-plain rows: return their stored semanticGroupId (or null).
 *
 *  - Plain rows (BOTH empty and typed) — Rule 1 (containment):
 *    Use entry.title and section.heading rows as block boundaries.
 *      • Entry block: from an entry.title row up to (but not including) the
 *        next entry.title or section.heading or doc end. Section.heading
 *        does NOT participate as an entry boundary's start (entries live
 *        inside sections), but it DOES terminate the search going up
 *        (no entry.title found above the current section's heading).
 *      • Section block: from a section.heading row up to the next
 *        section.heading or doc end.
 *    If the row sits inside an entry block → return that entry's gid.
 *    Else if it sits inside a section block (after the heading, before
 *    any entry.title) → return that section's gid.
 *
 *  - Plain rows that fail Rule 1 (typically only the header area, before
 *    any section.heading) — Rule 2 (adjacency fallback):
 *      • Empty plain → null (independent).
 *      • Typed plain → look at i-1.
 *          - If i-1 is a non-plain row → take its stored semanticGroupId
 *            (or null if it has none, e.g. header.contact).
 *          - If i-1 is an empty plain → null (intervening blank breaks
 *            attribution).
 *          - If i-1 is a typed plain → recurse on i-1.
 *
 *  Why containment (Rule 1) before adjacency: a plain row visually wedged
 *  inside an entry's block "feels" like part of the entry regardless of
 *  how many blank lines are above or below it within that block. The
 *  earlier "look up N rows" rule produced surprises where a typed plain
 *  one or two blanks below the last bullet flipped from "in" to "out"
 *  depending on how many blanks the user happened to type.
 */
export function effectiveGid(doc: ResumeDocV3, i: number): GroupId | null {
  if (i < 0 || i >= doc.rows.length) return null;
  const row = doc.rows[i];
  if (row.kind !== 'plain') {
    return ('semanticGroupId' in row && row.semanticGroupId) || null;
  }

  // Rule 1: containment.
  const entryGid = enclosingEntryGid(doc, i);
  if (entryGid) return entryGid;
  const sectionGid = enclosingSectionGid(doc, i);
  if (sectionGid) return sectionGid;

  // Rule 2: adjacency fallback (only relevant for header-area plains).
  if (isPlainRowEmpty(row)) return null;
  if (i === 0) return null;
  const prev = doc.rows[i - 1];
  if (prev.kind === 'plain') {
    if (isPlainRowEmpty(prev)) return null;
    return effectiveGid(doc, i - 1);
  }
  return ('semanticGroupId' in prev && prev.semanticGroupId) || null;
}

function enclosingEntryGid(doc: ResumeDocV3, i: number): GroupId | null {
  // Walk back: find nearest entry.title; bail if we hit a section.heading first
  // (no entry above us within this section).
  let entryGid: GroupId | null = null;
  for (let j = i - 1; j >= 0; j--) {
    const r = doc.rows[j];
    if (r.kind === 'section.heading') return null;
    if (r.kind === 'entry.title') {
      entryGid = ('semanticGroupId' in r && r.semanticGroupId) || null;
      break;
    }
  }
  if (!entryGid) return null;
  // Walk forward: the entry block extends until the next entry.title or
  // section.heading (or doc end). If i is before that boundary it's in.
  for (let j = i + 1; j < doc.rows.length; j++) {
    const r = doc.rows[j];
    if (r.kind === 'entry.title' || r.kind === 'section.heading') {
      return entryGid; // i < j (true since j > i) → still in the entry
    }
  }
  // No closing boundary → entry runs to doc end → still in.
  return entryGid;
}

function enclosingSectionGid(doc: ResumeDocV3, i: number): GroupId | null {
  let sectionGid: GroupId | null = null;
  for (let j = i - 1; j >= 0; j--) {
    const r = doc.rows[j];
    if (r.kind === 'section.heading') {
      sectionGid = ('semanticGroupId' in r && r.semanticGroupId) || null;
      break;
    }
  }
  if (!sectionGid) return null;
  for (let j = i + 1; j < doc.rows.length; j++) {
    const r = doc.rows[j];
    if (r.kind === 'section.heading') return sectionGid;
  }
  return sectionGid;
}

function isPlainRowEmpty(row: { content: { content?: unknown[] } }): boolean {
  const docContent = row.content.content ?? [];
  for (const node of docContent) {
    if (typeof node !== 'object' || node === null) continue;
    const inline = (node as { content?: unknown[] }).content ?? [];
    if (inline.length > 0) return false;
  }
  return true;
}

/**
 * PM-doc variant of `effectiveGid` — same containment-then-adjacency rule,
 * reading from a live ProseMirror EditorState instead of a serialized
 * v3 doc. Returns one entry per top-level row in document order.
 */
export function effectiveGidsFromState(state: EditorState): (string | null)[] {
  const rows: PMNode[] = [];
  state.doc.forEach((node) => rows.push(node));
  const result: (string | null)[] = new Array(rows.length).fill(null);
  for (let i = 0; i < rows.length; i++) {
    result[i] = effectiveGidForNode(rows, i, result);
  }
  return result;
}

function nodeStoredGid(node: PMNode): string | null {
  const gid = (node.attrs.semanticGroupId as string | null | undefined) ?? null;
  return gid || null;
}

function isPMPlainEmpty(node: PMNode): boolean {
  return node.type.name === 'plain' && node.content.size === 0;
}

function enclosingEntryGidPM(rows: PMNode[], i: number): string | null {
  let entryGid: string | null = null;
  for (let j = i - 1; j >= 0; j--) {
    const r = rows[j];
    if (r.type.name === 'section_heading') return null;
    if (r.type.name === 'entry_title') {
      entryGid = nodeStoredGid(r);
      break;
    }
  }
  if (!entryGid) return null;
  for (let j = i + 1; j < rows.length; j++) {
    const r = rows[j];
    if (r.type.name === 'entry_title' || r.type.name === 'section_heading') {
      return entryGid;
    }
  }
  return entryGid;
}

function enclosingSectionGidPM(rows: PMNode[], i: number): string | null {
  let sectionGid: string | null = null;
  for (let j = i - 1; j >= 0; j--) {
    const r = rows[j];
    if (r.type.name === 'section_heading') {
      sectionGid = nodeStoredGid(r);
      break;
    }
  }
  if (!sectionGid) return null;
  for (let j = i + 1; j < rows.length; j++) {
    if (rows[j].type.name === 'section_heading') return sectionGid;
  }
  return sectionGid;
}

function effectiveGidForNode(
  rows: PMNode[],
  i: number,
  memo: (string | null)[],
): string | null {
  if (i < 0 || i >= rows.length) return null;
  const node = rows[i];
  if (node.type.name !== 'plain') {
    return nodeStoredGid(node);
  }
  // Rule 1: containment.
  const entryGid = enclosingEntryGidPM(rows, i);
  if (entryGid) return entryGid;
  const sectionGid = enclosingSectionGidPM(rows, i);
  if (sectionGid) return sectionGid;
  // Rule 2: adjacency fallback (header-area plains).
  if (isPMPlainEmpty(node)) return null;
  if (i === 0) return null;
  const prev = rows[i - 1];
  if (prev.type.name === 'plain') {
    if (isPMPlainEmpty(prev)) return null;
    return memo[i - 1]; // already resolved by left-to-right fill
  }
  return nodeStoredGid(prev);
}
