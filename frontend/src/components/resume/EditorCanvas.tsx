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
    <div className="relative mx-auto w-fit">
      <div ref={canvasRef} className="resume-canvas">
        <EditorContent editor={editor} />
      </div>
      <PageBreakOverlay getCanvas={() => canvasRef.current} />
      <AddSectionPopover editor={editor} />
    </div>
  );
}
