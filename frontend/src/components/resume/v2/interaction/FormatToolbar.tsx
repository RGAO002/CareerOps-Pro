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
import { crossEditorSelection } from './CrossEditorSelection';
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

// Curated set of resume-friendly fonts. Default = unset = whatever the
// template / canvas CSS defines. Stored as the standard textStyle.fontFamily
// attribute via @tiptap/extension-font-family.
const FONT_CHOICES: { label: string; value: string | null }[] = [
  { label: 'Default',   value: null },
  { label: 'Inter',     value: 'Inter, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Times',     value: '"Times New Roman", Times, serif' },
  { label: 'Georgia',   value: 'Georgia, serif' },
  { label: 'Garamond',  value: 'Garamond, serif' },
  { label: 'Calibri',   value: 'Calibri, "Trebuchet MS", sans-serif' },
  { label: 'Arial',     value: 'Arial, sans-serif' },
];

// Font sizes in pt (resumes are typeset in pt, not px). Stored on textStyle
// via the custom FontSize extension as `font-size: <value>`.
const FONT_SIZE_CHOICES: { label: string; value: string | null }[] = [
  { label: 'Default', value: null },
  { label: '8',  value: '8pt' },
  { label: '9',  value: '9pt' },
  { label: '10', value: '10pt' },
  { label: '11', value: '11pt' },
  { label: '12', value: '12pt' },
  { label: '14', value: '14pt' },
  { label: '16', value: '16pt' },
  { label: '18', value: '18pt' },
  { label: '20', value: '20pt' },
  { label: '24', value: '24pt' },
  { label: '32', value: '32pt' },
];

export function FormatToolbar() {
  const [, force] = useState(0);
  const lastEditorRef = useRef<Editor | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [hlOpen, setHlOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);

  useEffect(() => atomFocusManager.subscribe(() => {
    const ed = atomFocusManager.currentEditor();
    if (ed) lastEditorRef.current = ed;
    force(n => n + 1);
  }), []);

  useEffect(() => useResumeStore.subscribe(s => s.resume, () => force(n => n + 1)), []);

  // Close popovers on outside click
  useEffect(() => {
    if (!colorOpen && !hlOpen && !fontOpen && !sizeOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.('[data-toolbar-popover]') && !t.closest?.('[data-toolbar-trigger]')) {
        setColorOpen(false); setHlOpen(false); setFontOpen(false); setSizeOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [colorOpen, hlOpen, fontOpen, sizeOpen]);

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

  const runOnNativeSelection = (
    apply: (editor: Editor, from: number, to: number) => void,
  ): boolean => {
    const targets = selectedEditorRanges();
    if (targets.length === 0) return false;
    for (const t of targets) apply(t.editor, t.from, t.to);
    return true;
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
        onClick={() => {
          if (runOnNativeSelection((ed, from, to) => {
            ed.chain().setTextSelection({ from, to }).toggleBold().run();
          })) return;
          editor?.chain().focus().toggleBold().run();
        }}
        disabled={!has('bold')} className={btn(isActive('bold'), !has('bold'))}>
        <Bold className="size-3.5" strokeWidth={2.2} />
      </button>
      <button type="button" aria-label="Italic" title="Italic (⌘I)"
        onMouseDown={noStealFocus}
        onClick={() => {
          if (runOnNativeSelection((ed, from, to) => {
            ed.chain().setTextSelection({ from, to }).toggleItalic().run();
          })) return;
          editor?.chain().focus().toggleItalic().run();
        }}
        disabled={!has('italic')} className={btn(isActive('italic'), !has('italic'))}>
        <Italic className="size-3.5" strokeWidth={2} />
      </button>
      <button type="button" aria-label="Underline" title="Underline (⌘U)"
        onMouseDown={noStealFocus}
        onClick={() => {
          if (runOnNativeSelection((ed, from, to) => {
            ed.chain().setTextSelection({ from, to }).toggleUnderline().run();
          })) return;
          editor?.chain().focus().toggleUnderline().run();
        }}
        disabled={!has('underline')} className={btn(isActive('underline'), !has('underline'))}>
        <UnderlineIcon className="size-3.5" strokeWidth={2} />
      </button>

      {sep}

      {/* Font family — grouped with Text color per UX request */}
      <div className="relative">
        <button type="button" aria-label="Font family" title="Font family"
          data-toolbar-trigger
          onMouseDown={noStealFocus}
          onClick={() => { setFontOpen(o => !o); setColorOpen(false); setHlOpen(false); setSizeOpen(false); }}
          disabled={!has('textStyle')}
          className={`${btn(false, !has('textStyle'))} px-1.5`}
          style={{ width: 'auto', minWidth: 28 }}>
          <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>Aa</span>
        </button>
        {fontOpen && (
          <FontList
            choices={FONT_CHOICES}
            current={(editor?.getAttributes('textStyle').fontFamily as string | undefined) ?? null}
            apply={(value) => {
              if (runOnNativeSelection((ed, from, to) => {
                const chain = ed.chain().setTextSelection({ from, to });
                if (value === null) chain.unsetFontFamily().run();
                else chain.setFontFamily(value).run();
              })) {
                setFontOpen(false);
                return;
              }
              if (!editor) return;
              if (value === null) editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(value).run();
              setFontOpen(false);
            }}
          />
        )}
      </div>

      {/* Font size — sibling to Aa, applies to current selection / stored mark */}
      <div className="relative">
        <button type="button" aria-label="Font size" title="Font size"
          data-toolbar-trigger
          onMouseDown={noStealFocus}
          onClick={() => { setSizeOpen(o => !o); setFontOpen(false); setColorOpen(false); setHlOpen(false); }}
          disabled={!has('textStyle')}
          className={`${btn(false, !has('textStyle'))} px-1.5`}
          style={{ width: 'auto', minWidth: 28 }}>
          <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>pt</span>
        </button>
        {sizeOpen && (
          <FontList
            choices={FONT_SIZE_CHOICES}
            current={(editor?.getAttributes('textStyle').fontSize as string | undefined) ?? null}
            apply={(value) => {
              if (runOnNativeSelection((ed, from, to) => {
                const chain = ed.chain().setTextSelection({ from, to });
                if (value === null) chain.unsetFontSize().run();
                else chain.setFontSize(value).run();
              })) {
                setSizeOpen(false);
                return;
              }
              if (!editor) return;
              if (value === null) editor.chain().focus().unsetFontSize().run();
              else editor.chain().focus().setFontSize(value).run();
              setSizeOpen(false);
            }}
          />
        )}
      </div>

      {/* Text color */}
      <div className="relative">
        <button type="button" aria-label="Text color" title="Text color"
          data-toolbar-trigger
          onMouseDown={noStealFocus}
          onClick={() => { setColorOpen(o => !o); setHlOpen(false); setFontOpen(false); }}
          disabled={!has('textStyle')}
          className={btn(false, !has('textStyle'))}>
          <Type className="size-3.5" strokeWidth={2} />
        </button>
        {colorOpen && (
          <Palette
            palette={COLOR_PALETTE}
            apply={(value) => {
              if (runOnNativeSelection((ed, from, to) => {
                const chain = ed.chain().setTextSelection({ from, to });
                if (value === null) chain.unsetColor().run();
                else chain.setColor(value).run();
              })) {
                setColorOpen(false);
                return;
              }
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
          onClick={() => { setHlOpen(o => !o); setColorOpen(false); setFontOpen(false); }}
          disabled={!has('highlight')}
          className={btn(isActive('highlight'), !has('highlight'))}>
          <Highlighter className="size-3.5" strokeWidth={2} />
        </button>
        {hlOpen && (
          <Palette
            palette={HIGHLIGHT_PALETTE}
            apply={(value) => {
              if (runOnNativeSelection((ed, from, to) => {
                const chain = ed.chain().setTextSelection({ from, to });
                if (value === null) chain.unsetHighlight().run();
                else chain.toggleHighlight({ color: value }).run();
              })) {
                setHlOpen(false);
                return;
              }
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

function selectedEditorRanges(): Array<{ editor: Editor; from: number; to: number }> {
  const crossRanges = crossEditorSelection.getRanges();
  if (crossRanges.length > 0) {
    const byKey = new Map(atomFocusManager.editorsInOrder().map(item => [item.key, item.editor]));
    return crossRanges
      .map(({ key, from, to }) => {
        const editor = byKey.get(key);
        return editor ? { editor, from, to } : null;
      })
      .filter((item): item is { editor: Editor; from: number; to: number } => !!item);
  }

  if (typeof window === 'undefined') return [];
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  const root = document.querySelector('[data-canvas-root][data-mode="edit"]');
  if (!root || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return [];

  const targets: Array<{ editor: Editor; from: number; to: number }> = [];
  for (const { editor } of atomFocusManager.editorsInOrder()) {
    const dom = editor.view.dom;
    if (!root.contains(dom)) continue;
    if (!rangeIntersectsNode(range, dom)) continue;
    const bounds = editorRangeBounds(editor, range);
    if (!bounds || bounds.from === bounds.to) continue;
    targets.push({ editor, ...bounds });
  }
  return targets;
}

function editorRangeBounds(editor: Editor, range: Range): { from: number; to: number } | null {
  const dom = editor.view.dom;
  const docSize = editor.state.doc.content.size;
  let from = 0;
  let to = docSize;
  if (dom.contains(range.startContainer)) {
    from = safePosAtDOM(editor, range.startContainer, range.startOffset);
  }
  if (dom.contains(range.endContainer)) {
    to = safePosAtDOM(editor, range.endContainer, range.endOffset);
  }
  from = clampPos(from, docSize);
  to = clampPos(to, docSize);
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

function safePosAtDOM(editor: Editor, node: Node, offset: number): number {
  try {
    return editor.view.posAtDOM(node, offset);
  } catch {
    return 0;
  }
}

function clampPos(pos: number, docSize: number): number {
  return Math.max(0, Math.min(pos, docSize));
}

function rangeIntersectsNode(range: Range, node: Node): boolean {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

function FontList({
  choices, current, apply,
}: {
  choices: { label: string; value: string | null }[];
  /** The currently active fontFamily attr (or null = unset). Used for the
   *  active row highlight — exact-match against the choice's value. */
  current: string | null;
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
        padding: 4,
        width: 140,
        maxHeight: 240,
        overflowY: 'auto',
      }}
    >
      {choices.map(({ label, value }) => {
        const active = (current ?? null) === value;
        return (
          <button
            key={label}
            type="button"
            onClick={() => apply(value)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '4px 8px',
              borderRadius: 4,
              border: 'none',
              background: active ? '#e5e7eb' : 'transparent',
              cursor: 'pointer',
              fontFamily: value ?? undefined,
              fontSize: 12,
              color: '#111827',
            }}
            onMouseEnter={(e) => {
              if (!active) (e.currentTarget as HTMLElement).style.background = '#f3f4f6';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = active ? '#e5e7eb' : 'transparent';
            }}
          >
            {label}
          </button>
        );
      })}
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
