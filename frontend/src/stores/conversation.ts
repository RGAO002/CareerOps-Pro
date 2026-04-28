import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  /** Unix ms */
  createdAt: number;
  /**
   * Optional inline action button rendered alongside the message
   * (e.g. "📋 查看详情" → open AI sidebar after a run completes).
   *
   * Note: callbacks aren't serialisable. The conversation store IS persisted
   * to localStorage, so on reload `action` will be missing — that's OK for v0
   * since the action only makes sense within the same SSE-run lifetime.
   */
  action?: { label: string; onClick: () => void };
}

interface ConversationStore {
  messages: Message[];
  /** Append a single message, auto-fills id and timestamp. */
  appendMessage: (msg: Omit<Message, "id" | "createdAt">) => void;
  /** Clear the entire conversation. */
  clearConversation: () => void;
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set) => ({
      messages: [],

      appendMessage: (msg) =>
        set((s) => ({
          messages: [
            ...s.messages,
            {
              ...msg,
              id: `${msg.role[0]}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              createdAt: Date.now(),
            },
          ],
        })),

      clearConversation: () => set({ messages: [] }),
    }),
    { name: "careerops-ai-conversation" },
  ),
);
