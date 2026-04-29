import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DiffCard } from '../parts/DiffCard';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';

const sug: Suggestion = {
  id: 'sug_1', runId: 'run_1', agentId: 'PolishAgent', resumeId: 'r1',
  status: 'pending', createdAt: 1,
  source: { kind: 'agent', agentId: 'PolishAgent', runId: 'run_1' },
  op: 'update',
  field: { kind: 'entry.title', id: 'e1' },
  before: 'old title', after: 'new title',
};

beforeEach(() => {
  useSuggestionStore.setState({ byId: { sug_1: sug }, byRun: { run_1: ['sug_1'] } });
});

describe('<DiffCard>', () => {
  it('renders before strikethrough + after plain for an update suggestion', () => {
    render(<DiffCard suggestionId="sug_1" />);
    const beforeEl = screen.getByText('old title');
    const afterEl = screen.getByText('new title');
    expect(beforeEl).toBeInTheDocument();
    expect(afterEl).toBeInTheDocument();
    expect(window.getComputedStyle(beforeEl).textDecorationLine || '').toContain('line-through');
  });

  it('renders Accept / Tweak / Reject buttons for pending suggestions', () => {
    render(<DiffCard suggestionId="sug_1" />);
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tweak' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('Reject calls markStatusLocally + postStatusToBackend', async () => {
    const post = vi.spyOn(useSuggestionStore.getState(), 'postStatusToBackend').mockResolvedValue({ ok: true });
    render(<DiffCard suggestionId="sug_1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('sug_1', 'rejected');
    });
  });

  it('renders nothing if the suggestion id no longer exists', () => {
    useSuggestionStore.setState({ byId: {}, byRun: {} });
    const { container } = render(<DiffCard suggestionId="missing" />);
    expect(container.firstChild).toBeNull();
  });
});
