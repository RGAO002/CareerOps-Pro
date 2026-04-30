import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SuggestionsTab } from '../tabs/SuggestionsTab';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';

vi.mock('../parts/DiffCard', () => ({ DiffCard: ({ suggestionId }: { suggestionId: string }) => <div data-testid={`card-${suggestionId}`} /> }));

const mk = (id: string, status: Suggestion['status'] = 'pending'): Suggestion => ({
  id, runId: 'r', agentId: 'PolishAgent', resumeId: 'rr',
  status, createdAt: 1,
  source: { kind: 'agent', agentId: 'PolishAgent', runId: 'r' },
  op: 'update', field: { kind: 'entry.title', id: 'e1' },
  before: 'old', after: 'new',
});

beforeEach(() => {
  useSuggestionStore.setState({
    byId: {
      s1: mk('s1'),
      s2: mk('s2'),
      s3: mk('s3', 'rejected'),
    },
    byRun: { r: ['s1', 's2', 's3'] },
  });
});

describe('<SuggestionsTab>', () => {
  it('renders a summary line with the pending count and an Accept-all + Reject-all', () => {
    render(<SuggestionsTab />);
    expect(screen.getByText(/2 pending/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject all/i })).toBeInTheDocument();
  });

  it('renders one DiffCard per pending suggestion (rejected omitted)', () => {
    render(<SuggestionsTab />);
    expect(screen.getByTestId('card-s1')).toBeInTheDocument();
    expect(screen.getByTestId('card-s2')).toBeInTheDocument();
    expect(screen.queryByTestId('card-s3')).toBeNull();
  });

  it('shows an empty state when there are no pending suggestions', () => {
    useSuggestionStore.setState({ byId: { s3: mk('s3', 'rejected') }, byRun: { r: ['s3'] } });
    render(<SuggestionsTab />);
    expect(screen.getByText(/no pending changes/i)).toBeInTheDocument();
  });
});
