import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { ResumeDocV3, GroupId } from './types';

/**
 * Compute the effective semanticGroupId for a row at the given index.
 *
 * Rules (spec § 2.2, revised 2026-05-02):
 *  - Non-plain rows: return their stored semanticGroupId attribute
 *  - Empty plain rows: null (independent)
 *  - Typed plain rows: look at most TYPED_PLAIN_LOOKBACK rows above
 *    (i-1, i-2). Inherit the first non-null effectiveGid found in that
 *    window. If both are null (or out of bounds), null (independent).
 *  - Doc start (i < lookback) typed plain: null when not enough rows above.
 *
 * Why bounded lookback: an empty plain represents an intentional visual
 * gap. Two empties in a row signal "I want this paragraph standalone";
 * one empty is just minor breathing room before continuing the same
 * entry. The 2-row window captures that intent without forcing users to
 * understand the "empty plain breaks attribution" rule.
 */
const TYPED_PLAIN_LOOKBACK = 2;

export function effectiveGid(doc: ResumeDocV3, i: number): GroupId | null {
  if (i < 0 || i >= doc.rows.length) return null;
  const row = doc.rows[i];
  if (row.kind !== 'plain') {
    return ('semanticGroupId' in row && row.semanticGroupId) || null;
  }
  // Empty plain: independent.
  if (isPlainRowEmpty(row)) return null;
  // Typed plain: scan up to TYPED_PLAIN_LOOKBACK rows above for an anchor.
  for (let step = 1; step <= TYPED_PLAIN_LOOKBACK; step++) {
    const j = i - step;
    if (j < 0) break;
    const gid = effectiveGid(doc, j);
    if (gid) return gid;
  }
  return null;
}

function isPlainRowEmpty(row: { content: { content?: unknown[] } }): boolean {
  const docContent = row.content.content ?? [];
  // RichText shape: { type:'doc', content:[{type:'paragraph', content:[inline...]}, ...] }
  // Empty when no paragraphs OR all paragraphs have empty inline content.
  for (const node of docContent) {
    if (typeof node !== 'object' || node === null) continue;
    const inline = (node as { content?: unknown[] }).content ?? [];
    if (inline.length > 0) return false;
  }
  return true;
}

/**
 * PM-doc variant of `effectiveGid` — same lazy rule, but reads from a live
 * ProseMirror `EditorState` instead of a serialized v3 doc.
 *
 * Use this from in-editor consumers (hover/scope, atom-aware decorations)
 * so typed plain rows correctly inherit their predecessor's gid even
 * though the schema attribute on plain nodes is always null.
 *
 * Returns one entry per top-level row in document order; index N corresponds
 * to the Nth `.row` element under the editor DOM.
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

function effectiveGidForNode(
  rows: PMNode[],
  i: number,
  memo: (string | null)[],
): string | null {
  if (i < 0 || i >= rows.length) return null;
  const node = rows[i];
  const isPlain = node.type.name === 'plain';
  if (!isPlain) {
    const gid = (node.attrs.semanticGroupId as string | null | undefined) ?? null;
    return gid || null;
  }
  // Empty plain (no inline children) → independent.
  if (node.content.size === 0) return null;
  // Typed plain → scan up to TYPED_PLAIN_LOOKBACK rows above. Memo is
  // filled left-to-right, so memo[i-step] is already resolved for step ≥ 1.
  for (let step = 1; step <= TYPED_PLAIN_LOOKBACK; step++) {
    const j = i - step;
    if (j < 0) break;
    const prev = memo[j];
    if (prev) return prev;
  }
  return null;
}
