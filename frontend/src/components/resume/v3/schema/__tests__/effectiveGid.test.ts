import { describe, it, expect } from 'vitest';
import type { ResumeDocV3, RowId, GroupId } from '../types';
import { effectiveGid } from '../effectiveGid';

describe('effectiveGid', () => {
  it('empty plain row returns null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'plain', content: { type: 'doc', content: [] } },
      ],
      groups: [],
    };
    expect(effectiveGid(doc, 0)).toBeNull();
  });

  it('typed plain after section.heading inherits section gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'section.heading', semanticGroupId: 'gSum' as GroupId, content: { text: 'Summary' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] } },
      ],
      groups: [{ id: 'gSum' as GroupId, kind: 'section', role: 'summary' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gSum');
  });

  it('typed plain after entry.title inherits entry gid', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'entry.title', semanticGroupId: 'gE' as GroupId, content: { text: 'Engineer' } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }] } },
      ],
      groups: [{ id: 'gE' as GroupId, kind: 'entry' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gE');
  });

  it('typed plain after bullet inherits entry gid (bullet has entry gid)', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'bullet', semanticGroupId: 'gE' as GroupId, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'shipped X' }] }] } },
        { id: 'r2' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'detail' }] }] } },
      ],
      groups: [{ id: 'gE' as GroupId, kind: 'entry' }],
    };
    expect(effectiveGid(doc, 1)).toBe('gE');
  });

  it('typed plain at doc start has no predecessor → null', () => {
    const doc: ResumeDocV3 = {
      schemaVersion: 3,
      rows: [
        { id: 'r1' as RowId, kind: 'plain', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'orphan' }] }] } },
      ],
      groups: [],
    };
    expect(effectiveGid(doc, 0)).toBeNull();
  });
});
