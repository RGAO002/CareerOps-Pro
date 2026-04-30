import type { GroupId, ResumeDocV3, RowId } from './types';

export type ValidationCode = 'I1' | 'I2' | 'I3' | 'I4' | 'I5';

export interface ValidationError {
  code: ValidationCode;
  message: string;
  rowId?: RowId;
  groupId?: GroupId;
}

export function validateResumeDoc(doc: ResumeDocV3): ValidationError[] {
  const errors: ValidationError[] = [];

  // I4: group id uniqueness.
  const seenGroupIds = new Set<GroupId>();
  for (const g of doc.groups) {
    if (seenGroupIds.has(g.id)) errors.push({ code: 'I4', message: `Duplicate groupId ${g.id}`, groupId: g.id });
    seenGroupIds.add(g.id);
  }

  const groupById = new Map(doc.groups.map((g) => [g.id, g]));

  // I1: every row.semanticGroupId references an existing group.
  for (const row of doc.rows) {
    if ('semanticGroupId' in row && row.semanticGroupId && !groupById.has(row.semanticGroupId)) {
      errors.push({ code: 'I1', message: `Row ${row.id} references missing group ${row.semanticGroupId}`, rowId: row.id });
    }
  }

  // I2 / I3: each declared group must have its anchor row present.
  for (const g of doc.groups) {
    if (g.kind === 'entry') {
      const hasTitle = doc.rows.some((r) => r.kind === 'entry.title' && 'semanticGroupId' in r && r.semanticGroupId === g.id);
      if (!hasTitle) errors.push({ code: 'I2', message: `Entry group ${g.id} has no entry.title row`, groupId: g.id });
    }
    if (g.kind === 'section') {
      const hasHeading = doc.rows.some((r) => r.kind === 'section.heading' && 'semanticGroupId' in r && r.semanticGroupId === g.id);
      if (!hasHeading) errors.push({ code: 'I3', message: `Section group ${g.id} has no section.heading row`, groupId: g.id });
    }
  }

  return errors;
}

/**
 * Apply defensive normalization on load (§ 3.6 fallback).
 * Currently: ensure exactly one header.name row exists at the top of the doc.
 */
export function normalizeOnLoad(doc: ResumeDocV3): ResumeDocV3 {
  const hasHeaderName = doc.rows.some((r) => r.kind === 'header.name');
  if (hasHeaderName) return doc;
  const headerNameRow: ResumeDocV3['rows'][number] = {
    id: cryptoRandomId() as RowId,
    kind: 'header.name',
    content: { text: '' },
  };
  return { ...doc, rows: [headerNameRow, ...doc.rows] };
}

function cryptoRandomId(): string {
  // Lightweight nanoid-style generator. Safe for in-memory test/runtime ids.
  const buf = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(buf);
  else { for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256); }
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
