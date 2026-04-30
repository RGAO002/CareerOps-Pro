import { describe, it, expect, beforeEach } from 'vitest';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { applySuggestion, applyAllInRun, applySuggestions } from '../applySuggestion';
import type { ResumeDoc } from '@/components/resume/v2/types';

const FIXTURE: ResumeDoc = {
  schema_version: 2,
  id: 'r',
  title: '',
  template_id: 'minimal-single-column',
  header: { id: 'h', name: 'Fred', contact_lines: [] },
  sections: [
    {
      id: 's1',
      role: 'experience',
      heading: 'Exp',
      entries: [
        {
          id: 'e1',
          title: 'OldT',
          meta: 'OldM',
          bullets: [
            { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
          ],
        },
      ],
    },
  ],
  metadata: {
    created_at: '',
    updated_at: '',
    target_company: null,
    target_role: null,
    parent_id: null,
  },
};

const _b = {
  id: 'sug',
  runId: 'r',
  agentId: 'PolishAgent',
  resumeId: 'r',
  status: 'pending' as const,
  createdAt: 1,
  source: { kind: 'agent' as const, agentId: 'PolishAgent', runId: 'r' },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(FIXTURE), bulletMeta: {} });
  useResumeStore.getState()._undo.clear();
  useSuggestionStore.setState({ byId: {}, byRun: {} });
  // Stub fetch to no-op (we test status post separately):
  global.fetch = (() =>
    Promise.resolve({ ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
});

describe('applySuggestion: update entry.title', () => {
  it('mutates store and pushes ONE aiApply undo entry', async () => {
    const s: Suggestion = {
      ..._b,
      id: 'sug_1',
      op: 'update',
      field: { kind: 'entry.title', id: 'e1' },
      before: 'OldT',
      after: 'NewT',
    };
    useSuggestionStore.getState().upsert(s);
    const result = await applySuggestion('sug_1');
    expect(result.ok).toBe(true);
    const r = useResumeStore.getState().resume!;
    expect(r.sections[0].entries[0].title).toBe('NewT');
    // Undo restores:
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume!.sections[0].entries[0].title).toBe('OldT');
  });
});

describe('applySuggestion: update bullet.content', () => {
  it('uses existing updateBullet action', async () => {
    const before = { type: 'doc', content: [{ type: 'paragraph' }] };
    const after = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'X' }] }],
    };
    const s: Suggestion = {
      ..._b,
      id: 'sug_2',
      op: 'update',
      field: { kind: 'bullet.content', id: 'b1' },
      before,
      after,
    };
    useSuggestionStore.getState().upsert(s);
    const result = await applySuggestion('sug_2');
    expect(result.ok).toBe(true);
    expect(
      useResumeStore.getState().resume!.sections[0].entries[0].bullets[0].content,
    ).toEqual(after);
  });
});

describe('applySuggestion: insert bullet uses forcedId', () => {
  it('persisted block id matches Suggestion.insertedBlock.id', async () => {
    const s: Suggestion = {
      ..._b,
      id: 'sug_3',
      op: 'insert',
      parentId: 'e1',
      atIndex: 1,
      beforeChildIds: ['b1'],
      insertedBlock: {
        kind: 'bullet',
        id: 'forced-bullet-id',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
      },
    };
    useSuggestionStore.getState().upsert(s);
    await applySuggestion('sug_3');
    const bullets = useResumeStore.getState().resume!.sections[0].entries[0].bullets;
    expect(bullets[1].id).toBe('forced-bullet-id');
  });
});

describe('applySuggestion: superseded when before differs', () => {
  it('does not mutate, marks status superseded, returns ok:false', async () => {
    const s: Suggestion = {
      ..._b,
      id: 'sug_4',
      op: 'update',
      field: { kind: 'entry.title', id: 'e1' },
      before: 'WRONG',
      after: 'NewT',
    };
    useSuggestionStore.getState().upsert(s);
    const result = await applySuggestion('sug_4');
    expect(result.ok).toBe(false);
    expect(useSuggestionStore.getState().byId['sug_4'].status).toBe('superseded');
    expect(useResumeStore.getState().resume!.sections[0].entries[0].title).toBe('OldT');
  });
});

describe('applySuggestions (scope-respecting primitive)', () => {
  it('only applies the explicitly-passed ids; other pending in same run untouched', async () => {
    const s1: Suggestion = {
      ..._b,
      id: 'a',
      createdAt: 1,
      op: 'update',
      field: { kind: 'entry.title', id: 'e1' },
      before: 'OldT',
      after: 'NewT',
    };
    const s2: Suggestion = {
      ..._b,
      id: 'b',
      createdAt: 2,
      op: 'update',
      field: { kind: 'entry.meta', id: 'e1' },
      before: 'OldM',
      after: 'NewM',
    };
    useSuggestionStore.getState().upsert(s1);
    useSuggestionStore.getState().upsert(s2);
    // ★ Only pass ['a']: the sidebar-Accept-all scope path
    const result = await applySuggestions(['a']);
    expect(result).toEqual({ accepted: 1, skipped: 0 });
    const e = useResumeStore.getState().resume!.sections[0].entries[0];
    expect(e.title).toBe('NewT');
    expect(e.meta).toBe('OldM'); // ← s2 NOT applied
    expect(useSuggestionStore.getState().byId['b'].status).toBe('pending'); // ← still pending
  });

  it('groups by runId so each batch produces its own undo entry', async () => {
    const s1: Suggestion = {
      ..._b,
      id: 'a',
      runId: 'rA',
      createdAt: 1,
      op: 'update',
      field: { kind: 'entry.title', id: 'e1' },
      before: 'OldT',
      after: 'NewT',
    };
    const s2: Suggestion = {
      ..._b,
      id: 'b',
      runId: 'rB',
      createdAt: 2,
      op: 'update',
      field: { kind: 'entry.meta', id: 'e1' },
      before: 'OldM',
      after: 'NewM',
    };
    useSuggestionStore.getState().upsert(s1);
    useSuggestionStore.getState().upsert(s2);
    await applySuggestions(['a', 'b']);
    // Two undo entries (one per runId), each undo restores its own block:
    useResumeStore.getState().undo(); // pops the most recent (rB)
    expect(useResumeStore.getState().resume!.sections[0].entries[0].meta).toBe('OldM');
    expect(useResumeStore.getState().resume!.sections[0].entries[0].title).toBe('NewT'); // rA still applied
    useResumeStore.getState().undo(); // pops rA
    expect(useResumeStore.getState().resume!.sections[0].entries[0].title).toBe('OldT');
  });
});

describe('applyAllInRun (legacy wrapper)', () => {
  it('applies multiple suggestions in createdAt order, single undo entry', async () => {
    const s1: Suggestion = {
      ..._b,
      id: 'a',
      createdAt: 1,
      op: 'update',
      field: { kind: 'entry.title', id: 'e1' },
      before: 'OldT',
      after: 'NewT',
    };
    const s2: Suggestion = {
      ..._b,
      id: 'b',
      createdAt: 2,
      op: 'update',
      field: { kind: 'entry.meta', id: 'e1' },
      before: 'OldM',
      after: 'NewM',
    };
    useSuggestionStore.getState().upsert(s1);
    useSuggestionStore.getState().upsert(s2);
    const result = await applyAllInRun('r');
    expect(result.accepted).toBe(2);
    expect(result.skipped).toBe(0);
    const e = useResumeStore.getState().resume!.sections[0].entries[0];
    expect(e.title).toBe('NewT');
    expect(e.meta).toBe('NewM');
    // Single undo restores BOTH:
    useResumeStore.getState().undo();
    const eAfter = useResumeStore.getState().resume!.sections[0].entries[0];
    expect(eAfter.title).toBe('OldT');
    expect(eAfter.meta).toBe('OldM');
  });

  it('partial supersede: skipped item does not break the rest', async () => {
    const s1: Suggestion = {
      ..._b,
      id: 'a',
      createdAt: 1,
      op: 'update',
      field: { kind: 'entry.title', id: 'e1' },
      before: 'STALE',
      after: 'X',
    };
    const s2: Suggestion = {
      ..._b,
      id: 'b',
      createdAt: 2,
      op: 'update',
      field: { kind: 'entry.meta', id: 'e1' },
      before: 'OldM',
      after: 'NewM',
    };
    useSuggestionStore.getState().upsert(s1);
    useSuggestionStore.getState().upsert(s2);
    const result = await applyAllInRun('r');
    expect(result.accepted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(useSuggestionStore.getState().byId['a'].status).toBe('superseded');
    expect(useSuggestionStore.getState().byId['b'].status).toBe('accepted');
  });
});
