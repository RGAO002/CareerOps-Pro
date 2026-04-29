import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AskAIPill } from '../AskAIPill';
import { useAssistantStore } from '@/stores/assistant';

beforeEach(() => {
  useAssistantStore.setState({ pose: 'bar', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
});

describe('<AskAIPill>', () => {
  it('renders a button with "Ask AI"', () => {
    render(<AskAIPill blockId="b1" label="Experience" />);
    expect(screen.getByRole('button', { name: /ask ai/i })).toBeInTheDocument();
  });
  it('clicking → openSidebarWithScope', () => {
    render(<AskAIPill blockId="b1" label="Experience" />);
    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }));
    const s = useAssistantStore.getState();
    expect(s.pose).toBe('sidebar');
    expect(s.scope).toEqual({ blockId: 'b1', label: 'Experience' });
  });
});
