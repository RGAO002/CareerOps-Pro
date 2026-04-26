// frontend/src/components/resume/extensions/nodeViews/SectionNodeView.tsx
"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { HoverAffordance } from "../../HoverAffordance";

export function SectionNodeView(props: NodeViewProps) {
  const { editor, node, getPos } = props;
  const heading = (node.attrs.heading as string) ?? "Section";

  function addEntryBelow() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    const end = pos + node.nodeSize - 1;
    editor
      .chain()
      .focus()
      .insertContentAt(end, {
        type: "entry",
        attrs: { title: "", meta: "" },
        content: [{ type: "bullet", content: [] }],
      })
      .run();
  }

  function del() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }

  function updateHeading(value: string) {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeAttribute(pos, "heading", value);
        return true;
      })
      .run();
  }

  return (
    <NodeViewWrapper as="section" className="resume-section" data-resume-section="">
      <HoverAffordance onAdd={addEntryBelow} onDelete={del}>
        <input
          contentEditable={false}
          value={heading}
          onChange={(e) => updateHeading(e.target.value)}
          className="resume-section-heading w-full bg-transparent uppercase outline-none"
          placeholder="SECTION HEADING"
        />
        <NodeViewContent as="div" className="resume-section-body" />
      </HoverAffordance>
    </NodeViewWrapper>
  );
}
