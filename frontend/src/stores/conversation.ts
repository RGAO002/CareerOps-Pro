import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  /** Unix ms */
  createdAt: number;
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
