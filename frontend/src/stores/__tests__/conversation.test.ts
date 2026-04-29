import { describe, it, expect, beforeEach } from 'vitest';
import { useConversationStore, type Message } from '../conversation';

beforeEach(() => {
  useConversationStore.setState({ messages: [] });
});

describe('useConversationStore', () => {
  it('appends a user message with kind=user', () => {
    useConversationStore.getState().appendMessage({ kind: 'user', content: 'hi' });
    const m = useConversationStore.getState().messages[0];
    expect(m.kind).toBe('user');
    if (m.kind === 'user') expect(m.content).toBe('hi');
    expect(m.id).toBeTruthy();
    expect(m.createdAt).toBeGreaterThan(0);
  });

  it('appends an ai-text message with optional agentId', () => {
    useConversationStore.getState().appendMessage({
      kind: 'ai-text',
      content: 'Reviewing your bullet…',
      agentId: 'PolishAgent',
    });
    const m = useConversationStore.getState().messages[0];
    expect(m.kind).toBe('ai-text');
    if (m.kind === 'ai-text') {
      expect(m.content).toBe('Reviewing your bullet…');
      expect(m.agentId).toBe('PolishAgent');
    }
  });

  it('appends an ai-diff message referencing a suggestionId', () => {
    useConversationStore.getState().appendMessage({
      kind: 'ai-diff',
      suggestionId: 'sug_abc',
      agentId: 'PolishAgent',
    });
    const m = useConversationStore.getState().messages[0];
    expect(m.kind).toBe('ai-diff');
    if (m.kind === 'ai-diff') {
      expect(m.suggestionId).toBe('sug_abc');
      expect(m.agentId).toBe('PolishAgent');
    }
  });

  it('clearConversation empties the array', () => {
    useConversationStore.getState().appendMessage({ kind: 'user', content: 'x' });
    useConversationStore.getState().clearConversation();
    expect(useConversationStore.getState().messages).toEqual([]);
  });
});
