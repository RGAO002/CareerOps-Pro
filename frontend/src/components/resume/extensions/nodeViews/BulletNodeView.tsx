// frontend/src/components/resume/extensions/nodeViews/BulletNodeView.tsx
"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { HoverAffordance } from "../../HoverAffordance";

export function BulletNodeView(props: NodeViewProps) {
  const { editor, getPos } = props;

  function addBelow() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    const after = pos + props.node.nodeSize;
    editor
      .chain()
      .focus()
      .insertContentAt(after, { type: "bullet", content: [] })
      .run();
  }

  function rewrite() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    window.dispatchEvent(
      new CustomEvent("resume:rewrite-bullet", {
        detail: { from: pos, to: pos + props.node.nodeSize, text: props.node.textContent },
      }),
    );
  }

  function del() {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + props.node.nodeSize })
      .run();
  }

  return (
    <NodeViewWrapper as="li" className="resume-bullet" data-resume-bullet="">
      <HoverAffordance onAdd={addBelow} onRewrite={rewrite} onDelete={del}>
        <NodeViewContent<"span"> as="span" />
      </HoverAffordance>
    </NodeViewWrapper>
  );
}
