// frontend/src/app/resume/[id]/print/PrintView.tsx
"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useState } from "react";

import { createResumeEditorExtensions } from "@/components/resume/extensions/createResumeEditor";
import { resumeApi, type Resume } from "@/lib/resumeApi";

import "@/components/resume/resume-editor.css";
import "./print.css";

/**
 * Dedicated print view — renders ONLY the resume canvas (no AppShell, no
 * sidebar, no AI panel). Auto-fires window.print() once the content has
 * laid out. This isolates the print output from the editor's app chrome
 * so layout systems (sidebar grid, etc.) can't squeeze the canvas.
 */
export function PrintView({ id }: { id: string }) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resumeApi
      .get(id)
      .then((r) => !cancelled && setResume(r))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        Couldn’t load resume: {error}
      </div>
    );
  }
  if (!resume) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Loading…</div>;
  }

  return <PrintCanvas resume={resume} />;
}

function PrintCanvas({ resume }: { resume: Resume }) {
  const editor = useEditor({
    ...createResumeEditorExtensions(
      resume.doc as Parameters<typeof createResumeEditorExtensions>[0],
    ),
    editable: false,
    immediatelyRender: false,
  });

  // Auto-print once editor has laid out
  useEffect(() => {
    if (!editor) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [editor]);

  if (!editor) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Preparing…</div>;
  }

  return (
    <div className="print-stage">
      <div className="resume-canvas resume-canvas--print">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
