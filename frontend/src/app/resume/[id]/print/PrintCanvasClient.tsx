// frontend/src/app/resume/[id]/print/PrintCanvasClient.tsx
"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";

import { createResumeEditorExtensions } from "@/components/resume/extensions/createResumeEditor";
import type { Resume } from "@/lib/resumeApi";

import "@/components/resume/resume-editor.css";
import "./print.css";

export function PrintCanvasClient({ resume }: { resume: Resume }) {
  return <PrintCanvas resume={resume} />;
}

function PrintCanvas({ resume }: { resume: Resume }) {
  const editor = useEditor({
    ...createResumeEditorExtensions(
      resume.doc as Parameters<typeof createResumeEditorExtensions>[0],
    ),
    editable: false,
    // Even though page.tsx is a Server Component, this child Client Component
    // still SSRs in App Router. immediatelyRender: true throws on the server.
    // The data-print-ready signal below ensures Playwright waits for the
    // post-hydration render anyway.
    immediatelyRender: false,
  });

  // Signal to Playwright (or any waiting tool) that the canvas is fully
  // rendered. Playwright waits for this attribute via wait_for_selector.
  useEffect(() => {
    if (!editor) return;

    let raf1 = 0;
    let raf2 = 0;
    let cancelled = false;

    const markReady = async () => {
      // Wait for layout + font metrics so Playwright doesn't print a
      // half-painted canvas or a fallback-font layout.
      await document.fonts.ready;
      if (cancelled) return;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          if (!cancelled) {
            document.body.setAttribute("data-print-ready", "true");
          }
        });
      });
    };

    void markReady();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [editor]);

  if (!editor) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Preparing…</div>;
  }

  // No PageBreakOverlay here. The overlay is editor-only chrome (visual
  // page cards + JS push using a 1072px stride that includes the visible
  // gap). Chromium's PDF print uses a 1056px stride with no gap, so the
  // overlay's pushes would be off by 16px per page → empty trailing PDF
  // page. For PDF, we let Chromium paginate natively, using
  // `break-inside: avoid` CSS rules in resume-editor.css to keep entries
  // and bullets from splitting across pages.
  return (
    <div className="print-mode">
      <div className="resume-canvas">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
