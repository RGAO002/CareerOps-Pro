"use client";

import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────
interface SentenceResult {
  index: number;
  text: string;
  score: number;
  flags: string[];
}

interface AnalysisResult {
  sentences: SentenceResult[];
  structural: Record<string, { detail: string; severity: string }>;
  overall_score: number;
  total: number;
  flagged: number;
}

interface ChangeDetail {
  type: string;
  from: string;
  to: string;
}

interface RewriteItem {
  index: number;
  original: string;
  rewritten: string;
  changes?: ChangeDetail[];
}

interface RewriteResponse {
  analysis: AnalysisResult;
  rewrites: RewriteItem[];
  result_text: string;
  message: string;
}

// Translate types
interface TranslateSentence {
  index: number;
  original: string;
  chinese: string;
  translated: string;
  changed: boolean;
}

interface TranslateResponse {
  analysis: AnalysisResult;
  chinese_text: string;
  result_text: string;
  sentences: TranslateSentence[];
  total: number;
  changed: number;
  message: string;
}

// Pipeline types
interface PipelineChange {
  from: string;
  to: string;
}

interface PipelineSentence {
  index: number;
  orig_index: number;
  original: string;
  simplified: string;
  stage1: string;
  stage1_changes: ChangeDetail[];
  chinese: string;
  google_raw: string;
  final: string;
  source: "google" | "perturb";
  similarity: number;
  google_changes: PipelineChange[];
  changed: boolean;
}

interface PipelineResponse {
  analysis: AnalysisResult;
  sentences: PipelineSentence[];
  result_text: string;
  total: number;
  changed: number;
  perturb_changes: number;
  google_changes: number;
  google_sentence_count: number;
  perturb_sentence_count: number;
  split_count: number;
  simplified_count: number;
  message: string;
}

// Multi-model types
interface WordChange {
  original: string;
  replacement: string;
  source: string;
}

interface MultiSentenceResult {
  index: number;
  original: string;
  options: Record<string, string | null>; // model_label → rewritten or null
  selected_model: string | null;
  selected_text: string;
  word_changes?: WordChange[];
}

interface MultiResponse {
  analysis: AnalysisResult;
  sentence_results: MultiSentenceResult[];
  result_text: string;
  message: string;
  total: number;
  changed: number;
  model_stats: Record<string, number>;
}

// ── Score bar color ──────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 6) return "bg-red-500";
  if (score >= 3) return "bg-yellow-500";
  return "bg-green-500";
}

function scoreBadge(score: number): string {
  if (score >= 6) return "text-red-400 border-red-800 bg-red-950";
  if (score >= 3) return "text-yellow-400 border-yellow-800 bg-yellow-950";
  return "text-green-400 border-green-800 bg-green-950";
}

// Model label colors
const MODEL_COLORS: Record<string, string> = {
  "Kimi K2.5": "text-cyan-400 border-cyan-800 bg-cyan-950",
  "GLM-5": "text-amber-400 border-amber-800 bg-amber-950",
  "Qwen 2.5": "text-violet-400 border-violet-800 bg-violet-950",
  "rules": "text-green-400 border-green-800 bg-green-950",
};

// ── Available models on Together AI (for single-model modes) ─
const MODELS = [
  { value: "moonshotai/Kimi-K2.5", label: "Kimi K2.5 (Moonshot)" },
  { value: "zai-org/GLM-5", label: "GLM-5 (Zhipu)" },
  { value: "mistralai/Mistral-7B-Instruct-v0.3", label: "Mistral 7B" },
  { value: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", label: "LLaMA 3.1 8B" },
  { value: "Qwen/Qwen2.5-7B-Instruct-Turbo", label: "Qwen 2.5 7B" },
];

// ── Main Page ────────────────────────────────────────────────
export default function HumanizePage() {
  const [inputText, setInputText] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODELS[0].value);

  // State
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [rewrites, setRewrites] = useState<RewriteItem[]>([]);
  const [multiResults, setMultiResults] = useState<MultiSentenceResult[]>([]);
  const [multiStats, setMultiStats] = useState<Record<string, number>>({});
  const [translateResults, setTranslateResults] = useState<TranslateSentence[]>([]);
  const [pipelineResults, setPipelineResults] = useState<PipelineSentence[]>([]);
  const [pipelineStats, setPipelineStats] = useState<{ perturb: number; google: number }>({ perturb: 0, google: 0 });
  const [resultText, setResultText] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"idle" | "analyzing" | "rewriting" | "perturbing" | "hybrid" | "multi" | "translating" | "pipeline">("idle");
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"single" | "multi" | "translate" | "pipeline">("single");

  // Persist API key
  useEffect(() => {
    setApiKey(localStorage.getItem("together_api_key") || "");
  }, []);

  // ── Clear state helper ──
  const clearResults = () => {
    setRewrites([]);
    setMultiResults([]);
    setMultiStats({});
    setTranslateResults([]);
    setPipelineResults([]);
    setPipelineStats({ perturb: 0, google: 0 });
    setResultText("");
    setMessage("");
  };

  // ── Analyze only (no rewrite, no API key needed) ──
  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    setLoading("analyzing");
    setError("");
    clearResults();
    try {
      const res = await fetch(`${API}/api/humanize/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: AnalysisResult = await res.json();
      setAnalysis(data);
      setViewMode("single");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  };

  // ── Perturb (rule-based, no AI, no API key) ──
  const handlePerturb = async () => {
    if (!inputText.trim()) return;
    setLoading("perturbing");
    setError("");
    clearResults();
    try {
      const res = await fetch(`${API}/api/humanize/perturb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: RewriteResponse = await res.json();
      setAnalysis(data.analysis);
      setRewrites(data.rewrites);
      setResultText(data.result_text);
      setMessage(data.message);
      setViewMode("single");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  };

  // ── Multi-model: 3 models in parallel ──
  const handleMulti = async () => {
    if (!inputText.trim()) return;
    if (!apiKey.trim()) {
      setError("Together AI API key is required");
      return;
    }
    localStorage.setItem("together_api_key", apiKey);
    setLoading("multi");
    setError("");
    clearResults();
    try {
      const res = await fetch(`${API}/api/humanize/multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          together_api_key: apiKey,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: MultiResponse = await res.json();
      setAnalysis(data.analysis);
      setMultiResults(data.sentence_results);
      setMultiStats(data.model_stats || {});
      setResultText(data.result_text);
      setMessage(data.message);
      setViewMode("multi");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  };

  // ── Pipeline: Perturb + Google Translate word-level finish ──
  const handlePipeline = async () => {
    if (!inputText.trim()) return;
    setLoading("pipeline");
    setError("");
    clearResults();
    try {
      const res = await fetch(`${API}/api/humanize/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: PipelineResponse = await res.json();
      setAnalysis(data.analysis);
      setPipelineResults(data.sentences);
      setPipelineStats({ perturb: data.perturb_changes, google: data.google_changes });
      setResultText(data.result_text);
      setMessage(data.message);
      setViewMode("pipeline");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  };

  // ── Translate: EN → ZH → EN ──
  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    if (!apiKey.trim()) {
      setError("Together AI API key is required");
      return;
    }
    localStorage.setItem("together_api_key", apiKey);
    setLoading("translating");
    setError("");
    clearResults();
    try {
      const res = await fetch(`${API}/api/humanize/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          together_api_key: apiKey,
          model,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: TranslateResponse = await res.json();
      setAnalysis(data.analysis);
      setTranslateResults(data.sentences);
      setResultText(data.result_text);
      setMessage(data.message);
      setViewMode("translate");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  };

  // ── Google Translate: EN → ZH → EN (no LLM, no API key) ──
  const handleGoogleTranslate = async () => {
    if (!inputText.trim()) return;
    setLoading("translating");
    setError("");
    clearResults();
    try {
      const res = await fetch(`${API}/api/humanize/translate-google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: TranslateResponse = await res.json();
      setAnalysis(data.analysis);
      setTranslateResults(data.sentences);
      setResultText(data.result_text);
      setMessage(data.message);
      setViewMode("translate");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  };

  // ── Hybrid: rule-based targeting + LLM word replacement ──
  const handleHybrid = async () => {
    if (!inputText.trim()) return;
    if (!apiKey.trim()) {
      setError("Together AI API key is required for hybrid mode");
      return;
    }
    localStorage.setItem("together_api_key", apiKey);
    setLoading("hybrid");
    setError("");
    clearResults();
    try {
      const res = await fetch(`${API}/api/humanize/hybrid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          together_api_key: apiKey,
          model,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: RewriteResponse = await res.json();
      setAnalysis(data.analysis);
      setRewrites(data.rewrites);
      setResultText(data.result_text);
      setMessage(data.message);
      setViewMode("single");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  };

  // ── Analyze + Rewrite (LLM full) ──
  const handleRewrite = async () => {
    if (!inputText.trim()) return;
    if (!apiKey.trim()) {
      setError("Together AI API key is required for rewriting");
      return;
    }
    localStorage.setItem("together_api_key", apiKey);
    setLoading("rewriting");
    setError("");
    clearResults();
    try {
      const res = await fetch(`${API}/api/humanize/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          together_api_key: apiKey,
          model,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: RewriteResponse = await res.json();
      setAnalysis(data.analysis);
      setRewrites(data.rewrites);
      setResultText(data.result_text);
      setMessage(data.message);
      setViewMode("single");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  };

  const rewriteMap = new Map(rewrites.map((r) => [r.index, r]));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">🔬 AI Text Humanizer — Lab</h1>
          <p className="text-gray-400 text-sm mt-1">
            Paste AI-generated text → 3 models parallel rewrite, random pick per sentence
          </p>
        </div>

        {/* Input area + settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Text input */}
          <div className="lg:col-span-2">
            <label className="block text-sm text-gray-400 mb-1">
              Paste text to analyze
            </label>
            <textarea
              className="w-full h-64 bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:border-blue-500"
              placeholder="Paste your AI-generated resume bullets, cover letter text, or any content here..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
              <span>{inputText.split(/\n/).filter((l) => l.trim()).length} lines</span>
              <span>·</span>
              <span>{inputText.split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Together AI API Key
              </label>
              <input
                type="password"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Single-model (Hybrid/Rewrite)</label>
              <select
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-2">
              <button
                className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold disabled:opacity-40"
                onClick={handlePipeline}
                disabled={loading !== "idle" || !inputText.trim()}
              >
                {loading === "pipeline" ? "⏳ Perturb + Google Translate..." : "⚡ Humanize (Perturb + Google Translate)"}
              </button>
              <div className="border-t border-gray-800 pt-2 space-y-1.5">
                <p className="text-xs text-gray-600 mb-1">Other modes:</p>
                <button
                  className="w-full py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs disabled:opacity-40"
                  onClick={handleGoogleTranslate}
                  disabled={loading !== "idle" || !inputText.trim()}
                >
                  {loading === "translating" ? "..." : "🌐 Google Translate (full)"}
                </button>
                <button
                  className="w-full py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs disabled:opacity-40"
                  onClick={handleMulti}
                  disabled={loading !== "idle" || !inputText.trim()}
                >
                  {loading === "multi" ? "..." : "🚀 Multi-Model (Kimi+GLM+Qwen)"}
                </button>
                <button
                  className="w-full py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs disabled:opacity-40"
                  onClick={handleAnalyze}
                  disabled={loading !== "idle" || !inputText.trim()}
                >
                  {loading === "analyzing" ? "..." : "🔍 Analyze Only"}
                </button>
                <button
                  className="w-full py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs disabled:opacity-40"
                  onClick={handlePerturb}
                  disabled={loading !== "idle" || !inputText.trim()}
                >
                  {loading === "perturbing" ? "..." : "🎯 Perturb (No AI)"}
                </button>
                <button
                  className="w-full py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs disabled:opacity-40"
                  onClick={handleHybrid}
                  disabled={loading !== "idle" || !inputText.trim()}
                >
                  {loading === "hybrid" ? "..." : "🔀 Hybrid"}
                </button>
                <button
                  className="w-full py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs disabled:opacity-40"
                  onClick={handleRewrite}
                  disabled={loading !== "idle" || !inputText.trim()}
                >
                  {loading === "rewriting" ? "..." : "✨ Rewrite All (single LLM)"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {analysis && (
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center gap-6 p-4 bg-gray-900 rounded-lg border border-gray-800 flex-wrap">
              <div>
                <div className="text-xs text-gray-500">AI Score</div>
                <div className="text-2xl font-bold">
                  <span className={analysis.overall_score >= 4 ? "text-red-400" : analysis.overall_score >= 2 ? "text-yellow-400" : "text-green-400"}>
                    {analysis.overall_score}
                  </span>
                  <span className="text-sm text-gray-500">/10</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Sentences</div>
                <div className="text-lg font-medium">{analysis.total}</div>
              </div>
              {/* Multi-model stats */}
              {viewMode === "multi" && Object.keys(multiStats).length > 0 && (
                <>
                  {Object.entries(multiStats).map(([label, count]) => (
                    <div key={label}>
                      <div className="text-xs text-gray-500">{label}</div>
                      <div className={`text-lg font-medium ${count > 0 ? "text-green-400" : "text-gray-600"}`}>
                        {count}/{analysis.total}
                      </div>
                    </div>
                  ))}
                </>
              )}
              {/* Pipeline stats */}
              {viewMode === "pipeline" && pipelineResults.length > 0 && (
                <>
                  <div>
                    <div className="text-xs text-gray-500">Simplified</div>
                    <div className="text-lg font-medium text-purple-400">
                      {pipelineResults.length}
                      <span className="text-sm text-gray-500"> sent</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Splits</div>
                    <div className="text-lg font-medium text-purple-400">
                      +{pipelineResults.length - analysis.total}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Word swaps</div>
                    <div className="text-lg font-medium text-amber-400">{pipelineStats.perturb}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Google 🌐</div>
                    <div className="text-lg font-medium text-teal-400">
                      {pipelineResults.filter(p => p.source === "google").length}/{pipelineResults.length}
                    </div>
                  </div>
                </>
              )}
              {/* Translate stats */}
              {viewMode === "translate" && translateResults.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500">Changed</div>
                  <div className="text-lg font-medium text-teal-400">
                    {translateResults.filter((t) => t.changed).length}/{translateResults.length}
                  </div>
                </div>
              )}
              {/* Single-model stats */}
              {viewMode === "single" && rewrites.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500">Rewritten</div>
                  <div className="text-lg font-medium text-blue-400">{rewrites.length}</div>
                </div>
              )}
              {Object.keys(analysis.structural).length > 0 && (
                <div className="ml-auto flex gap-2">
                  {Object.entries(analysis.structural).map(([key, val]) => (
                    <span
                      key={key}
                      className="text-xs px-2 py-1 rounded bg-yellow-950 text-yellow-400 border border-yellow-800"
                    >
                      {val.detail}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Message */}
            {message && (
              <div className="p-3 bg-blue-950 border border-blue-800 rounded-lg text-blue-300 text-sm">
                {message}
              </div>
            )}

            {/* ═══ Multi-model word-level breakdown ═══ */}
            {viewMode === "multi" && multiResults.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-gray-400">
                  Word-Level Mix — 3 Models → Random Pick Per Word
                </h2>
                {multiResults.map((sr) => {
                  const scoreInfo = analysis.sentences.find((s) => s.index === sr.index);
                  const hasChanges = sr.selected_model !== null && sr.selected_text !== sr.original;
                  return (
                    <div
                      key={sr.index}
                      className="p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-2"
                    >
                      {/* Original */}
                      <div className="flex items-start gap-3">
                        {scoreInfo && (
                          <span className={`flex-shrink-0 inline-block text-xs font-mono font-bold px-2 py-0.5 rounded border ${scoreBadge(scoreInfo.score)}`}>
                            {scoreInfo.score}
                          </span>
                        )}
                        <p className={`text-sm ${hasChanges ? "line-through text-gray-500" : "text-gray-200"}`}>
                          {sr.original}
                        </p>
                      </div>

                      {/* Mixed result */}
                      {hasChanges && (
                        <div className="ml-8 space-y-1.5">
                          {/* Final mixed sentence */}
                          <p className="text-sm text-green-300">
                            → {sr.selected_text}
                          </p>

                          {/* Word-level changes with source model tags */}
                          {sr.word_changes && sr.word_changes.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {sr.word_changes.map((wc, wi) => {
                                const colorClass = MODEL_COLORS[wc.source] || "text-gray-400 border-gray-700 bg-gray-800";
                                return (
                                  <span
                                    key={wi}
                                    className={`text-xs px-1.5 py-0.5 rounded border ${colorClass}`}
                                  >
                                    {wc.original || "∅"} → {wc.replacement || "∅"}
                                    <span className="ml-1 opacity-60">({wc.source})</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {/* Collapsible: full model rewrites */}
                          {Object.values(sr.options).some((v) => v !== null) && (
                            <details className="mt-1">
                              <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">
                                Show full model rewrites
                              </summary>
                              <div className="mt-1 space-y-1 pl-2 border-l border-gray-800">
                                {Object.entries(sr.options).map(([label, text]) => {
                                  const colorClass = MODEL_COLORS[label] || "text-gray-400 border-gray-700 bg-gray-900";
                                  return (
                                    <div key={label} className="flex items-start gap-2">
                                      <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded border font-mono ${colorClass}`}>
                                        {label}
                                      </span>
                                      <p className="text-xs text-gray-500">
                                        {text || "— no change"}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ═══ Pipeline: Structural Simplify → Perturb → Google Translate ═══ */}
            {viewMode === "pipeline" && pipelineResults.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-gray-400">
                  ⚡ Pipeline — Simplify Structure → Perturb → Google Translate
                </h2>
                {/* Group by original sentence */}
                {(() => {
                  const groups: { origIdx: number; original: string; items: typeof pipelineResults }[] = [];
                  for (const pr of pipelineResults) {
                    const last = groups[groups.length - 1];
                    if (last && last.origIdx === pr.orig_index) {
                      last.items.push(pr);
                    } else {
                      groups.push({ origIdx: pr.orig_index, original: pr.original, items: [pr] });
                    }
                  }
                  return groups.map((group) => {
                    const scoreInfo = analysis.sentences.find((s) => s.index === group.origIdx);
                    const wasSplit = group.items.length > 1 || group.items[0]?.simplified !== group.original;
                    return (
                      <div
                        key={group.origIdx}
                        className="p-4 bg-gray-900 rounded-lg border border-teal-900/50 space-y-2"
                      >
                        {/* Original sentence */}
                        <div className="flex items-start gap-3">
                          {scoreInfo && (
                            <span className={`flex-shrink-0 inline-block text-xs font-mono font-bold px-2 py-0.5 rounded border ${scoreBadge(scoreInfo.score)}`}>
                              {scoreInfo.score}
                            </span>
                          )}
                          <p className="text-sm line-through text-gray-500">
                            {group.original}
                          </p>
                        </div>

                        {/* Result sentences */}
                        <div className="ml-8 space-y-2">
                          {group.items.map((pr, pi) => (
                            <div key={pr.index} className="space-y-1">
                              <p className="text-sm text-green-300">→ {pr.final}</p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs px-2 py-0.5 rounded border text-teal-400 border-teal-800 bg-teal-950">
                                  🌐 Google
                                </span>
                                {wasSplit && (
                                  <span className="text-xs px-1.5 py-0.5 rounded border text-purple-400 border-purple-800 bg-purple-950">
                                    ✂️ split {pi + 1}/{group.items.length}
                                  </span>
                                )}
                                <span className="text-xs text-gray-600">
                                  sim: {Math.round(pr.similarity * 100)}%
                                </span>
                              </div>
                            </div>
                          ))}

                          {/* Collapsible: intermediate stages */}
                          <details className="mt-1">
                            <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">
                              Show stages ({group.items.length} sub-sentence{group.items.length > 1 ? "s" : ""})
                            </summary>
                            <div className="mt-1 space-y-2 pl-2 border-l border-gray-800">
                              {group.items.map((pr) => (
                                <div key={pr.index} className="space-y-1">
                                  {pr.simplified !== group.original && (
                                    <div className="flex items-start gap-2">
                                      <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded border font-mono text-purple-400 border-purple-800 bg-purple-950">
                                        Split
                                      </span>
                                      <p className="text-xs text-gray-500">{pr.simplified}</p>
                                    </div>
                                  )}
                                  {pr.stage1 !== pr.simplified && (
                                    <div className="flex items-start gap-2">
                                      <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded border font-mono text-amber-400 border-amber-800 bg-amber-950">
                                        Perturb
                                      </span>
                                      <p className="text-xs text-gray-500">{pr.stage1}</p>
                                    </div>
                                  )}
                                  <div className="flex items-start gap-2">
                                    <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded border font-mono text-teal-400 border-teal-800 bg-teal-950">
                                      中文
                                    </span>
                                    <p className="text-xs text-gray-500">{pr.chinese}</p>
                                  </div>
                                  {pr.stage1_changes.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {pr.stage1_changes.map((c, ci) => (
                                        <span
                                          key={ci}
                                          className="text-xs px-1.5 py-0.5 rounded border text-amber-400 border-amber-800 bg-amber-950"
                                        >
                                          {c.from} → {c.to}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* ═══ Translate (EN → ZH → EN) breakdown ═══ */}
            {viewMode === "translate" && translateResults.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-gray-400">
                  🌐 EN → 中文 → EN — Cross-Language Translation
                </h2>
                {translateResults.map((tr) => {
                  const scoreInfo = analysis.sentences.find((s) => s.index === tr.index);
                  return (
                    <div
                      key={tr.index}
                      className="p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-2"
                    >
                      {/* Original English */}
                      <div className="flex items-start gap-3">
                        {scoreInfo && (
                          <span className={`flex-shrink-0 inline-block text-xs font-mono font-bold px-2 py-0.5 rounded border ${scoreBadge(scoreInfo.score)}`}>
                            {scoreInfo.score}
                          </span>
                        )}
                        <p className={`text-sm ${tr.changed ? "line-through text-gray-500" : "text-gray-200"}`}>
                          {tr.original}
                        </p>
                      </div>

                      {/* Chinese intermediate */}
                      <div className="ml-8 space-y-1.5">
                        <p className="text-sm text-teal-400/70">
                          🇨🇳 {tr.chinese}
                        </p>

                        {/* Translated English */}
                        {tr.changed ? (
                          <p className="text-sm text-green-300">
                            → {tr.translated}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 italic">
                            → (same as original)
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ═══ Single-model sentence breakdown ═══ */}
            {viewMode === "single" && (
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-gray-400">Sentence Breakdown</h2>
                {analysis.sentences.map((s) => {
                  const rw = rewriteMap.get(s.index);
                  return (
                    <div
                      key={s.index}
                      className="p-3 bg-gray-900 rounded-lg border border-gray-800"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 pt-0.5">
                          <span className={`inline-block text-xs font-mono font-bold px-2 py-0.5 rounded border ${scoreBadge(s.score)}`}>
                            {s.score}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className={`text-sm ${rw ? "line-through text-gray-500" : "text-gray-200"}`}>
                            {s.text}
                          </p>
                          {rw && (
                            <div className="space-y-1">
                              <p className="text-sm text-green-300">→ {rw.rewritten}</p>
                              {rw.changes && rw.changes.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {rw.changes.map((c, ci) => (
                                    <span key={ci} className="text-xs px-1.5 py-0.5 rounded bg-green-950 text-green-400 border border-green-800">
                                      {c.from} → {c.to}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {s.flags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {s.flags.map((f, i) => (
                                <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 w-16 pt-1.5">
                          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${scoreColor(s.score)}`}
                              style={{ width: `${Math.min(s.score * 10, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Final output */}
            {resultText && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-gray-400">
                    Humanized Output{" "}
                    {viewMode === "pipeline" && "(Perturb + Google Translate)"}
                    {viewMode === "multi" && "(random selection from 3 models)"}
                    {viewMode === "translate" && "(EN → 中文 → EN)"}
                  </h2>
                  <button
                    className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
                    onClick={() => navigator.clipboard.writeText(resultText)}
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                  <pre className="text-sm whitespace-pre-wrap font-mono text-green-200">
                    {resultText}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
