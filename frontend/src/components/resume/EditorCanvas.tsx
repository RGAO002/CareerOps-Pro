// frontend/src/components/resume/EditorCanvas.tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { createResumeEditorExtensions } from "./extensions/createResumeEditor";
import type { ResumeDoc } from "./types";
import { AddSectionPopover } from "./AddSectionPopover";
import { PageBreakOverlay } from "./PageBreakOverlay";

import "./resume-editor.css";

interface Props {
  doc: ResumeDoc;
  /** Called with the latest ResumeDoc after every change. Parent debounces and saves. */
  onChange: (doc: ResumeDoc) => void;
  /** Receives the editor instance once mounted — used by FloatingToolbar. */
  onReady?: (editor: Editor) => void;
}

export function EditorCanvas({ doc, onChange, onReady }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    ...createResumeEditorExtensions(doc),
    immediatelyRender: false, // avoid SSR hydration mismatch
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON() as ResumeDoc);
    },
  });

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  // Sync external doc changes (e.g. variant switch) into the editor
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(doc);
    if (current !== incoming) {
      editor.commands.setContent(doc as unknown as Parameters<typeof editor.commands.setContent>[0], { emitUpdate: false });
    }
  }, [doc, editor]);

  if (!editor) return null;

  return (
    // Outer flex column so the AddSectionPopover sits below the page-card stack,
    // not on top of it. Inner div is the positioned context for the canvas +
    // page-card backgrounds + page indicators.
    <div className="mx-auto flex w-fit flex-col">
      <div className="relative">
        {/* Page-card backgrounds (z-index: 0) sit BEHIND the canvas */}
        <PageBreakOverlay getCanvas={() => canvasRef.current} />
        {/* Canvas (z-index: 10 via .resume-canvas) renders on TOP of cards */}
        <div ref={canvasRef} className="resume-canvas">
          <EditorContent editor={editor} />
        </div>
      </div>
      <AddSectionPopover editor={editor} />
    </div>
  );
}
