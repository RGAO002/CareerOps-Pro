"use client";

import { useCallback, useRef, useState } from "react";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL?.replace("/api/review/ws", "/api/walkthrough/ws") ||
  "ws://localhost:8000/api/walkthrough/ws";

export interface WalkthroughOption {
  id: string;
  label: string;
  recommended?: boolean;
}

export interface WalkthroughQuestion {
  question_id: string;
  section: string;
  analysis: string;
  options: WalkthroughOption[];
  progress?: { current: number; total: number };
  updated?: boolean;
}

export interface WalkthroughChange {
  question_id: string;
  section: string;
  index?: number | null;
  description: string;
  skipped: boolean;
  auto?: boolean;
}

export interface WalkthroughMessage {
  id: string;
  type: "ai_message" | "question" | "user_choice" | "status" | "applied" | "error";
  content: string;
  question?: WalkthroughQuestion;
  timestamp: number;
}

interface WalkthroughState {
  connected: boolean;
  messages: WalkthroughMessage[];
  currentQuestion: WalkthroughQuestion | null;
  changes: WalkthroughChange[];
  autoFixes: string[];
  stats: { total: number; user_chosen: number; ai_auto: number; kept: number } | null;
  finalResumeData: Record<string, unknown> | null;
  phase: "idle" | "analyzing" | "walking" | "summary" | "done";
  error: string | null;
}

let msgCounter = 0;
function nextId() {
  return `wt_${++msgCounter}_${Date.now()}`;
}

export function useWalkthroughSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<WalkthroughState>({
    connected: false,
    messages: [],
    currentQuestion: null,
    changes: [],
    autoFixes: [],
    stats: null,
    finalResumeData: null,
    phase: "idle",
    error: null,
  });

  const addMessage = useCallback(
    (msg: Omit<WalkthroughMessage, "id" | "timestamp">) => {
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, { ...msg, id: nextId(), timestamp: Date.now() }],
      }));
    },
    []
  );

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const connect = useCallback(() => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    )
      return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

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
      console.log("[Walkthrough WS] received:", data.type);

      switch (data.type) {
        case "status":
          addMessage({ type: "status", content: data.content });
          setState((prev) => ({ ...prev, phase: "analyzing" }));
          break;

        case "ai_message":
          addMessage({ type: "ai_message", content: data.content });
          break;

        case "question": {
          const q: WalkthroughQuestion = {
            question_id: data.question_id,
            section: data.section,
            analysis: data.analysis,
            options: data.options,
            progress: data.progress,
            updated: data.updated,
          };
          // If this is an update to the current question, replace in messages
          if (data.updated) {
            setState((prev) => ({
              ...prev,
              currentQuestion: q,
              messages: prev.messages.map((m) =>
                m.question?.question_id === q.question_id
                  ? { ...m, content: q.analysis, question: q }
                  : m
              ),
            }));
          } else {
            addMessage({ type: "question", content: q.analysis, question: q });
            setState((prev) => ({ ...prev, currentQuestion: q, phase: "walking" }));
          }
          break;
        }

        case "applied":
          addMessage({
            type: "applied",
            content: data.description,
          });
          setState((prev) => ({ ...prev, currentQuestion: null }));
          break;

        case "summary":
          setState((prev) => ({
            ...prev,
            changes: data.changes || [],
            autoFixes: data.auto_fixes || [],
            stats: data.stats || null,
            phase: "summary",
            currentQuestion: null,
          }));
          break;

        case "complete":
          setState((prev) => ({
            ...prev,
            finalResumeData: data.final_resume_data,
            phase: "done",
          }));
          break;

        case "error":
          setState((prev) => ({ ...prev, error: data.message }));
          addMessage({ type: "error", content: data.message });
          break;

        case "done":
          setState((prev) => ({ ...prev, phase: "done" }));
          break;
      }
    };
  }, [addMessage]);

  const start = useCallback(
    (config: {
      resume_data: Record<string, unknown>;
      job_data: Record<string, unknown>;
      model: { name: string; api_key: string };
    }) => {
      const msg = JSON.stringify({ type: "start", ...config });
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
        setTimeout(() => wsRef.current?.send(msg), 500);
      } else {
        wsRef.current.send(msg);
      }
      setState((prev) => ({
        ...prev,
        messages: [],
        currentQuestion: null,
        changes: [],
        autoFixes: [],
        stats: null,
        finalResumeData: null,
        phase: "analyzing",
        error: null,
      }));
    },
    [connect]
  );

  const choose = useCallback(
    (questionId: string, choiceId: string) => {
      send({ type: "choose", question_id: questionId, choice: choiceId });
      const label =
        state.currentQuestion?.options.find((o) => o.id === choiceId)?.label || choiceId;
      addMessage({ type: "user_choice", content: label });
    },
    [send, addMessage, state.currentQuestion]
  );

  const sendMessage = useCallback(
    (content: string) => {
      send({ type: "user_message", content });
      addMessage({ type: "user_choice", content });
    },
    [send, addMessage]
  );

  const skipAll = useCallback(
    (applyRecommended: boolean) => {
      send({ type: "skip_all", apply_recommended: applyRecommended });
      addMessage({
        type: "user_choice",
        content: applyRecommended
          ? "Skip to end — apply recommended for all remaining"
          : "Skip to end — keep all remaining as is",
      });
    },
    [send, addMessage]
  );

  const apply = useCallback(() => {
    send({ type: "apply" });
  }, [send]);

  const stop = useCallback(() => {
    send({ type: "stop" });
    setState((prev) => ({ ...prev, phase: "done" }));
  }, [send]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    start,
    choose,
    sendMessage,
    skipAll,
    apply,
    stop,
  };
}
