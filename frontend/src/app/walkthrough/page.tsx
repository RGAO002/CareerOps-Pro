"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  useWalkthroughSocket,
  WalkthroughMessage,
  WalkthroughQuestion,
  WalkthroughChange,
} from "@/lib/useWalkthroughSocket";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Config Panel ─────────────────────────────────────────────
function ConfigPanel({
  onStart,
  contextData,
}: {
  onStart: (cfg: {
    resume_data: Record<string, unknown>;
    job_data: Record<string, unknown>;
    model: { name: string; api_key: string };
  }) => void;
  contextData: {
    resume_data: Record<string, unknown>;
    job_data: Record<string, unknown>;
    api_keys?: { openai?: string; google?: string; anthropic?: string };
  } | null;
}) {
  const [model, setModel] = useState("gpt-5.4-mini");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    // Auto-fill from server-provided keys, then localStorage fallback
    if (contextData?.api_keys) {
      const keys = contextData.api_keys;
      const m = model.toLowerCase();
      const key = m.includes("gemini") ? keys.google
        : m.includes("claude") ? keys.anthropic
        : keys.openai;
      if (key) { setApiKey(key); return; }
    }
    setApiKey(localStorage.getItem("careeops_key_openai") || "");
  }, [contextData, model]);

  const handleStart = () => {
    if (apiKey) localStorage.setItem("careeops_key_openai", apiKey);
    onStart({
      resume_data: contextData?.resume_data || {},
      job_data: contextData?.job_data || {},
      model: { name: model, api_key: apiKey },
    });
  };

  const hasResume =
    contextData?.resume_data && Object.keys(contextData.resume_data).length > 0;
  const hasJob =
    contextData?.job_data && Object.keys(contextData.job_data).length > 0;

  return (
    <div className="max-w-xl mx-auto space-y-4 p-6 bg-gray-900 rounded-xl border border-gray-800">
      <h2 className="text-lg font-semibold">🎓 Walkthrough Setup</h2>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Model</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          placeholder="gpt-5.4-mini"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Context status */}
      <div className="flex items-center gap-3 text-xs">
        <span
          className={`flex items-center gap-1 ${hasResume ? "text-green-400" : "text-gray-500"}`}
        >
          {hasResume ? "✅" : "⬜"} Resume
          {hasResume && contextData?.resume_data?.name ? (
            <span className="text-gray-400">
              ({String(contextData.resume_data.name)})
            </span>
          ) : null}
        </span>
        <span
          className={`flex items-center gap-1 ${hasJob ? "text-green-400" : "text-gray-500"}`}
        >
          {hasJob ? "✅" : "⬜"} Job
          {hasJob && contextData?.job_data?.title ? (
            <span className="text-gray-400">
              ({String(contextData.job_data.title)}
              {contextData.job_data.company
                ? ` @ ${String(contextData.job_data.company)}`
                : ""}
              )
            </span>
          ) : null}
        </span>
      </div>

      {!hasResume && (
        <p className="text-yellow-500 text-xs">
          Click &quot;Walkthrough&quot; in Resume Editor to load data
        </p>
      )}

      <button
        onClick={handleStart}
        disabled={!apiKey || !hasResume || !hasJob}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
      >
        🚀 Start Walkthrough
      </button>
    </div>
  );
}

// ── Question Card ────────────────────────────────────────────
function QuestionCard({
  question,
  onChoose,
  onDebate,
  onSkipAll,
  active,
}: {
  question: WalkthroughQuestion;
  onChoose: (choiceId: string) => void;
  onDebate: () => void;
  onSkipAll: () => void;
  active: boolean;
}) {
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${active ? "border-indigo-500 bg-gray-900" : "border-gray-800 bg-gray-900/50 opacity-60"}`}>
      {question.progress && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Step {question.progress.current} / {question.progress.total}
          </span>
          <span className="text-gray-600 capitalize">{question.section}</span>
        </div>
      )}

      <p className="text-sm text-gray-200">{question.analysis}</p>

      {active && (
        <>
          <div className="space-y-2">
            {question.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onChoose(opt.id)}
                className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                  opt.recommended
                    ? "border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-200"
                    : opt.id === "keep"
                    ? "border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-400"
                    : "border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300"
                }`}
              >
                <span className="mr-2">{opt.recommended ? "●" : "○"}</span>
                {opt.label}
                {opt.recommended && (
                  <span className="ml-2 text-xs text-indigo-400">(Recommended)</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onDebate}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-800 hover:border-gray-600 transition-colors"
            >
              🤖 Debate
            </button>
            <div className="flex-1" />
            {!showSkipConfirm ? (
              <button
                onClick={() => setShowSkipConfirm(true)}
                className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-800 hover:border-gray-600 transition-colors"
              >
                Skip to End ⏭️
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onSkipAll();
                    setShowSkipConfirm(false);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded border border-indigo-800 hover:border-indigo-600 transition-colors"
                >
                  ● Apply recommended for all
                </button>
                <button
                  onClick={() => {
                    // skip_all with keep
                    onChoose("keep"); // current question
                    setShowSkipConfirm(false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-800 hover:border-gray-600 transition-colors"
                >
                  ○ Keep all as is
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Summary Panel ────────────────────────────────────────────
function SummaryPanel({
  changes,
  autoFixes,
  stats,
  onApply,
  onCancel,
}: {
  changes: WalkthroughChange[];
  autoFixes: string[];
  stats: { total: number; user_chosen: number; ai_auto: number; kept: number } | null;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto space-y-4 p-6 bg-gray-900 rounded-xl border border-gray-800">
      <h2 className="text-lg font-semibold">📋 Summary</h2>

      {stats && (
        <div className="flex gap-4 text-xs text-gray-400">
          <span>Total changes: {stats.total}</span>
          <span className="text-indigo-400">User chosen: {stats.user_chosen}</span>
          <span className="text-blue-400">AI auto: {stats.ai_auto}</span>
          <span className="text-gray-500">Kept: {stats.kept}</span>
        </div>
      )}

      <div className="space-y-2">
        {changes.map((c, i) => (
          <div
            key={c.question_id}
            className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg ${
              c.skipped ? "bg-gray-800/50 text-gray-500" : "bg-gray-800 text-gray-200"
            }`}
          >
            <span className="shrink-0 mt-0.5">
              {c.skipped ? "⏭️" : c.auto ? "🤖" : "✏️"}
            </span>
            <div>
              <span className="text-gray-400 capitalize">{c.section}</span>
              {c.index != null && <span className="text-gray-500">[{c.index}]</span>}
              <span className="mx-1 text-gray-600">→</span>
              {c.description}
            </div>
          </div>
        ))}
        {autoFixes.map((fix, i) => (
          <div
            key={`auto_${i}`}
            className="flex items-start gap-2 text-sm px-3 py-2 rounded-lg bg-gray-800/30 text-gray-500"
          >
            <span className="shrink-0 mt-0.5">🔧</span>
            <span>{fix}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onApply}
          className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
        >
          ✅ Apply All
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 transition-colors"
        >
          ↩️ Cancel
        </button>
      </div>
    </div>
  );
}

// ── Message Bubble ───────────────────────────────────────────
function MessageBubble({ msg }: { msg: WalkthroughMessage }) {
  if (msg.type === "question") return null; // rendered as QuestionCard

  const isUser = msg.type === "user_choice";
  const isStatus = msg.type === "status";
  const isError = msg.type === "error";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-md px-4 py-2 rounded-lg text-sm ${
          isUser
            ? "bg-indigo-600/80 text-white"
            : isError
            ? "bg-red-900/50 text-red-300 border border-red-800"
            : isStatus
            ? "bg-gray-800/50 text-gray-400 italic"
            : "bg-gray-800 text-gray-200"
        }`}
      >
        {isUser && <span className="mr-1">✅</span>}
        {msg.content}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function WalkthroughPage() {
  const ws = useWalkthroughSocket();
  const [contextData, setContextData] = useState<{
    resume_data: Record<string, unknown>;
    job_data: Record<string, unknown>;
    api_keys?: { openai?: string; google?: string; anthropic?: string };
  } | null>(null);
  const [userInput, setUserInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load context on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/walkthrough/context`)
      .then((r) => r.json())
      .then((data) => setContextData(data))
      .catch((e) => console.error("Failed to load context:", e));
  }, []);

  // Connect WebSocket on mount
  useEffect(() => {
    ws.connect();
    return () => ws.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ws.messages, ws.currentQuestion, ws.phase]);

  const handleStart = useCallback(
    (cfg: {
      resume_data: Record<string, unknown>;
      job_data: Record<string, unknown>;
      model: { name: string; api_key: string };
    }) => {
      ws.start(cfg);
    },
    [ws]
  );

  const handleSendMessage = () => {
    const text = userInput.trim();
    if (!text) return;
    ws.sendMessage(text);
    setUserInput("");
  };

  const handleDebate = () => {
    alert("🚧 Debate mode coming soon! Each question will support inline multi-LLM debate.");
  };

  const handleSkipAll = () => {
    ws.skipAll(true); // apply recommended for all remaining
  };

  // Done state
  if (ws.phase === "done") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-semibold">Walkthrough Complete</h2>
          <p className="text-gray-400 text-sm">
            Your optimized resume has been saved. Return to the Streamlit app to load the results.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">🎓 Walkthrough Mode</h1>
        {ws.phase !== "idle" && (
          <button
            onClick={ws.stop}
            className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded border border-gray-800 hover:border-red-800 transition-colors"
          >
            ✕ Stop
          </button>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {ws.phase === "idle" ? (
          <ConfigPanel onStart={handleStart} contextData={contextData} />
        ) : ws.phase === "summary" ? (
          <SummaryPanel
            changes={ws.changes}
            autoFixes={ws.autoFixes}
            stats={ws.stats}
            onApply={ws.apply}
            onCancel={ws.stop}
          />
        ) : (
          <div className="max-w-xl mx-auto space-y-3">
            {ws.messages.map((msg) => {
              if (msg.type === "question" && msg.question) {
                return (
                  <QuestionCard
                    key={msg.id}
                    question={msg.question}
                    active={
                      ws.currentQuestion?.question_id === msg.question.question_id
                    }
                    onChoose={(choiceId) =>
                      ws.choose(msg.question!.question_id, choiceId)
                    }
                    onDebate={handleDebate}
                    onSkipAll={handleSkipAll}
                  />
                );
              }
              return <MessageBubble key={msg.id} msg={msg} />;
            })}
            <div ref={chatEndRef} />
          </div>
        )}
      </main>

      {/* Input bar — only during walking phase */}
      {ws.phase === "walking" && ws.currentQuestion && (
        <footer className="border-t border-gray-800 px-6 py-3">
          <div className="max-w-xl mx-auto flex gap-2">
            <input
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
              placeholder="Type your thoughts..."
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleSendMessage}
              disabled={!userInput.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
            >
              Send
            </button>
          </div>
        </footer>
      )}

      {/* Error banner */}
      {ws.error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-900/90 text-red-200 px-4 py-2 rounded-lg text-sm border border-red-800 shadow-lg">
          {ws.error}
        </div>
      )}
    </div>
  );
}
