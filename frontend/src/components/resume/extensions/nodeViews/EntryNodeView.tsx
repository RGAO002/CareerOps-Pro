// frontend/src/components/resume/extensions/nodeViews/EntryNodeView.tsx
"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { HoverAffordance } from "../../HoverAffordance";

export function EntryNodeView(props: NodeViewProps) {
  const { editor, node, getPos } = props;
  const title = (node.attrs.title as string) ?? "";
  const meta = (node.attrs.meta as string) ?? "";

  function addBulletBelow() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    const end = pos + node.nodeSize - 1;
    editor.chain().focus().insertContentAt(end, { type: "bullet", content: [] }).run();
  }

  function del() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }

  function updateAttr(key: "title" | "meta", value: string) {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeAttribute(pos, key, value);
        return true;
      })
      .run();
  }

  return (
    <NodeViewWrapper className="resume-entry" data-resume-entry="">
      <HoverAffordance onAdd={addBulletBelow} onDelete={del}>
        <input
          contentEditable={false}
          value={title}
          onChange={(e) => updateAttr("title", e.target.value)}
          className="resume-entry-title w-full bg-transparent outline-none"
          placeholder="Title (e.g. Software Engineer @ Acme)"
        />
        <input
          contentEditable={false}
          value={meta}
          onChange={(e) => updateAttr("meta", e.target.value)}
          className="resume-entry-meta w-full bg-transparent outline-none"
          placeholder="Date · Location"
        />
        <NodeViewContent<"ul"> as="ul" className="resume-entry-bullets" />
      </HoverAffordance>
    </NodeViewWrapper>
  );
}
