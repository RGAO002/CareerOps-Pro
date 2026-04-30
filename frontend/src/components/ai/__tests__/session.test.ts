import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAssistantStore } from '@/stores/assistant';
import { useConversationStore } from '@/stores/conversation';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { startAssistantRun, _resetSessionForTests } from '../session';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  useAssistantStore.setState({ pose: 'bar', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
  useConversationStore.setState({ messages: [] });
  useSuggestionStore.setState({ byId: {}, byRun: {} });
  _resetSessionForTests();
});

describe('startAssistantRun', () => {
  it('POSTs /api/ai/run with userInput, resumeId, selection, chatHistory, targetAgent and stashes activeRunId', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ runId: 'run_x' }) });
    // EventSource cannot be invoked in unit tests — stub it.
    class FakeES {
      addEventListener() {}
      close() {}
    }
    (global as unknown as { EventSource: typeof EventSource }).EventSource = FakeES as unknown as typeof EventSource;

    await startAssistantRun({
      resumeId: 'r1',
      userInput: 'tighten this bullet',
      selection: [],
      chatHistory: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/ai/run'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"targetAgent":"all"'),
      }),
    );
    expect(useAssistantStore.getState().activeRunId).toBe('run_x');
  });

  it('on a suggestion event, double-writes: useSuggestionStore.upsert + useConversationStore.appendMessage(kind=ai-diff)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ runId: 'run_y' }) });

    type Listener = (e: MessageEvent) => void;
    const listeners: { suggestion?: Listener; completed?: Listener } = {};
    class FakeES {
      addEventListener(type: string, fn: Listener) {
        if (type === 'suggestion.streamed') listeners.suggestion = fn;
        if (type === 'run.completed') listeners.completed = fn;
      }
      close() {}
    }
    (global as unknown as { EventSource: typeof EventSource }).EventSource = FakeES as unknown as typeof EventSource;

    await startAssistantRun({ resumeId: 'r1', userInput: 'x', selection: [], chatHistory: [] });

    const sug: Suggestion = {
      id: 'sug_1', runId: 'run_y', agentId: 'PolishAgent', resumeId: 'r1',
      status: 'pending', createdAt: 1,
      source: { kind: 'agent', agentId: 'PolishAgent', runId: 'run_y' },
      op: 'update',
      field: { kind: 'entry.title', id: 'e1' },
      before: 'old', after: 'new',
    };
    listeners.suggestion?.(new MessageEvent('m', { data: JSON.stringify({ suggestion: sug }) }));

    expect(useSuggestionStore.getState().byId['sug_1']).toEqual(sug);
    const msgs = useConversationStore.getState().messages;
    expect(msgs.length).toBe(1);
    expect(msgs[0].kind).toBe('ai-diff');
    if (msgs[0].kind === 'ai-diff') expect(msgs[0].suggestionId).toBe('sug_1');

    // run.completed clears activeRunId
    listeners.completed?.(new MessageEvent('m', { data: JSON.stringify({ runId: 'run_y', suggestionIds: ['sug_1'], status: 'done' }) }));
    expect(useAssistantStore.getState().activeRunId).toBeNull();
  });
});
