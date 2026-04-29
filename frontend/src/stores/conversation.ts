// frontend/src/stores/conversation.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Base {
  id: string;
  createdAt: number;
}

export type Message =
  | (Base & { kind: 'user'; content: string })
  | (Base & { kind: 'ai-text'; content: string; agentId?: string })
  | (Base & { kind: 'ai-diff'; suggestionId: string; agentId?: string });

export type NewMessage =
  | { kind: 'user'; content: string }
  | { kind: 'ai-text'; content: string; agentId?: string }
  | { kind: 'ai-diff'; suggestionId: string; agentId?: string };

interface ConversationStore {
  messages: Message[];
  appendMessage: (msg: NewMessage) => void;
  clearConversation: () => void;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set) => ({
      messages: [],

      appendMessage: (msg) =>
        set((s) => {
          const prefix = msg.kind === 'user' ? 'u' : msg.kind === 'ai-text' ? 'a' : 'd';
          const full: Message = {
            ...msg,
            id: nextId(prefix),
            createdAt: Date.now(),
          } as Message;
          return { messages: [...s.messages, full] };
        }),

      clearConversation: () => set({ messages: [] }),
    }),
    {
      name: 'careerops-ai-conversation',
      version: 2,
      migrate: (persisted: unknown, fromVersion: number): ConversationStore => {
        // v0 / v1 had `{ role: 'user'|'ai', content, action? }`. Map to the new union;
        // drop the unserialisable `action` field.
        const p = persisted as { messages?: Array<{ role?: 'user' | 'ai'; content?: string; id?: string; createdAt?: number }>; } | null;
        if (!p?.messages) return { messages: [], appendMessage: () => {}, clearConversation: () => {} } as unknown as ConversationStore;
        if (fromVersion >= 2) return p as unknown as ConversationStore;
        const upgraded: Message[] = p.messages
          .map((m) => {
            const base = { id: m.id ?? nextId('m'), createdAt: m.createdAt ?? Date.now() };
            if (m.role === 'user') return { ...base, kind: 'user', content: m.content ?? '' } satisfies Message;
            if (m.role === 'ai')   return { ...base, kind: 'ai-text', content: m.content ?? '' } satisfies Message;
            return null;
          })
          .filter((x): x is Message => x !== null);
        return { messages: upgraded, appendMessage: () => {}, clearConversation: () => {} } as unknown as ConversationStore;
      },
    },
  ),
);
