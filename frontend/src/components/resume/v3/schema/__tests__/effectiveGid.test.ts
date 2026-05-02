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
});
