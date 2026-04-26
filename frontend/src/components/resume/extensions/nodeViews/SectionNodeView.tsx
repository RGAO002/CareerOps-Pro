// frontend/src/components/resume/extensions/nodeViews/SectionNodeView.tsx
"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useRef, useState } from "react";

import { HoverAffordance } from "../../HoverAffordance";

export function SectionNodeView(props: NodeViewProps) {
  const { editor, node, getPos } = props;
  const heading = (node.attrs.heading as string) ?? "Section";
  const handleRef = useRef<HTMLElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  function onDragStart(e: React.DragEvent) {
    const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    e.dataTransfer.setData("application/x-resume-section-pos", String(pos));
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("application/x-resume-section-pos")) {
      e.preventDefault();
      setDragOver(true);
    }
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const sourcePosStr = e.dataTransfer.getData("application/x-resume-section-pos");
    if (!sourcePosStr) return;
    const sourcePos = parseInt(sourcePosStr, 10);
    const targetPos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    if (sourcePos === targetPos) return;

    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const sourceNode = state.doc.nodeAt(sourcePos);
        if (!sourceNode) return false;
        const sourceSize = sourceNode.nodeSize;
        tr.delete(sourcePos, sourcePos + sourceSize);
        const adjusted = sourcePos < targetPos ? targetPos - sourceSize : targetPos;
        tr.insert(adjusted, sourceNode);
        return true;
      })
      .run();
  }

  return (
    <NodeViewWrapper
      as="section"
      className={`resume-section ${dragOver ? "ring-2 ring-blue-300" : ""}`}
      data-resume-section=""
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <HoverAffordance
        onAdd={addEntryBelow}
        onDelete={del}
        dragHandleRef={(el) => {
          handleRef.current = el;
          if (el) {
            el.draggable = true;
            el.addEventListener("dragstart", onDragStart as unknown as EventListener);
          }
        }}
      >
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
