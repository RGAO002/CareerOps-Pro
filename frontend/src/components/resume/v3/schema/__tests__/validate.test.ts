import { describe, it, expect } from 'vitest';
import { validateResumeDoc, normalizeOnLoad, type ValidationError } from '../validate';
import type { GroupId, ResumeDocV3, RowId } from '../types';

const goodDoc: ResumeDocV3 = {
  schemaVersion: 3,
  rows: [
    { id: 'r1' as RowId, kind: 'header.name', content: { text: 'Test' } },
    { id: 'r2' as RowId, kind: 'section.heading', content: { text: 'Exp' }, semanticGroupId: 'g1' as GroupId },
    { id: 'r3' as RowId, kind: 'entry.title', content: { text: 'Job' }, semanticGroupId: 'g2' as GroupId },
  ],
  groups: [
    { id: 'g1' as GroupId, kind: 'section', role: 'experience' },
    { id: 'g2' as GroupId, kind: 'entry', parentSectionGroupId: 'g1' as GroupId },
  ],
};

describe('validateResumeDoc', () => {
  it('I1: accepts a valid doc', () => {
    const errors = validateResumeDoc(goodDoc);
    expect(errors).toEqual([]);
  });
  it('I1: row references a non-existent group', () => {
    const bad: ResumeDocV3 = { ...goodDoc, rows: [
      ...goodDoc.rows,
      { id: 'r4' as RowId, kind: 'bullet', content: { type: 'doc', content: [] }, semanticGroupId: 'g-nope' as GroupId },
    ] };
    const errors = validateResumeDoc(bad);
    expect(errors.some(e => e.code === 'I1')).toBe(true);
  });
  it('I2: entry group missing entry.title row', () => {
    // g2 declared but no entry.title row references it.
    const bad: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [{ id: 'r1' as RowId, kind: 'header.name', content: { text: 'X' } }],
      groups: [{ id: 'g2' as GroupId, kind: 'entry' }],
    };
    const errors = validateResumeDoc(bad);
    expect(errors.some(e => e.code === 'I2')).toBe(true);
  });
  it('I3: section group missing section.heading row', () => {
    const bad: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [{ id: 'r1' as RowId, kind: 'header.name', content: { text: 'X' } }],
      groups: [{ id: 'g1' as GroupId, kind: 'section', role: 'experience' }],
    };
    const errors = validateResumeDoc(bad);
    expect(errors.some(e => e.code === 'I3')).toBe(true);
  });
  it('I4: duplicate group ids', () => {
    const bad: ResumeDocV3 = {
      ...goodDoc,
      groups: [...goodDoc.groups, { id: 'g1' as GroupId, kind: 'section', role: 'projects' }],
    };
    const errors = validateResumeDoc(bad);
    expect(errors.some(e => e.code === 'I4')).toBe(true);
  });
});

describe('normalizeOnLoad', () => {
  it('inserts a header.name row if missing (defensive load-time fix per § 3.6)', () => {
    const missingName: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [{ id: 'r1' as RowId, kind: 'plain', content: { type: 'doc', content: [] } }],
      groups: [],
    };
    const fixed = normalizeOnLoad(missingName);
    expect(fixed.rows[0].kind).toBe('header.name');
    expect((fixed.rows[0] as Extract<typeof fixed.rows[0], { kind: 'header.name' }>).content.text).toBe('');
  });
  it('does not duplicate header.name when one already exists', () => {
    const fixed = normalizeOnLoad(goodDoc);
    const nameCount = fixed.rows.filter(r => r.kind === 'header.name').length;
    expect(nameCount).toBe(1);
  });
});
