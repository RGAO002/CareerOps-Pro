// frontend/src/components/resume/AddSectionPopover.tsx
"use client";

import type { Editor } from "@tiptap/core";
import { useState } from "react";

interface Props {
  editor: Editor | null;
}

const PRESETS = ["Experience", "Projects", "Education", "Skills", "Awards", "Publications"];

export function AddSectionPopover({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  if (!editor) return null;

  function add(heading: string) {
    if (!editor) return;
    const docEnd = editor.state.doc.content.size;
    editor
      .chain()
      .focus()
      .insertContentAt(docEnd, {
        type: "resumeSection",
        attrs: { heading },
        content: [
          {
            type: "entry",
            attrs: { title: "", meta: "" },
            content: [{ type: "bullet", content: [] }],
          },
        ],
      })
      .run();
    setOpen(false);
    setCustom("");
  }

  return (
    <div className="my-4 flex justify-center">
      {open ? (
        <div className="w-72 rounded-md border border-neutral-200 bg-white p-3 shadow-md">
          <div className="mb-2 text-xs font-medium text-neutral-700">Add section</div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => add(p)}
                className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom heading"
              className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) add(custom.trim());
              }}
            />
            <button
              type="button"
              disabled={!custom.trim()}
              onClick={() => custom.trim() && add(custom.trim())}
              className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-30"
            >
              Add
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full text-center text-[11px] text-neutral-400 hover:text-neutral-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
        >
          + Add section
        </button>
      )}
    </div>
  );
}
