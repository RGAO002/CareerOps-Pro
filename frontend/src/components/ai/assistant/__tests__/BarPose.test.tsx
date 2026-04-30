import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BarPose } from '../poses/BarPose';
import { useAssistantStore } from '@/stores/assistant';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { startAssistantRun } from '@/components/ai/session';

vi.mock('@/components/ai/session', () => ({ startAssistantRun: vi.fn(async () => 'run_x') }));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

beforeEach(() => {
  useAssistantStore.setState({ pose: 'bar', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
  vi.clearAllMocks();
});

describe('<BarPose>', () => {
  it('renders the placeholder, ⌘K hint, and send button', () => {
    render(<BarPose />);
    expect(screen.getByPlaceholderText(/ask anything/i)).toBeInTheDocument();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
    expect(screen.getByLabelText('Send')).toBeInTheDocument();
  });

  it('Enter in input triggers startAssistantRun when a resume is loaded', async () => {
    useResumeStore.setState({
      resume: { id: 'r1', title: 't', alignments: {}, header: { name: 'n', contactLines: [] }, sections: [] } as never,
    } as never);
    render(<BarPose />);
    const input = screen.getByPlaceholderText(/ask anything/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tighten this' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(startAssistantRun).toHaveBeenCalledWith(
      expect.objectContaining({ resumeId: 'r1', userInput: 'tighten this' }),
    );
  });
});
