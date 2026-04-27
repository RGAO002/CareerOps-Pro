// frontend/src/components/resume/v2/interaction/FormatToolbar.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon,
  Undo2, Redo2, Type, Highlighter,
  AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';
import type { Editor } from '@tiptap/core';
import { atomFocusManager } from './AtomFocusManager';
import { useResumeStore } from '../store/useResumeStore';

const COLOR_PALETTE = [
  { label: 'Default', value: null },        // null = unset
  { label: 'Black', value: '#111827' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Yellow', value: '#ca8a04' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#9333ea' },
];

const HIGHLIGHT_PALETTE = [
  { label: 'None',    value: null },
  { label: 'Yellow',  value: '#fef08a' },
  { label: 'Green',   value: '#bbf7d0' },
  { label: 'Blue',    value: '#bfdbfe' },
  { label: 'Pink',    value: '#fbcfe8' },
  { label: 'Orange',  value: '#fed7aa' },
  { label: 'Gray',    value: '#e5e7eb' },
];

export function FormatToolbar() {
  const [, force] = useState(0);
  const lastEditorRef = useRef<Editor | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [hlOpen, setHlOpen] = useState(false);

  useEffect(() => atomFocusManager.subscribe(() => {
    const ed = atomFocusManager.currentEditor();
    if (ed) lastEditorRef.current = ed;
    force(n => n + 1);
  }), []);

  useEffect(() => useResumeStore.subscribe(s => s.resume, () => force(n => n + 1)), []);

  // Close popovers on outside click
  useEffect(() => {
    if (!colorOpen && !hlOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.('[data-toolbar-popover]') && !t.closest?.('[data-toolbar-trigger]')) {
        setColorOpen(false); setHlOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [colorOpen, hlOpen]);

  const liveEditor = atomFocusManager.currentEditor();
  const editor: Editor | null = liveEditor ?? lastEditorRef.current;

  const isActive = (mark: string, attrs?: Record<string, unknown>) =>
    !!editor && editor.isActive(mark, attrs);
  const isAlign = (val: string) => !!editor && editor.isActive({ textAlign: val });
  const has = (mark: string) => !!editor && mark in editor.schema.marks;
  const hasTextAlign = !!editor && 'paragraph' in editor.schema.nodes
    && Boolean((editor.schema.nodes.paragraph?.spec.attrs as any)?.textAlign);

  const tiptapCanUndo = !!liveEditor && liveEditor.can().undo();
  const tiptapCanRedo = !!liveEditor && liveEditor.can().redo();
  const storeCanUndo = useResumeStore.getState()._undo.canUndo();
  const storeCanRedo = useResumeStore.getState()._undo.canRedo();
  const canUndo = tiptapCanUndo || storeCanUndo;
  const canRedo = tiptapCanRedo || storeCanRedo;

  const doUndo = () => {
    if (tiptapCanUndo) liveEditor!.chain().focus().undo().run();
    else if (storeCanUndo) useResumeStore.getState().undo();
  };
  const doRedo = () => {
    if (tiptapCanRedo) liveEditor!.chain().focus().redo().run();
    else if (storeCanRedo) useResumeStore.getState().redo();
  };

  const btn = (active: boolean, disabled = false) =>
    `flex size-7 items-center justify-center rounded-md transition-colors ${
      disabled
        ? 'text-neutral-300 cursor-not-allowed'
        : active
          ? 'bg-neutral-200 text-neutral-900'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
    }`;

  const noStealFocus = (e: React.MouseEvent) => e.preventDefault();
  const sep = <div className="mx-0.5 h-4 w-px bg-neutral-200" />;

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-white/70 p-0.5">
      {/* Undo / Redo */}
      <button type="button" aria-label="Undo" title="Undo (⌘Z)"
        onMouseDown={noStealFocus} onClick={doUndo} disabled={!canUndo}
        className={btn(false, !canUndo)}>
        <Undo2 className="size-3.5" strokeWidth={1.8} />
      </button>
      <button type="button" aria-label="Redo" title="Redo (⌘⇧Z)"
        onMouseDown={noStealFocus} onClick={doRedo} disabled={!canRedo}
        className={btn(false, !canRedo)}>
        <Redo2 className="size-3.5" strokeWidth={1.8} />
      </button>

      {sep}

      {/* B / I / U */}
      <button type="button" aria-label="Bold" title="Bold (⌘B)"
        onMouseDown={noStealFocus}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        disabled={!has('bold')} className={btn(isActive('bold'), !has('bold'))}>
        <Bold className="size-3.5" strokeWidth={2.2} />
      </button>
      <button type="button" aria-label="Italic" title="Italic (⌘I)"
        onMouseDown={noStealFocus}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        disabled={!has('italic')} className={btn(isActive('italic'), !has('italic'))}>
        <Italic className="size-3.5" strokeWidth={2} />
      </button>
      <button type="button" aria-label="Underline" title="Underline (⌘U)"
        onMouseDown={noStealFocus}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        disabled={!has('underline')} className={btn(isActive('underline'), !has('underline'))}>
        <UnderlineIcon className="size-3.5" strokeWidth={2} />
      </button>

      {sep}

      {/* Text color */}
      <div className="relative">
        <button type="button" aria-label="Text color" title="Text color"
          data-toolbar-trigger
          onMouseDown={noStealFocus}
          onClick={() => { setColorOpen(o => !o); setHlOpen(false); }}
          disabled={!has('textStyle')}
          className={btn(false, !has('textStyle'))}>
          <Type className="size-3.5" strokeWidth={2} />
        </button>
        {colorOpen && (
          <Palette
            palette={COLOR_PALETTE}
            apply={(value) => {
              if (!editor) return;
              if (value === null) editor.chain().focus().unsetColor().run();
              else editor.chain().focus().setColor(value).run();
              setColorOpen(false);
            }}
          />
        )}
      </div>

      {/* Highlight color */}
      <div className="relative">
        <button type="button" aria-label="Highlight" title="Highlight"
          data-toolbar-trigger
          onMouseDown={noStealFocus}
          onClick={() => { setHlOpen(o => !o); setColorOpen(false); }}
          disabled={!has('highlight')}
          className={btn(isActive('highlight'), !has('highlight'))}>
          <Highlighter className="size-3.5" strokeWidth={2} />
        </button>
        {hlOpen && (
          <Palette
            palette={HIGHLIGHT_PALETTE}
            apply={(value) => {
              if (!editor) return;
              if (value === null) editor.chain().focus().unsetHighlight().run();
              else editor.chain().focus().toggleHighlight({ color: value }).run();
              setHlOpen(false);
            }}
          />
        )}
      </div>

      {sep}

      {/* Text alignment (paragraph-only — bullets) */}
      <button type="button" aria-label="Align left" title="Align left"
        onMouseDown={noStealFocus}
        onClick={() => editor?.chain().focus().setTextAlign('left').run()}
        disabled={!hasTextAlign} className={btn(isAlign('left') || (hasTextAlign && !isAlign('center') && !isAlign('right')), !hasTextAlign)}>
        <AlignLeft className="size-3.5" strokeWidth={2} />
      </button>
      <button type="button" aria-label="Align center" title="Align center"
        onMouseDown={noStealFocus}
        onClick={() => editor?.chain().focus().setTextAlign('center').run()}
        disabled={!hasTextAlign} className={btn(isAlign('center'), !hasTextAlign)}>
        <AlignCenter className="size-3.5" strokeWidth={2} />
      </button>
      <button type="button" aria-label="Align right" title="Align right"
        onMouseDown={noStealFocus}
        onClick={() => editor?.chain().focus().setTextAlign('right').run()}
        disabled={!hasTextAlign} className={btn(isAlign('right'), !hasTextAlign)}>
        <AlignRight className="size-3.5" strokeWidth={2} />
      </button>

      {sep}

      {/* Link */}
      <button type="button" aria-label="Link" title="Link"
        onMouseDown={noStealFocus}
        onClick={() => {
          if (!editor) return;
          const prev = editor.getAttributes('link').href as string | undefined;
          const url = window.prompt('Link URL', prev ?? 'https://');
          if (url === null) return;
          if (url === '') editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }}
        disabled={!has('link')} className={btn(isActive('link'), !has('link'))}>
        <LinkIcon className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

function Palette({
  palette, apply,
}: {
  palette: { label: string; value: string | null }[];
  apply: (v: string | null) => void;
}) {
  return (
    <div
      data-toolbar-popover
      className="rounded-md border border-neutral-200 bg-white shadow-md"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'absolute',
        left: 0,
        top: 'calc(100% + 4px)',
        zIndex: 50,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 24px)',
        gap: 4,
        padding: 8,
        width: 'max-content',
      }}
    >
      {palette.map(({ label, value }) => (
        <button
          key={label}
          type="button"
          title={label}
          onClick={() => apply(value)}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: '1px solid #e5e7eb',
            cursor: 'pointer',
            padding: 0,
            background: value ?? 'white',
            backgroundImage: value === null
              ? 'linear-gradient(45deg, transparent 45%, #dc2626 45%, #dc2626 55%, transparent 55%)'
              : undefined,
            transition: 'transform 0.1s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
        />
      ))}
    </div>
  );
}
