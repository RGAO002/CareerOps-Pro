import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AISidebar } from '../AISidebar';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { useAISidebarUIStore } from '@/stores/aiSidebarUI';

const mkSug = (id: string, fieldId: string, before: string, after: string): Suggestion => ({
  id, runId: 'run_1', agentId: 'PolishAgent', resumeId: 'r1',
  status: 'pending', createdAt: 1,
  source: { kind: 'agent', agentId: 'PolishAgent', runId: 'run_1' },
  op: 'update', field: { kind: 'entry.title', id: fieldId },
  before, after,
});

beforeEach(() => {
  useSuggestionStore.setState({ byId: {}, byRun: {} });
  useAISidebarUIStore.setState({ isOpen: true, scopedToBlockId: null });
  global.fetch = (() => Promise.resolve({ ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
});

describe('AISidebar', () => {
  it('renders all pending suggestions when no selection scope', () => {
    useSuggestionStore.getState().upsert(mkSug('a', 'e1', 'A', 'A2'));
    useSuggestionStore.getState().upsert(mkSug('b', 'e2', 'B', 'B2'));
    render(<AISidebar />);
    expect(screen.getByText(/A → A2/i)).toBeTruthy();
    expect(screen.getByText(/B → B2/i)).toBeTruthy();
  });

  it('filters to suggestions matching scopedToBlockId', () => {
    useSuggestionStore.getState().upsert(mkSug('a', 'e1', 'A', 'A2'));
    useSuggestionStore.getState().upsert(mkSug('b', 'e2', 'B', 'B2'));
    useAISidebarUIStore.setState({ isOpen: true, scopedToBlockId: 'e1' });
    render(<AISidebar />);
    expect(screen.queryByText(/A → A2/i)).toBeTruthy();
    expect(screen.queryByText(/B → B2/i)).toBeNull();
  });

  it('shows accept all button + reject all button', () => {
    useSuggestionStore.getState().upsert(mkSug('a', 'e1', 'A', 'A2'));
    render(<AISidebar />);
    expect(screen.getByRole('button', { name: /Accept all/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reject all/i })).toBeTruthy();
  });

  it('clicking row Accept disables button while in-flight', async () => {
    useSuggestionStore.getState().upsert(mkSug('a', 'e1', 'OldT', 'NewT'));
    // Stub useResumeStore so applySuggestion has something to mutate.
    const { useResumeStore } = await import('@/components/resume/v2/store/useResumeStore');
    useResumeStore.setState({
      resume: {
        schema_version: 2, id: 'r', title: '', template_id: 'minimal-single-column',
        header: { id: 'h', name: '', contact_lines: [] },
        sections: [{ id: 's1', role: 'experience', heading: 'E', entries: [
          { id: 'e1', title: 'OldT', meta: '', bullets: [] },
        ]}],
        metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
      },
      bulletMeta: {},
    });
    render(<AISidebar />);
    const btn = screen.getByRole('button', { name: /^✓ Accept$/ });
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
  });

  it('does not render when isOpen is false', () => {
    useAISidebarUIStore.setState({ isOpen: false, scopedToBlockId: null });
    const { container } = render(<AISidebar />);
    expect(container.firstChild).toBeNull();
  });
});
