// frontend/src/components/ai/AISessionClient.ts
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { useAILockStore } from '@/stores/aiLock';

export interface AISessionCallbacks {
  /** Called when an `agent.narration` event arrives — chat panel renders inline. */
  onNarration: (text: string, agentId: string) => void;
  /** Called when `run.completed` arrives — chat panel renders the
   *  "📋 View in sidebar" button + summary. */
  onCompleted: (runId: string, suggestionIds: string[], status: string) => void;
  /** Optional error handler. */
  onError?: (err: unknown) => void;
}

/**
 * Open an SSE connection to `/api/ai/runs/{runId}/events`, dispatch:
 *  - agent.started      → lock blocks
 *  - agent.narration    → onNarration
 *  - suggestion.streamed → upsert suggestion
 *  - agent.completed    → unlock blocks
 *  - run.completed      → onCompleted
 *
 * Returns a cleanup function the caller invokes on unmount.
 */
// FastAPI backend default; override via NEXT_PUBLIC_API_BASE for staging/prod.
const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) ||
  'http://localhost:8000';

export function runSSEStream(runId: string, cb: AISessionCallbacks): () => void {
  const es = new EventSource(`${API_BASE}/api/ai/runs/${runId}/events`);
  let lockedBlocksByAgent: Record<string, string[]> = {};

  es.addEventListener('agent.started', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    const ids: string[] = data.lockedBlockIds || [];
    lockedBlocksByAgent[data.agentId] = ids;
    useAILockStore.getState().lock(ids);
  });

  es.addEventListener('agent.narration', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    cb.onNarration(data.text, data.agentId);
  });

  es.addEventListener('suggestion.streamed', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    const s = data.suggestion as Suggestion;
    useSuggestionStore.getState().upsert(s);
  });

  es.addEventListener('agent.completed', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    const ids = lockedBlocksByAgent[data.agentId] || [];
    useAILockStore.getState().unlock(ids);
    delete lockedBlocksByAgent[data.agentId];
  });

  es.addEventListener('run.completed', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    cb.onCompleted(data.runId, data.suggestionIds || [], data.status || 'done');
    es.close();
  });

  es.addEventListener('error', (e: Event) => {
    cb.onError?.(e);
  });

  return () => es.close();
}
