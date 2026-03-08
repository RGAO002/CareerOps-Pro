"use client";

import { useCallback, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/api/review/ws";

export type MessageRole = "system" | "model_a" | "model_b" | "user";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  modelName?: string;
  modelId?: string;
  type: "draft" | "review" | "final" | "user" | "system" | "pick_result";
  content: string;
  rationale?: string;
  round?: number;
  timestamp: number;
}

export interface FinalVersion {
  model_id: string;
  label: string;
  content: string;
  rationale: string;
}

interface ReviewState {
  connected: boolean;
  messages: ChatMessage[];
  finals: FinalVersion[];
  phase: "idle" | "drafting" | "reviewing" | "picking" | "done";
  error: string | null;
}

let msgCounter = 0;
function nextId() {
  return `msg_${++msgCounter}_${Date.now()}`;
}

export function useReviewSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ReviewState>({
    connected: false,
    messages: [],
    finals: [],
    phase: "idle",
    error: null,
  });

  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    setState((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        { ...msg, id: nextId(), timestamp: Date.now() },
      ],
    }));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((prev) => ({ ...prev, connected: true, error: null }));
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, connected: false }));
    };

    ws.onerror = () => {
      setState((prev) => ({
        ...prev,
        error: "WebSocket connection failed. Is the API server running?",
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "round_start":
          addMessage({
            role: "system",
            type: "system",
            content: `— Round ${data.round} —`,
            round: data.round,
          });
          setState((prev) => ({
            ...prev,
            phase: data.round === 1 ? "drafting" : "reviewing",
          }));
          break;

        case "model_draft":
          addMessage({
            role: data.model_id === "model_a" ? "model_a" : "model_b",
            modelName: data.model_name,
            modelId: data.model_id,
            type: "draft",
            content: data.content,
            round: data.round,
          });
          break;

        case "model_review":
          addMessage({
            role: data.model_id === "model_a" ? "model_a" : "model_b",
            modelName: data.model_name,
            modelId: data.model_id,
            type: "review",
            content: data.feedback,
            round: data.round,
          });
          break;

        case "final_versions":
          setState((prev) => ({
            ...prev,
            finals: data.versions,
            phase: "picking",
          }));
          break;

        case "user_ack":
          // Already shown locally; no-op
          break;

        case "pick_result":
          addMessage({
            role: "system",
            type: "pick_result",
            content: `You chose **${data.chosen_model_name}**'s version.`,
          });
          setState((prev) => ({ ...prev, phase: "done" }));
          break;

        case "error":
          setState((prev) => ({ ...prev, error: data.message }));
          break;

        case "done":
          setState((prev) => ({ ...prev, phase: "done" }));
          break;
      }
    };
  }, [addMessage]);

  const startReview = useCallback(
    (payload: {
      content: string;
      section: string;
      resume_data: Record<string, unknown>;
      job_data: Record<string, unknown>;
      models: { id: string; name: string; api_key: string }[];
    }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
        // Wait a tick for connection
        setTimeout(() => {
          wsRef.current?.send(
            JSON.stringify({ type: "start", ...payload })
          );
        }, 500);
      } else {
        wsRef.current.send(JSON.stringify({ type: "start", ...payload }));
      }
      setState((prev) => ({
        ...prev,
        messages: [],
        finals: [],
        phase: "drafting",
        error: null,
      }));
    },
    [connect]
  );

  const sendUserMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "user_message", content }));
      addMessage({ role: "user", type: "user", content });
    }
  }, [addMessage]);

  const pick = useCallback((modelId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "pick", choice: modelId }));
    }
  }, []);

  const stop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
    }
    setState((prev) => ({ ...prev, phase: "done" }));
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    startReview,
    sendUserMessage,
    pick,
    stop,
  };
}
