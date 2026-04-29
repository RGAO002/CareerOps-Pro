import { describe, it, expect, beforeEach } from 'vitest';
import { useAssistantStore } from '../assistant';

beforeEach(() => {
  // Reset to factory defaults between tests.
  useAssistantStore.setState({
    pose: 'bar',
    tab: 'chat',
    scope: null,
    targetAgent: 'all',
    activeRunId: null,
  });
});

describe('useAssistantStore', () => {
  it('defaults: pose=bar, tab=chat, scope=null, targetAgent=all, activeRunId=null', () => {
    const s = useAssistantStore.getState();
    expect(s.pose).toBe('bar');
    expect(s.tab).toBe('chat');
    expect(s.scope).toBeNull();
    expect(s.targetAgent).toBe('all');
    expect(s.activeRunId).toBeNull();
  });

  it('openSidebarWithScope sets pose=sidebar and scope object', () => {
    useAssistantStore.getState().openSidebarWithScope({ blockId: 'b1', label: 'Experience · Linear' });
    const s = useAssistantStore.getState();
    expect(s.pose).toBe('sidebar');
    expect(s.scope).toEqual({ blockId: 'b1', label: 'Experience · Linear' });
  });

  it('clearScope nulls scope but keeps pose', () => {
    useAssistantStore.setState({ pose: 'sidebar', scope: { blockId: 'x', label: 'X' } });
    useAssistantStore.getState().clearScope();
    const s = useAssistantStore.getState();
    expect(s.pose).toBe('sidebar');
    expect(s.scope).toBeNull();
  });

  it('setPose flips pose', () => {
    useAssistantStore.getState().setPose('orb');
    expect(useAssistantStore.getState().pose).toBe('orb');
  });

  it('setTab flips tab', () => {
    useAssistantStore.getState().setTab('suggestions');
    expect(useAssistantStore.getState().tab).toBe('suggestions');
  });

  it('setTargetAgent flips agent', () => {
    useAssistantStore.getState().setTargetAgent('hm');
    expect(useAssistantStore.getState().targetAgent).toBe('hm');
  });

  it('setActiveRunId tracks SSE-connected run', () => {
    useAssistantStore.getState().setActiveRunId('run_42');
    expect(useAssistantStore.getState().activeRunId).toBe('run_42');
    useAssistantStore.getState().setActiveRunId(null);
    expect(useAssistantStore.getState().activeRunId).toBeNull();
  });
});
