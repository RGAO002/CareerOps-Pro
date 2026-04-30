import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Assistant } from '../index';
import { useAssistantStore } from '@/stores/assistant';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('../keyboard', () => ({
  useAssistantKeyboard: () => {},
  useRoutePoseSync: () => {},
}));

vi.mock('../poses/BarPose',     () => ({ BarPose:     () => <div data-testid="pose-bar" /> }));
vi.mock('../poses/SidebarPose', () => ({ SidebarPose: () => <div data-testid="pose-sidebar" /> }));
vi.mock('../poses/OrbPose',     () => ({ OrbPose:     () => <div data-testid="pose-orb" /> }));

beforeEach(() => {
  useAssistantStore.setState({ pose: 'bar', tab: 'chat', scope: null, targetAgent: 'all', activeRunId: null });
});

describe('<Assistant>', () => {
  it('renders BarPose when pose=bar', () => {
    useAssistantStore.setState({ pose: 'bar' });
    render(<Assistant />);
    expect(screen.getByTestId('pose-bar')).toBeInTheDocument();
  });
  it('renders SidebarPose when pose=sidebar', () => {
    useAssistantStore.setState({ pose: 'sidebar' });
    render(<Assistant />);
    expect(screen.getByTestId('pose-sidebar')).toBeInTheDocument();
  });
  it('renders OrbPose when pose=orb', () => {
    useAssistantStore.setState({ pose: 'orb' });
    render(<Assistant />);
    expect(screen.getByTestId('pose-orb')).toBeInTheDocument();
  });
});
