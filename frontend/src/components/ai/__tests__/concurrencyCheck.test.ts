import { describe, it, expect } from 'vitest';
import { checkSuggestion } from '../concurrencyCheck';
import type { ResumeDoc } from '../../resume/v2/types';
import type { Suggestion } from '@/stores/aiSuggestion';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: 'Fred', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: 'OldT', meta: 'OldM', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
        { id: 'b2', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
    ]},
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

const _base = {
  id: 'sug', runId: 'r', agentId: 'PolishAgent', resumeId: 'r',
  status: 'pending' as const, createdAt: 1,
  source: { kind: 'agent' as const, agentId: 'PolishAgent', runId: 'r' },
};

describe('checkSuggestion: update', () => {
  it('passes when current value matches before (string field)', () => {
    const s: Suggestion = { ..._base, op: 'update', field: { kind: 'entry.title', id: 'e1' }, before: 'OldT', after: 'NewT' };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: true });
  });

  it('fails when current value differs (user edited it)', () => {
    const s: Suggestion = { ..._base, op: 'update', field: { kind: 'entry.title', id: 'e1' }, before: 'Stale', after: 'New' };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: false, reason: 'before_mismatch' });
  });

  it('passes for bullet content via JSON-stringify equality', () => {
    const before = { type: 'doc', content: [{ type: 'paragraph' }] };
    const s: Suggestion = { ..._base, op: 'update', field: { kind: 'bullet.content', id: 'b1' }, before, after: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: true });
  });
});

describe('checkSuggestion: insert', () => {
  it('passes when parent.children matches beforeChildIds', () => {
    const s: Suggestion = { ..._base, op: 'insert', parentId: 'e1', atIndex: 1,
      beforeChildIds: ['b1', 'b2'],
      insertedBlock: { kind: 'bullet', id: 'NEW', content: { type: 'doc', content: [] } } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: true });
  });

  it('fails when parent.children differs', () => {
    const s: Suggestion = { ..._base, op: 'insert', parentId: 'e1', atIndex: 1,
      beforeChildIds: ['b1'],   // user added a bullet since emit time
      insertedBlock: { kind: 'bullet', id: 'NEW', content: { type: 'doc', content: [] } } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: false, reason: 'beforeChildIds_mismatch' });
  });

  it('fails when parent does not exist', () => {
    const s: Suggestion = { ..._base, op: 'insert', parentId: 'gone', atIndex: 0,
      beforeChildIds: [],
      insertedBlock: { kind: 'bullet', id: 'NEW', content: { type: 'doc', content: [] } } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: false, reason: 'parent_missing' });
  });
});

describe('checkSuggestion: delete', () => {
  it('passes when parent and target both exist + childIds match', () => {
    const s: Suggestion = { ..._base, op: 'delete', parentId: 'e1', blockId: 'b1',
      beforeChildIds: ['b1', 'b2'],
      deletedBlock: { kind: 'bullet', id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: true });
  });

  it('fails when block already deleted by user', () => {
    const s: Suggestion = { ..._base, op: 'delete', parentId: 'e1', blockId: 'gone',
      beforeChildIds: ['b1', 'b2'],
      deletedBlock: { kind: 'bullet', id: 'gone', content: { type: 'doc', content: [] } } };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: false, reason: 'block_missing' });
  });
});

describe('checkSuggestion: move', () => {
  it('passes when both parents + childIds match', () => {
    const s: Suggestion = { ..._base, op: 'move', blockId: 'b1',
      fromParentId: 'e1', fromIndex: 0, fromBeforeChildIds: ['b1', 'b2'],
      toParentId: 'e1', toIndex: 1, toBeforeChildIds: ['b1', 'b2'] };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: true });
  });

  it('fails when fromParent gone', () => {
    const s: Suggestion = { ..._base, op: 'move', blockId: 'b1',
      fromParentId: 'gone', fromIndex: 0, fromBeforeChildIds: ['b1', 'b2'],
      toParentId: 'e1', toIndex: 0, toBeforeChildIds: ['b1', 'b2'] };
    expect(checkSuggestion(s, RESUME)).toEqual({ ok: false, reason: 'parent_missing' });
  });
});
