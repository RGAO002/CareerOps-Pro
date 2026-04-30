import { describe, it, expect } from 'vitest';
import type { ResumeDocV3, ResumeRow, SemanticGroup, GroupOp, RowId, GroupId } from './types';

describe('ResumeDocV3 types', () => {
  it('compiles a fully-populated example', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'header.name', content: { text: 'Ruoping Gao' } },
        { id: 'r2' as RowId, kind: 'header.contact', content: { type: 'text', value: 'gao@example.com' } },
        { id: 'r3' as RowId, kind: 'section.heading', content: { text: 'Experience' }, semanticGroupId: 'g1' as GroupId },
        { id: 'r4' as RowId, kind: 'entry.title', content: { text: 'Senior PM' }, semanticGroupId: 'g2' as GroupId },
        { id: 'r5' as RowId, kind: 'entry.meta', content: { text: 'Stripe · 2022—Present' }, semanticGroupId: 'g2' as GroupId },
        { id: 'r6' as RowId, kind: 'bullet', content: { type: 'doc', content: [] }, semanticGroupId: 'g2' as GroupId },
        { id: 'r7' as RowId, kind: 'plain', content: { type: 'doc', content: [] } },
      ],
      groups: [
        { id: 'g1' as GroupId, kind: 'section', role: 'experience' },
        { id: 'g2' as GroupId, kind: 'entry', parentSectionGroupId: 'g1' as GroupId },
      ],
    };
    expect(doc.schemaVersion).toBe(3);
  });

  it('GroupOp variants exist for every lifecycle operation', () => {
    const ops: GroupOp[] = [
      { type: 'create', group: { id: 'g3' as GroupId, kind: 'section', role: 'skills' } },
      { type: 'delete', groupId: 'g3' as GroupId },
      { type: 'updateRole', groupId: 'g1' as GroupId, role: 'projects', label: 'Side Projects' },
      { type: 'updateParent', groupId: 'g2' as GroupId, parentSectionGroupId: 'g1' as GroupId },
    ];
    expect(ops).toHaveLength(4);
  });

  it('SemanticGroup is a discriminated union by kind', () => {
    const section: SemanticGroup = { id: 'g1' as GroupId, kind: 'section', role: 'experience' };
    const entry: SemanticGroup = { id: 'g2' as GroupId, kind: 'entry' };
    expect(section.kind).toBe('section');
    expect(entry.kind).toBe('entry');
  });
});
