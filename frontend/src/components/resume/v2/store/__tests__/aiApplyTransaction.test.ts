import { describe, it, expect, beforeEach } from 'vitest';
import { useResumeStore, _pushUndo, _aiApplyTransaction, _registerAiApplyUndoCallback } from '../useResumeStore';
import type { ResumeDoc } from '../../types';

const FIXTURE: ResumeDoc = {
  schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [
    { id: 's1', role: 'experience', heading: 'Exp', entries: [
      { id: 'e1', title: '', meta: '', bullets: [
        { id: 'b1', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ]},
    ]},
  ],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  useResumeStore.setState({ resume: structuredClone(FIXTURE), bulletMeta: {} });
  useResumeStore.getState()._undo.clear();
  _registerAiApplyUndoCallback(null as unknown as never); // reset
});

describe('_aiApplyTransaction', () => {
  it('snapshots before, suppresses inner _pushUndo, pushes ONE entry with metadata', () => {
    const result = _aiApplyTransaction(
      'aiApply:single',
      { runId: 'run_1' },
      () => {
        _pushUndo('innerStructural');   // would normally push; should be suppressed
        useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'NEW' } }));
        return { appliedSuggestionIds: ['sug_a'], mutated: true };
      },
    );
    expect(result.mutated).toBe(true);
    expect(result.appliedSuggestionIds).toEqual(['sug_a']);
    // Undo stack has exactly ONE entry, with kind='aiApply' and runId/suggestionIds:
    const stack = useResumeStore.getState()._undo;
    expect(stack.canUndo()).toBe(true);
    // popPast and inspect:
    const past = stack.popPast()!;
    expect(past.label).toBe('aiApply:single');
    expect(past.kind).toBe('aiApply');
    expect(past.runId).toBe('run_1');
    expect(past.suggestionIds).toEqual(['sug_a']);
    // The doc snapshot is the BEFORE state (title was empty, not 'NEW'):
    expect(past.doc.title).toBe('');
  });

  it('skips push when fn returns mutated=false', () => {
    _aiApplyTransaction('aiApply:noop', { runId: 'r' }, () => ({
      appliedSuggestionIds: [], mutated: false,
    }));
    expect(useResumeStore.getState()._undo.canUndo()).toBe(false);
  });

  it('skips push when appliedSuggestionIds is empty even if mutated=true', () => {
    _aiApplyTransaction('aiApply:none-applied', { runId: 'r' }, () => {
      // This shouldn't happen in practice but the guard is defensive:
      return { appliedSuggestionIds: [], mutated: true };
    });
    expect(useResumeStore.getState()._undo.canUndo()).toBe(false);
  });

  it('rolls back resume on fn throw and does NOT push undo', () => {
    expect(() =>
      _aiApplyTransaction('aiApply:throws', { runId: 'r' }, () => {
        useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'PARTIAL' } }));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    // resume is rolled back to BEFORE:
    expect(useResumeStore.getState().resume!.title).toBe('');
    expect(useResumeStore.getState()._undo.canUndo()).toBe(false);
  });

  it('Cmd+Z (undo) restores from snapshot AND notifies suggestion callback with "undo"', () => {
    const calls: any[] = [];
    _registerAiApplyUndoCallback(((ids: string[], dir: string) => {
      calls.push({ ids, dir });
      return undefined;
    }) as unknown as never);
    _aiApplyTransaction('aiApply:1', { runId: 'r' }, () => {
      useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'AFTER' } }));
      return { appliedSuggestionIds: ['sug_1', 'sug_2'], mutated: true };
    });
    expect(useResumeStore.getState().resume!.title).toBe('AFTER');
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume!.title).toBe('');
    expect(calls).toEqual([{ ids: ['sug_1', 'sug_2'], dir: 'undo' }]);
  });

  it('redo precheck: callback returning false aborts redo (doc + future stack untouched)', () => {
    _registerAiApplyUndoCallback(((_ids: string[], dir: string) => {
      if (dir === 'redo:precheck') return false;
      return undefined;
    }) as unknown as never);
    _aiApplyTransaction('aiApply:1', { runId: 'r' }, () => {
      useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'AFTER' } }));
      return { appliedSuggestionIds: ['s1'], mutated: true };
    });
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume!.title).toBe('');
    // Now redo — precheck refuses:
    useResumeStore.getState().redo();
    // Doc not swapped:
    expect(useResumeStore.getState().resume!.title).toBe('');
    // Future entry preserved (canRedo still true):
    expect(useResumeStore.getState()._undo.canRedo()).toBe(true);
  });

  it('redo precheck: callback returning true (or no-op) proceeds and notifies "redo"', () => {
    const calls: string[] = [];
    _registerAiApplyUndoCallback(((_ids: string[], dir: string) => {
      calls.push(dir);
      return dir === 'redo:precheck' ? true : undefined;
    }) as unknown as never);
    _aiApplyTransaction('aiApply:1', { runId: 'r' }, () => {
      useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'AFTER' } }));
      return { appliedSuggestionIds: ['s1'], mutated: true };
    });
    useResumeStore.getState().undo();
    useResumeStore.getState().redo();
    expect(useResumeStore.getState().resume!.title).toBe('AFTER');
    expect(calls).toContain('undo');
    expect(calls).toContain('redo:precheck');
    expect(calls).toContain('redo');
  });
});

describe('regression: existing _pushUndo unchanged when not suppressed', () => {
  it('regular structural _pushUndo still works exactly as before', () => {
    _pushUndo('structuralOp');
    useResumeStore.setState((s) => ({ resume: { ...s.resume!, title: 'X' } }));
    expect(useResumeStore.getState()._undo.canUndo()).toBe(true);
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume!.title).toBe('');
  });
});
