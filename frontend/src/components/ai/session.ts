// frontend/src/components/ai/session.ts
//
// Module-level SSE singleton. Holds the cleanup ref for the current /api/ai/run
// stream so pose changes / route changes do not sever an in-flight run.
//
// Why a module-level singleton instead of a hook: the previous implementation
// inlined runSSEStream inside AIChatPanel.send(). When the panel unmounted
// (pose change, route change, hot reload) the EventSource was garbage-collected
// and narrations stopped arriving. Lifting the connection out of the React
// tree means the only thing that closes it is a `run.completed` event or an
// explicit `cancelAssistantRun()`.
//
// Per spec § 0.5 rule #7 this is an additive surface; existing API contracts
// (`runSSEStream`, `useSuggestionStore`, `useConversationStore`) are unchanged.

import { runSSEStream } from './AISessionClient';
import { useAssistantStore } from '@/stores/assistant';
import { useConversationStore } from '@/stores/conversation';

const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) ||
  'http://localhost:8000';

let activeCleanup: (() => void) | null = null;

export interface StartRunArgs {
  resumeId: string;
  userInput: string;
  selection: unknown[];
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Kick off an AI run. Returns when /api/ai/run resolves (run id assigned);
 * SSE narrations / suggestions / completion arrive asynchronously after that
 * and dispatch into the existing zustand stores.
 *
 * Concurrent runs are serialised: starting a new run cancels any previous one.
 */
export async function startAssistantRun(args: StartRunArgs): Promise<string> {
  // Cancel any in-flight run before starting a new one.
  cancelAssistantRun();

  const targetAgent = useAssistantStore.getState().targetAgent;
  const r = await fetch(`${API_BASE}/api/ai/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeId: args.resumeId,
      userInput: args.userInput,
      selection: args.selection,
      chatHistory: args.chatHistory,
      targetAgent,  // v0: forwarded but ignored by backend
    }),
  });
  if (!r.ok) throw new Error(`/api/ai/run returned ${r.status}`);
  const { runId } = (await r.json()) as { runId: string };

  useAssistantStore.getState().setActiveRunId(runId);

  activeCleanup = runSSEStream(runId, {
    onNarration: (text, agentId) => {
      // v0: persona-less; agentId here is a backend-internal label
      // (e.g. "PolishAgent"), not a persona. Render plain.
      useConversationStore.getState().appendMessage({
        kind: 'ai-text',
        content: text,
        agentId,
      });
    },
    onCompleted: (_rid, _suggestionIds, _status) => {
      useAssistantStore.getState().setActiveRunId(null);
      activeCleanup = null;
    },
    onError: (err) => {
      useConversationStore.getState().appendMessage({
        kind: 'ai-text',
        content: `SSE error: ${String(err)}`,
      });
      useAssistantStore.getState().setActiveRunId(null);
      activeCleanup = null;
    },
  });

  // Subscribe to suggestion.streamed via the SAME EventSource that runSSEStream
  // owns. Since runSSEStream already dispatches into useSuggestionStore.upsert
  // for us, we layer on a tiny extra: also append an 'ai-diff' message into
  // the conversation so the Chat tab renders an inline diff card.
  //
  // To avoid double-handling we patch the suggestion store after-write rather
  // than re-subscribing to the EventSource. We use the store's subscribe API.
  const unsub = (await import('@/stores/aiSuggestion')).useSuggestionStore.subscribe(
    (state, prev) => {
      const newKeys = Object.keys(state.byId).filter((k) => !(k in prev.byId));
      for (const id of newKeys) {
        const s = state.byId[id];
        if (s.runId !== runId) continue;
        useConversationStore.getState().appendMessage({
          kind: 'ai-diff',
          suggestionId: s.id,
          agentId: s.agentId,
        });
      }
    },
  );

  // Wrap the cleanup to also unsubscribe.
  const innerClose = activeCleanup;
  activeCleanup = () => {
    unsub();
    innerClose?.();
  };

  return runId;
}

export function cancelAssistantRun(): void {
  activeCleanup?.();
  activeCleanup = null;
  useAssistantStore.getState().setActiveRunId(null);
}

/** Test-only reset hook. Not exported in the public surface. */
export function _resetSessionForTests(): void {
  activeCleanup = null;
}
