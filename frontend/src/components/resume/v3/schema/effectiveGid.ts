import type { ResumeDocV3, GroupId } from './types';

/**
 * Compute the effective semanticGroupId for a row at the given index.
 *
 * Rules (spec § 2.2):
 *  - Non-plain rows: return their stored semanticGroupId attribute
 *  - Empty plain rows: null (independent)
 *  - Typed plain rows: inherit the previous row's effectiveGid (recursive)
 *  - Doc start (i === 0) typed plain: null
 *
 * O(n) worst case (a chain of typed plains all the way back to the start).
 * For typical resume docs (<200 rows) this is acceptable on every read.
 */
export function effectiveGid(doc: ResumeDocV3, i: number): GroupId | null {
  if (i < 0 || i >= doc.rows.length) return null;
  const row = doc.rows[i];
  if (row.kind !== 'plain') {
    return ('semanticGroupId' in row && row.semanticGroupId) || null;
  }
  // Empty plain: independent.
  if (isPlainRowEmpty(row)) return null;
  // Typed plain: inherit from previous row.
  if (i === 0) return null;
  return effectiveGid(doc, i - 1);
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
