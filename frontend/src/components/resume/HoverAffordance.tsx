// frontend/src/components/resume/HoverAffordance.tsx
"use client";

import { GripVertical, Plus, Sparkles, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  onAdd?: () => void;
  onDelete?: () => void;
  onRewrite?: () => void;
  /** Forwards a ref-callback that should be set as drag handle. */
  dragHandleRef?: (el: HTMLElement | null) => void;
  children?: ReactNode;
}

export function HoverAffordance({
  onAdd,
  onDelete,
  onRewrite,
  dragHandleRef,
  children,
}: Props) {
  return (
    <div className="group/affordance relative">
      <div
        ref={dragHandleRef}
        contentEditable={false}
        className="absolute left-[-28px] top-1 hidden cursor-grab text-neutral-300 group-hover/affordance:flex active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </div>

      {children}

      <div
        contentEditable={false}
        className="pointer-events-none absolute right-[-92px] top-0 flex gap-0.5 opacity-0 transition-opacity group-hover/affordance:pointer-events-auto group-hover/affordance:opacity-100"
      >
        {onRewrite && (
          <IconButton onClick={onRewrite} title="AI rewrite (✨)">
            <Sparkles className="size-3.5" />
          </IconButton>
        )}
        {onAdd && (
          <IconButton onClick={onAdd} title="Add below">
            <Plus className="size-3.5" />
          </IconButton>
        )}
        {onDelete && (
          <IconButton onClick={onDelete} title="Delete">
            <Trash2 className="size-3.5" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function IconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex size-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
    >
      {children}
    </button>
  );
}
