import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runSSEStream } from '../AISessionClient';
import { useSuggestionStore } from '@/stores/aiSuggestion';
import { useAILockStore } from '@/stores/aiLock';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(url: string) { this.url = url; FakeEventSource.instances.push(this); }
  addEventListener(name: string, fn: (e: MessageEvent) => void) {
    (this.listeners[name] ||= []).push(fn);
  }
  close() {}
  emit(name: string, data: unknown) {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    (this.listeners[name] || []).forEach((fn) => fn(ev));
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  // @ts-expect-error
  global.EventSource = FakeEventSource;
  useSuggestionStore.setState({ byId: {}, byRun: {} });
  useAILockStore.setState({ lockedBlockIds: new Set() });
});

describe('runSSEStream', () => {
  it('locks blocks on agent.started + unlocks on agent.completed', async () => {
    const narrations: string[] = [];
    runSSEStream('run_1', { onNarration: (t) => narrations.push(t), onCompleted: () => {} });
    const es = FakeEventSource.instances[0];
    es.emit('agent.started', { agentId: 'PolishAgent', lockedBlockIds: ['b1'] });
    expect(useAILockStore.getState().isLocked('b1')).toBe(true);
    es.emit('agent.completed', { agentId: 'PolishAgent', runId: 'run_1' });
    expect(useAILockStore.getState().isLocked('b1')).toBe(false);
  });

  it('upserts suggestions on suggestion.streamed', async () => {
    runSSEStream('run_1', { onNarration: () => {}, onCompleted: () => {} });
    const es = FakeEventSource.instances[0];
    const s = { id: 'sug_x', runId: 'run_1', agentId: 'PolishAgent', resumeId: 'r1',
                status: 'streaming', createdAt: 1,
                source: { kind: 'agent', agentId: 'PolishAgent', runId: 'run_1' },
                op: 'update', field: { kind: 'entry.title', id: 'e1' },
                before: 'a', after: 'b' };
    es.emit('suggestion.streamed', { suggestion: s });
    expect(useSuggestionStore.getState().byId['sug_x']).toMatchObject({ id: 'sug_x' });
  });

  it('forwards narration text to onNarration callback', () => {
    const calls: string[] = [];
    runSSEStream('run_1', { onNarration: (t) => calls.push(t), onCompleted: () => {} });
    FakeEventSource.instances[0].emit('agent.narration', { agentId: 'Coordinator', text: 'hi' });
    expect(calls).toEqual(['hi']);
  });

  it('calls onCompleted with runId on run.completed', () => {
    const completed: string[] = [];
    runSSEStream('run_1', { onNarration: () => {}, onCompleted: (rid) => completed.push(rid) });
    FakeEventSource.instances[0].emit('run.completed', { runId: 'run_1', suggestionIds: ['a'], status: 'done' });
    expect(completed).toEqual(['run_1']);
  });

  it('forwards run.error to onError', () => {
    const errors: unknown[] = [];
    runSSEStream('run_1', { onNarration: () => {}, onCompleted: () => {}, onError: (e) => errors.push(e) });
    FakeEventSource.instances[0].emit('run.error', { runId: 'run_1', error: 'boom' });
    expect(errors).toEqual(['boom']);
  });
});
