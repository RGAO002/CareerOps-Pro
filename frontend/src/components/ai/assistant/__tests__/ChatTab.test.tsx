import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatTab } from '../tabs/ChatTab';
import { useConversationStore } from '@/stores/conversation';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';

const sug: Suggestion = {
  id: 's1', runId: 'r', agentId: 'PolishAgent', resumeId: 'rr',
  status: 'pending', createdAt: 1,
  source: { kind: 'agent', agentId: 'PolishAgent', runId: 'r' },
  op: 'update', field: { kind: 'entry.title', id: 'e1' },
  before: 'a', after: 'b',
};

beforeEach(() => {
  useConversationStore.setState({ messages: [] });
  useSuggestionStore.setState({ byId: { s1: sug }, byRun: { r: ['s1'] } });
});

describe('<ChatTab>', () => {
  it('shows an empty hint when the conversation is empty', () => {
    render(<ChatTab />);
    expect(screen.getByText(/no conversation yet/i)).toBeInTheDocument();
  });
  it('renders user bubbles, ai-text rows, and ai-diff cards in order', () => {
    useConversationStore.getState().appendMessage({ kind: 'user', content: 'tighten' });
    useConversationStore.getState().appendMessage({ kind: 'ai-text', content: 'on it' });
    useConversationStore.getState().appendMessage({ kind: 'ai-diff', suggestionId: 's1' });
    render(<ChatTab />);
    expect(screen.getByText('tighten')).toBeInTheDocument();
    expect(screen.getByText('on it')).toBeInTheDocument();
    // The diff card body shows the before & after of the suggestion
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });
});
