import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarPose } from '../poses/SidebarPose';
import { useAssistantStore } from '@/stores/assistant';

vi.mock('next/navigation', () => ({ usePathname: () => '/editor' }));
vi.mock('../tabs/ChatTab',        () => ({ ChatTab:        () => <div data-testid="tab-chat" /> }));
vi.mock('../tabs/SuggestionsTab', () => ({ SuggestionsTab: () => <div data-testid="tab-sug" /> }));
vi.mock('../tabs/HistoryTab',     () => ({ HistoryTab:     () => <div data-testid="tab-hist" /> }));

beforeEach(() => {
  useAssistantStore.setState({ pose: 'sidebar', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
});

describe('<SidebarPose>', () => {
  it('renders the CSS shader bg, AI assistant header, three tabs, and the input', () => {
    const { container } = render(<SidebarPose />);
    // The translucent CSS shader element (.a-shader) replaces the WebGL FluidCanvas.
    expect(container.querySelector('.a-shader')).toBeTruthy();
    expect(screen.getByText('AI assistant')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /chat/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /suggestions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/reply or @ an agent/i)).toBeInTheDocument();
  });

  it('clicking the dock mini-button switches pose to bar (when allowed)', () => {
    // /editor disallows bar — but the dock button should still call setPose.
    // We don't enforce route restrictions inside this component.
    render(<SidebarPose />);
    fireEvent.click(screen.getByLabelText('Dock to bar'));
    expect(useAssistantStore.getState().pose).toBe('bar');
  });

  it('clicking the minimize mini-button switches pose to orb', () => {
    render(<SidebarPose />);
    fireEvent.click(screen.getByLabelText('Minimize to orb'));
    expect(useAssistantStore.getState().pose).toBe('orb');
  });

  it('switching tabs hides the footer on history', () => {
    render(<SidebarPose />);
    expect(screen.getByPlaceholderText(/reply or @ an agent/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    expect(screen.queryByPlaceholderText(/reply or @ an agent/i)).toBeNull();
  });

  it('quick chip click fills the input but does not send', () => {
    render(<SidebarPose />);
    fireEvent.click(screen.getByText('Tighten'));
    const input = screen.getByPlaceholderText(/reply or @ an agent/i) as HTMLInputElement;
    expect(input.value).toBe('Tighten');
  });
});
