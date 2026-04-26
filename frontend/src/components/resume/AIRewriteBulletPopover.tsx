// frontend/src/components/resume/AIRewriteBulletPopover.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { resumeApi } from "@/lib/resumeApi";

const PRESETS = [
  { value: "default", label: "Default" },
  { value: "add_quantitative_impact", label: "Add quantitative impact" },
  { value: "stronger_ownership_verbs", label: "Stronger ownership verbs" },
  { value: "tailored_to_variant", label: "Tailored to current variant" },
];

interface RewriteRequest {
  from: number;
  to: number;
  text: string;
}

interface Props {
  resumeId: string;
  editor: Editor | null;
}

export function AIRewriteBulletPopover({ resumeId, editor }: Props) {
  const [req, setReq] = useState<RewriteRequest | null>(null);
  const [preset, setPreset] = useState("default");
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onRewrite(e: Event) {
      const ce = e as CustomEvent<RewriteRequest>;
      setReq(ce.detail);
      setSuggestion(null);
      setError(null);
      setPreset("default");
      setCustom("");
    }
    window.addEventListener("resume:rewrite-bullet", onRewrite);
    return () => window.removeEventListener("resume:rewrite-bullet", onRewrite);
  }, []);

  if (!req || !editor) return null;

  async function generate() {
    if (!req) return;
    setLoading(true);
    setError(null);
    try {
      const r = await resumeApi.rewriteBullet(resumeId, {
        bullet_text: req.text,
        preset,
        custom_instructions: custom.trim() || undefined,
      });
      setSuggestion(r.rewritten);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }

  async function accept() {
    if (!suggestion || !req || !editor) return;
    // Snapshot the pre-edit state FIRST so this AI rewrite is undoable even if
    // the edit succeeds and a later network blip drops the snapshot post-call.
    try {
      await resumeApi.createSnapshot(resumeId, {
        trigger: "ai_edit",
        diff_summary: `Pre-AI-rewrite checkpoint (preset: ${preset})`,
      });
    } catch {
      // If snapshot fails, abort rather than apply an irreversible edit
      setError("Couldn't create safety snapshot — try again");
      return;
    }
    editor
      .chain()
      .focus()
      .deleteRange({ from: req.from + 1, to: req.to - 1 })
      .insertContentAt(req.from + 1, [{ type: "text", text: suggestion }])
      .run();
    close();
  }

  function close() {
    setReq(null);
    setSuggestion(null);
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[460px] rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-purple-500" />
            Rewrite this bullet
          </h3>
          <button onClick={close} className="rounded p-1 hover:bg-neutral-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="mb-3 max-h-20 overflow-y-auto rounded bg-neutral-50 p-2 text-xs text-neutral-700">
          {req.text || "(empty bullet)"}
        </div>
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-neutral-600">Style</span>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-neutral-600">
            Custom instructions (optional)
          </span>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. Emphasize team leadership"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        {suggestion && (
          <div className="mb-3 rounded border border-purple-200 bg-purple-50 p-2 text-xs text-purple-900">
            <div className="mb-1 text-[10px] font-semibold uppercase text-purple-600">
              Suggested
            </div>
            {suggestion}
          </div>
        )}
        {error && <div className="mb-2 text-xs text-red-600">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            disabled={loading}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          {suggestion ? (
            <>
              <button
                onClick={generate}
                disabled={loading}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Try again
              </button>
              <button
                onClick={accept}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
              >
                Replace
              </button>
            </>
          ) : (
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              Generate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
