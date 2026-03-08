"use client";

import { useState, useRef, useEffect } from "react";
import { useReviewSocket, ChatMessage, FinalVersion } from "@/lib/useReviewSocket";

// ── Config Panel ─────────────────────────────────────────────
function ConfigPanel({
  onStart,
}: {
  onStart: (cfg: {
    content: string;
    section: string;
    models: { id: string; name: string; api_key: string }[];
  }) => void;
}) {
  const [instruction, setInstruction] = useState(
    "Write a compelling professional summary tailored to this job."
  );
  const [section, setSection] = useState("summary");
  const [modelA, setModelA] = useState("gpt-4o");
  const [modelB, setModelB] = useState("gemini-2.0-flash");
  const [keyA, setKeyA] = useState("");
  const [keyB, setKeyB] = useState("");

  // Load keys from localStorage on mount
  useEffect(() => {
    setKeyA(localStorage.getItem("careeops_key_openai") || "");
    setKeyB(localStorage.getItem("careeops_key_google") || "");
  }, []);

  const handleStart = () => {
    // Persist keys
    if (keyA) localStorage.setItem("careeops_key_openai", keyA);
    if (keyB) localStorage.setItem("careeops_key_google", keyB);

    onStart({
      content: instruction,
      section,
      models: [
        { id: "model_a", name: modelA, api_key: keyA },
        { id: "model_b", name: modelB, api_key: keyB },
      ],
    });
  };

  return (
    <div className="space-y-4 p-6 bg-gray-900 rounded-xl border border-gray-800">
      <h2 className="text-lg font-semibold">⚙️ Review Setup</h2>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Section</label>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="summary">Profile Summary</option>
          <option value="experience">Experience Bullets</option>
          <option value="skills">Skills Section</option>
          <option value="general">General</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Instruction</label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Model A</label>
          <input
            value={modelA}
            onChange={(e) => setModelA(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={keyA}
            onChange={(e) => setKeyA(e.target.value)}
            placeholder="API Key"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-2"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Model B</label>
          <input
            value={modelB}
            onChange={(e) => setModelB(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={keyB}
            onChange={(e) => setKeyB(e.target.value)}
            placeholder="API Key"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-2"
          />
        </div>
      </div>

      <button
        onClick={handleStart}
        disabled={!keyA || !keyB}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
      >
        🚀 Start Review
      </button>
    </div>
  );
}

// ── Chat Bubble ──────────────────────────────────────────────
const ROLE_STYLES: Record<string, { bg: string; label: string; align: string }> = {
  model_a: { bg: "bg-blue-900/40 border-blue-800", label: "🤖 A", align: "mr-12" },
  model_b: { bg: "bg-emerald-900/40 border-emerald-800", label: "🤖 B", align: "mr-12" },
  user: { bg: "bg-indigo-900/40 border-indigo-800", label: "👤 You", align: "ml-12" },
  system: { bg: "bg-gray-800/60 border-gray-700", label: "", align: "mx-auto max-w-md" },
};

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const style = ROLE_STYLES[msg.role] || ROLE_STYLES.system;
  const typeLabel =
    msg.type === "draft" ? "Draft" :
    msg.type === "review" ? "Review" :
    msg.type === "final" ? "Final" :
    "";

  return (
    <div className={`${style.align} mb-3`}>
      <div className={`${style.bg} border rounded-xl px-4 py-3`}>
        {msg.role !== "system" && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-gray-300">
              {style.label} {msg.modelName && `(${msg.modelName})`}
            </span>
            {typeLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                {typeLabel}
              </span>
            )}
            {msg.round && (
              <span className="text-[10px] text-gray-500">R{msg.round}</span>
            )}
          </div>
        )}
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {msg.content}
        </div>
      </div>
    </div>
  );
}

// ── Blind Pick Panel ─────────────────────────────────────────
function BlindPick({
  versions,
  onPick,
}: {
  versions: FinalVersion[];
  onPick: (modelId: string) => void;
}) {
  return (
    <div className="space-y-4 p-6 bg-gray-900 rounded-xl border border-gray-800">
      <h2 className="text-lg font-semibold text-center">
        🎯 Pick Your Preferred Version
      </h2>
      <p className="text-sm text-gray-400 text-center">
        Model names are hidden. Choose based on content quality only.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {versions.map((v) => (
          <div key={v.model_id} className="space-y-2">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 min-h-[120px]">
              <h3 className="font-semibold mb-2 text-indigo-400">{v.label}</h3>
              <p className="text-sm whitespace-pre-wrap">{v.content}</p>
              {v.rationale && (
                <p className="text-xs text-gray-500 mt-3 italic">
                  Rationale: {v.rationale}
                </p>
              )}
            </div>
            <button
              onClick={() => onPick(v.model_id)}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
            >
              I prefer {v.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Review Page ─────────────────────────────────────────
export default function ReviewPage() {
  const {
    connected,
    messages,
    finals,
    phase,
    error,
    connect,
    startReview,
    sendUserMessage,
    pick,
    stop,
  } = useReviewSocket();

  const [userInput, setUserInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, finals]);

  // Connect on mount
  useEffect(() => {
    connect();
  }, [connect]);

  const handleStart = (cfg: {
    content: string;
    section: string;
    models: { id: string; name: string; api_key: string }[];
  }) => {
    startReview({
      ...cfg,
      resume_data: {}, // TODO: load from session selector
      job_data: {},     // TODO: load from session selector
    });
  };

  const handleSend = () => {
    if (!userInput.trim()) return;
    sendUserMessage(userInput.trim());
    setUserInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🤖 Multi-LLM Review</h1>
          <p className="text-sm text-gray-400">
            AI roundtable discussion for your resume
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-xs text-gray-500">
            {connected ? "Connected" : "Disconnected"}
          </span>
          {phase !== "idle" && phase !== "done" && (
            <button
              onClick={stop}
              className="ml-2 px-3 py-1 text-xs bg-red-900/60 hover:bg-red-800 border border-red-700 rounded-lg transition-colors"
            >
              ⏹ Stop
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 bg-red-900/40 border border-red-800 rounded-lg text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      {/* Config panel — shown only when idle */}
      {phase === "idle" && <ConfigPanel onStart={handleStart} />}

      {/* Chat stream */}
      {messages.length > 0 && (
        <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} msg={msg} />
          ))}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Blind pick panel */}
      {phase === "picking" && finals.length > 0 && (
        <BlindPick versions={finals} onPick={pick} />
      )}

      {/* User input — available during drafting/reviewing phases */}
      {(phase === "drafting" || phase === "reviewing") && (
        <div className="flex gap-2">
          <input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Intervene — type your feedback here..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleSend}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      )}

      {/* Done state */}
      {phase === "done" && (
        <div className="text-center">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            🔄 Start New Review
          </button>
        </div>
      )}

      {/* Phase indicator */}
      {phase !== "idle" && phase !== "done" && (
        <div className="text-center text-xs text-gray-500">
          {phase === "drafting" && "⏳ Models are writing their drafts..."}
          {phase === "reviewing" && "⏳ Models are reviewing each other..."}
          {phase === "picking" && "👆 Pick your preferred version above"}
        </div>
      )}
    </div>
  );
}
