// frontend/src/components/resume/v2/types.test.ts
import { describe, it, expect } from 'vitest';
import type { ResumeDoc, BulletBlock } from './types';

describe('v2 types', () => {
  it('compiles a minimal valid ResumeDoc', () => {
    const doc: ResumeDoc = {
      schema_version: 2,
      id: 'r1',
      title: 'Test',
      template_id: 'minimal-single-column',
      header: { id: 'h1', name: 'A', contact_lines: [] },
      sections: [],
      metadata: {
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        target_company: null,
        target_role: null,
        parent_id: null,
      },
    };
    expect(doc.schema_version).toBe(2);
  });

  it('BulletBlock content is a 1-tuple', () => {
    const bullet: BulletBlock = {
      id: 'b1',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
      },
    };
    expect(bullet.content.content.length).toBe(1);
  });
});
