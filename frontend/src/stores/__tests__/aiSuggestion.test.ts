import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSuggestionStore, type Suggestion } from '../aiSuggestion';

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  useSuggestionStore.setState({ byId: {}, byRun: {} });
});

const sampleSuggestion: Suggestion = {
  id: 'sug_1', runId: 'run_1', agentId: 'PolishAgent', resumeId: 'r1',
  status: 'pending', createdAt: 1,
  source: { kind: 'agent', agentId: 'PolishAgent', runId: 'run_1' },
  op: 'update',
  field: { kind: 'entry.title', id: 'e1' },
  before: 'old', after: 'new',
};

describe('useSuggestionStore.hydrate', () => {
  it('fetches GET /api/ai/suggestions and indexes into byId + byRun', async () => {
    mockFetch.mockResolvedValue({
      ok: true, json: async () => ({ suggestions: [sampleSuggestion] }),
    });
    await useSuggestionStore.getState().hydrate('r1');
    const state = useSuggestionStore.getState();
    expect(state.byId['sug_1']).toEqual(sampleSuggestion);
    expect(state.byRun['run_1']).toEqual(['sug_1']);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/ai/suggestions'),
      expect.anything(),
    );
  });
});

describe('useSuggestionStore.markStatusLocally', () => {
  it('flips status + clears non-target timestamps', () => {
    useSuggestionStore.setState({
      byId: { sug_1: { ...sampleSuggestion, status: 'accepted', appliedAt: 100 } },
      byRun: { run_1: ['sug_1'] },
    });
    useSuggestionStore.getState().markStatusLocally('sug_1', 'pending');
    const s = useSuggestionStore.getState().byId['sug_1'];
    expect(s.status).toBe('pending');
    expect(s.appliedAt).toBeUndefined();
  });
});

describe('useSuggestionStore.allInRunArePending', () => {
  it('returns true only when every suggestion of the run is pending', () => {
    useSuggestionStore.setState({
      byId: {
        a: { ...sampleSuggestion, id: 'a', status: 'pending' },
        b: { ...sampleSuggestion, id: 'b', status: 'pending' },
      },
      byRun: { run_1: ['a', 'b'] },
    });
    expect(useSuggestionStore.getState().allInRunArePending(['a', 'b'])).toBe(true);
    useSuggestionStore.setState({
      byId: {
        a: { ...sampleSuggestion, id: 'a', status: 'pending' },
        b: { ...sampleSuggestion, id: 'b', status: 'rejected' },
      },
      byRun: { run_1: ['a', 'b'] },
    });
    expect(useSuggestionStore.getState().allInRunArePending(['a', 'b'])).toBe(false);
  });
});
