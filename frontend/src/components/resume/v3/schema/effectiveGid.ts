import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { ResumeDocV3, GroupId, ResumeRow } from './types';

/**
 * Compute the effective semanticGroupId for a row at the given index.
 *
 * Rules (spec § 2.2, revised 2026-05-02 — "block + adjacency"):
 *
 * Definitions:
 *   • entry-content row = entry.title, entry.meta, bullet (rows whose
 *     stored gid points at an entry group).
 *   • An entry's BLOCK = the contiguous span from its first entry-content
 *     row to its LAST entry-content row, inclusive. Plain rows that
 *     happen to fall inside that span (whether empty or typed) are part
 *     of the entry's block by position.
 *   • A section.heading row is its own kind of anchor (section-content).
 *
 * For a plain row at index i, with P = nearest non-plain above and
 * Q = nearest non-plain below:
 *
 *   Rule 1 — Block containment:
 *     If P and Q are both entry-content rows of the SAME entry → return
 *     that entry's gid. (User: "row 27 between row 20 title and row 32
 *     last bullet — row 27 is in the entry no matter what.")
 *
 *   Rule 2 — Trailing entry adjacency (P is entry-content):
 *     If this row is empty → null. (User: "row 33 right after the last
 *     bullet, still empty — doesn't belong.")
 *     If this row is typed AND no empty plain sits between P and i →
 *     return P's entry gid. (User: "row 33 was empty but the user typed
 *     into it — now it belongs.")
 *     If this row is typed but some empty plain sits between P and i →
 *     null. (User: "row 33 empty, row 34 typed — row 34 is independent
 *     because of the empty in between.")
 *
 *   Rule 3 — Trailing section adjacency (P is section.heading):
 *     Same shape as Rule 2 but using P's section gid. Covers plains
 *     between a section heading and its first entry.title.
 *
 *   Otherwise → null. (Header area, doc start, doc tail past the last
 *   entry-content with no surrounding anchors, etc.)
 */

export function effectiveGid(doc: ResumeDocV3, i: number): GroupId | null {
  if (i < 0 || i >= doc.rows.length) return null;
  const row = doc.rows[i];
  if (row.kind !== 'plain') {
    return ('semanticGroupId' in row && row.semanticGroupId) || null;
  }
  return computeForPlain(doc.rows, i, row);
}

type PlainRow = Extract<ResumeRow, { kind: 'plain' }>;

function computeForPlain(
  rows: ResumeRow[],
  i: number,
  row: PlainRow,
): GroupId | null {
  const pIdx = nearestNonPlainAbove(rows, i);
  const qIdx = nearestNonPlainBelow(rows, i);
  const pEntryGid = entryGidOf(rows, pIdx);
  const qEntryGid = entryGidOf(rows, qIdx);

  // Rule 1 — block containment (any plain inside same entry's content span).
  if (pEntryGid && pEntryGid === qEntryGid) return pEntryGid;

  // Rule 2 — trailing entry adjacency.
  if (pEntryGid) {
    if (isPlainRowEmpty(row)) return null;
    if (anyEmptyPlainBetween(rows, pIdx, i)) return null;
    return pEntryGid;
  }

  // Rule 3 — trailing section adjacency.
  const pSectionGid = sectionGidOf(rows, pIdx);
  if (pSectionGid) {
    if (isPlainRowEmpty(row)) return null;
    if (anyEmptyPlainBetween(rows, pIdx, i)) return null;
    return pSectionGid;
  }

  return null;
}

function nearestNonPlainAbove(rows: ResumeRow[], i: number): number {
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j].kind !== 'plain') return j;
  }
  return -1;
}

function nearestNonPlainBelow(rows: ResumeRow[], i: number): number {
  for (let j = i + 1; j < rows.length; j++) {
    if (rows[j].kind !== 'plain') return j;
  }
  return -1;
}

function entryGidOf(rows: ResumeRow[], j: number): GroupId | null {
  if (j < 0 || j >= rows.length) return null;
  const r = rows[j];
  if (r.kind === 'entry.title' || r.kind === 'entry.meta' || r.kind === 'bullet') {
    return ('semanticGroupId' in r && r.semanticGroupId) || null;
  }
  return null;
}

function sectionGidOf(rows: ResumeRow[], j: number): GroupId | null {
  if (j < 0 || j >= rows.length) return null;
  const r = rows[j];
  if (r.kind === 'section.heading') {
    return ('semanticGroupId' in r && r.semanticGroupId) || null;
  }
  return null;
}

function anyEmptyPlainBetween(rows: ResumeRow[], a: number, b: number): boolean {
  for (let k = a + 1; k < b; k++) {
    const r = rows[k];
    if (r.kind === 'plain' && isPlainRowEmpty(r)) return true;
  }
  return false;
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

// ─── PM-state mirror ──────────────────────────────────────────────────────

/**
 * PM-doc variant — same block + adjacency rule, reading from a live
 * ProseMirror EditorState. Returns one entry per top-level row.
 */
export function effectiveGidsFromState(state: EditorState): (string | null)[] {
  const rows: PMNode[] = [];
  state.doc.forEach((node) => rows.push(node));
  const result: (string | null)[] = new Array(rows.length).fill(null);
  for (let i = 0; i < rows.length; i++) {
    const node = rows[i];
    if (node.type.name !== 'plain') {
      result[i] = nodeStoredGid(node);
      continue;
    }
    result[i] = computeForPlainPM(rows, i, node);
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

function nearestNonPlainAbovePM(rows: PMNode[], i: number): number {
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j].type.name !== 'plain') return j;
  }
  return -1;
}

function nearestNonPlainBelowPM(rows: PMNode[], i: number): number {
  for (let j = i + 1; j < rows.length; j++) {
    if (rows[j].type.name !== 'plain') return j;
  }
  return -1;
}

function entryGidOfPM(rows: PMNode[], j: number): string | null {
  if (j < 0 || j >= rows.length) return null;
  const n = rows[j];
  const k = n.type.name;
  if (k === 'entry_title' || k === 'entry_meta' || k === 'bullet') {
    return nodeStoredGid(n);
  }
  return null;
}

function sectionGidOfPM(rows: PMNode[], j: number): string | null {
  if (j < 0 || j >= rows.length) return null;
  const n = rows[j];
  if (n.type.name === 'section_heading') return nodeStoredGid(n);
  return null;
}

function anyEmptyPlainBetweenPM(rows: PMNode[], a: number, b: number): boolean {
  for (let k = a + 1; k < b; k++) {
    if (isPMPlainEmpty(rows[k])) return true;
  }
  return false;
}

function computeForPlainPM(rows: PMNode[], i: number, node: PMNode): string | null {
  const pIdx = nearestNonPlainAbovePM(rows, i);
  const qIdx = nearestNonPlainBelowPM(rows, i);
  const pEntryGid = entryGidOfPM(rows, pIdx);
  const qEntryGid = entryGidOfPM(rows, qIdx);

  if (pEntryGid && pEntryGid === qEntryGid) return pEntryGid;

  if (pEntryGid) {
    if (isPMPlainEmpty(node)) return null;
    if (anyEmptyPlainBetweenPM(rows, pIdx, i)) return null;
    return pEntryGid;
  }

  const pSectionGid = sectionGidOfPM(rows, pIdx);
  if (pSectionGid) {
    if (isPMPlainEmpty(node)) return null;
    if (anyEmptyPlainBetweenPM(rows, pIdx, i)) return null;
    return pSectionGid;
  }

  return null;
}
