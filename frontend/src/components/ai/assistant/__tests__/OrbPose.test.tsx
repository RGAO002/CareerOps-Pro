import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrbPose } from '../poses/OrbPose';
import { useAssistantStore } from '@/stores/assistant';

beforeEach(() => {
  useAssistantStore.setState({ pose: 'orb', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
});

describe('<OrbPose>', () => {
  it('renders a button labelled "Open assistant" containing a sparkle SVG', () => {
    render(<OrbPose />);
    const btn = screen.getByLabelText('Open assistant');
    expect(btn).toBeInTheDocument();
    expect(btn.querySelector('svg')).toBeTruthy();
  });

  it('clicking the orb sets pose to sidebar', () => {
    render(<OrbPose />);
    fireEvent.click(screen.getByLabelText('Open assistant'));
    expect(useAssistantStore.getState().pose).toBe('sidebar');
  });
});
