// frontend/src/components/resume/ResumeEditor.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import { usePageContext } from "@/hooks/usePageContext";
import { useResumeEditorStore } from "@/stores/resumeEditor";
import { loadFromLocal, saveToLocal } from "@/lib/localResumeStore";
import { SEED_DOC, SEED_META } from "./seed";
import { EditorCanvas } from "./EditorCanvas";
import { EditorTopBar } from "./EditorTopBar";
import type { ResumeDoc } from "./types";

const AUTOSAVE_DEBOUNCE_MS = 500;

export function ResumeEditor({ id }: { id: string }) {
  const meta = useResumeEditorStore((s) => s.meta);
  const doc = useResumeEditorStore((s) => s.doc);
  const saveStatus = useResumeEditorStore((s) => s.saveStatus);
  const setAll = useResumeEditorStore((s) => s.setAll);
  const setDoc = useResumeEditorStore((s) => s.setDoc);
  const setSaveStatus = useResumeEditorStore((s) => s.setSaveStatus);

  const [editor, setEditor] = useState<Editor | null>(null);

  // Load from local or seed on mount / id change
  useEffect(() => {
    const stored = loadFromLocal(id);
    if (stored) {
      setAll(stored.meta, stored.doc);
    } else {
      setAll({ ...SEED_META, id }, SEED_DOC);
    }
  }, [id, setAll]);

  // AI panel page context
  usePageContext({
    page: "resume_editor",
    summary: meta
      ? `正在编辑「${meta.title}」简历${
          meta.target_company ? `，目标 ${meta.target_company} · ${meta.target_role ?? ""}` : ""
        }`
      : "Resume editor loading",
    data: { resume_id: id },
  });

  // Debounced autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChange = (next: ResumeDoc) => {
    setDoc(next);
    if (!meta) return;
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        saveToLocal(id, meta, next);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  if (!meta || !doc) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-400">
        Loading resume…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-[240px]">
      <EditorTopBar meta={meta} saveStatus={saveStatus} editor={editor} />
      <EditorCanvas doc={doc} onChange={handleChange} onReady={setEditor} />
    </div>
  );
}
