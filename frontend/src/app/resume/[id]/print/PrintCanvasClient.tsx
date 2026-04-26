// frontend/src/app/resume/[id]/print/PrintCanvasClient.tsx
"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useState } from "react";

import { createResumeEditorExtensions } from "@/components/resume/extensions/createResumeEditor";
import { resumeApi, type Resume } from "@/lib/resumeApi";

import "@/components/resume/resume-editor.css";
import "./print.css";

export function PrintCanvasClient({ id }: { id: string }) {
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
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Error: {error}</div>;
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

  // Signal to Playwright (or any waiting tool) that the canvas is fully
  // rendered. Playwright waits for this attribute via wait_for_selector.
  useEffect(() => {
    if (!editor) return;
    // Defer one frame so the DOM has actually painted
    const id = requestAnimationFrame(() => {
      document.body.setAttribute("data-print-ready", "true");
    });
    return () => cancelAnimationFrame(id);
  }, [editor]);

  if (!editor) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Preparing…</div>;
  }

  return (
    <div className="print-mode">
      <div className="resume-canvas">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
