// frontend/src/components/resume/ResumeEditor.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { usePageContext } from "@/hooks/usePageContext";
import { resumeApi, type Resume } from "@/lib/resumeApi";
import { useResumeEditorStore } from "@/stores/resumeEditor";

import { EditorCanvas } from "./EditorCanvas";
import { EditorTopBar } from "./EditorTopBar";
import { ImportBanner } from "./ImportBanner";

const AUTOSAVE_DEBOUNCE_MS = 500;

export function ResumeEditor({ id }: { id: string }) {
  const current = useResumeEditorStore((s) => s.current);
  const available = useResumeEditorStore((s) => s.available);
  const saveStatus = useResumeEditorStore((s) => s.saveStatus);
  const lastSavedAt = useResumeEditorStore((s) => s.lastSavedAt);
  const setCurrent = useResumeEditorStore((s) => s.setCurrent);
  const setAvailable = useResumeEditorStore((s) => s.setAvailable);
  const setDoc = useResumeEditorStore((s) => s.setDoc);
  const setSaveStatus = useResumeEditorStore((s) => s.setSaveStatus);
  const markSaved = useResumeEditorStore((s) => s.markSaved);

  const [editor, setEditor] = useState<Editor | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const [showBanner, setShowBanner] = useState(searchParams.get("just_imported") === "1");

  function dismissBanner() {
    setShowBanner(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("just_imported");
    router.replace(`/resume/${id}${params.toString() ? "?" + params.toString() : ""}`);
  }

  // Load current + list of all
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([resumeApi.get(id), resumeApi.list()])
      .then(([resume, list]) => {
        if (cancelled) return;
        setCurrent(resume);
        setAvailable(list.resumes);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, setCurrent, setAvailable]);

  // Debounced PUT on doc changes
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChange = (newDoc: Resume["doc"]) => {
    setDoc(newDoc);
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const c = useResumeEditorStore.getState().current;
      if (!c) return;
      resumeApi
        .upsert({ ...c, doc: newDoc })
        .then(() => markSaved())
        .catch(() => setSaveStatus("error"));
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  // Page context for AI panel
  usePageContext({
    page: "resume_editor",
    summary: current
      ? `正在编辑「${current.title}」简历${
          current.target_company
            ? `，目标 ${current.target_company} · ${current.target_role ?? ""}`
            : ""
        }`
      : "Resume editor loading",
    data: { resume_id: id },
  });

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-neutral-600">
        <div>Couldn't load resume: {loadError}</div>
        <a href="/upload" className="text-sm text-blue-600 underline">
          Upload a resume
        </a>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-400">
        Loading resume…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-[240px]">
      <EditorTopBar
        current={current}
        available={available}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        editor={editor}
      />
      {showBanner && <ImportBanner onDismiss={dismissBanner} />}
      <EditorCanvas doc={current.doc} onChange={handleChange} onReady={setEditor} />
    </div>
  );
}
