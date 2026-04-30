'use client';

import * as React from 'react';
import type { Editor } from '@tiptap/core';
import {
  Bold,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Redo2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';

const COLOR_PALETTE = [
  { label: 'Default', value: null },
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
  { label: 'None', value: null },
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Pink', value: '#fbcfe8' },
  { label: 'Orange', value: '#fed7aa' },
  { label: 'Gray', value: '#e5e7eb' },
];

const FONT_CHOICES = [
  { label: 'Default', value: null },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Garamond', value: 'Garamond, serif' },
  { label: 'Calibri', value: 'Calibri, "Trebuchet MS", sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
];

const FONT_SIZE_CHOICES = [
  { label: 'Default', value: null },
  { label: '8', value: '8pt' },
  { label: '9', value: '9pt' },
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

interface Props {
  editor: Editor | null;
}

export function FormatToolbarV3({ editor }: Props) {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [open, setOpen] = React.useState<'font' | 'size' | 'color' | 'highlight' | null>(null);

  React.useEffect(() => {
    if (!editor) return;
    const rerender = () => force();
    editor.on('selectionUpdate', rerender);
    editor.on('transaction', rerender);
    return () => {
      editor.off('selectionUpdate', rerender);
      editor.off('transaction', rerender);
    };
  }, [editor]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-v3-toolbar-popover]') && !target.closest('[data-v3-toolbar-trigger]')) {
        setOpen(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const has = (mark: string) => !!editor && mark in editor.schema.marks;
  const active = (mark: string, attrs?: Record<string, unknown>) => !!editor && editor.isActive(mark, attrs);
  const noFocusSteal = (event: React.MouseEvent) => event.preventDefault();
  const btn = (isActive = false, disabled = false) =>
    `v3-toolbar-button${isActive ? ' v3-toolbar-button-active' : ''}${disabled ? ' v3-toolbar-button-disabled' : ''}`;
  const sep = <div className="v3-toolbar-separator" />;

  return (
    <div className="v3-format-toolbar" aria-label="Formatting toolbar">
      <button type="button" className={btn(false, !editor?.can().undo())} disabled={!editor?.can().undo()}
        title="Undo (⌘Z)" onMouseDown={noFocusSteal} onClick={() => editor?.chain().focus().undo().run()}>
        <Undo2 className="size-3.5" strokeWidth={1.8} />
      </button>
      <button type="button" className={btn(false, !editor?.can().redo())} disabled={!editor?.can().redo()}
        title="Redo (⌘⇧Z)" onMouseDown={noFocusSteal} onClick={() => editor?.chain().focus().redo().run()}>
        <Redo2 className="size-3.5" strokeWidth={1.8} />
      </button>

      {sep}

      <button type="button" className={btn(active('bold'), !has('bold'))} disabled={!has('bold')}
        title="Bold (⌘B)" onMouseDown={noFocusSteal} onClick={() => editor?.chain().focus().toggleBold().run()}>
        <Bold className="size-3.5" strokeWidth={2.2} />
      </button>
      <button type="button" className={btn(active('italic'), !has('italic'))} disabled={!has('italic')}
        title="Italic (⌘I)" onMouseDown={noFocusSteal} onClick={() => editor?.chain().focus().toggleItalic().run()}>
        <Italic className="size-3.5" strokeWidth={2} />
      </button>
      <button type="button" className={btn(active('underline'), !has('underline'))} disabled={!has('underline')}
        title="Underline (⌘U)" onMouseDown={noFocusSteal} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="size-3.5" strokeWidth={2} />
      </button>

      {sep}

      <MenuButton label="Aa" title="Font family" open={open === 'font'} disabled={!has('textStyle')}
        onMouseDown={noFocusSteal} onClick={() => setOpen(open === 'font' ? null : 'font')}>
        <ListPopover
          choices={FONT_CHOICES}
          current={(editor?.getAttributes('textStyle').fontFamily as string | undefined) ?? null}
          apply={(value) => {
            if (!editor) return;
            if (value === null) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(value).run();
            setOpen(null);
          }}
        />
      </MenuButton>

      <MenuButton label="pt" title="Font size" open={open === 'size'} disabled={!has('textStyle')}
        onMouseDown={noFocusSteal} onClick={() => setOpen(open === 'size' ? null : 'size')}>
        <ListPopover
          choices={FONT_SIZE_CHOICES}
          current={(editor?.getAttributes('textStyle').fontSize as string | undefined) ?? null}
          apply={(value) => {
            if (!editor) return;
            if (value === null) editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(value).run();
            setOpen(null);
          }}
        />
      </MenuButton>

      <MenuButton icon={<Type className="size-3.5" strokeWidth={2} />} title="Text color"
        open={open === 'color'} disabled={!has('textStyle')}
        onMouseDown={noFocusSteal} onClick={() => setOpen(open === 'color' ? null : 'color')}>
        <PalettePopover
          palette={COLOR_PALETTE}
          apply={(value) => {
            if (!editor) return;
            if (value === null) editor.chain().focus().unsetColor().run();
            else editor.chain().focus().setColor(value).run();
            setOpen(null);
          }}
        />
      </MenuButton>

      <MenuButton icon={<Highlighter className="size-3.5" strokeWidth={2} />} title="Highlight"
        open={open === 'highlight'} disabled={!has('highlight')}
        onMouseDown={noFocusSteal} onClick={() => setOpen(open === 'highlight' ? null : 'highlight')}>
        <PalettePopover
          palette={HIGHLIGHT_PALETTE}
          apply={(value) => {
            if (!editor) return;
            if (value === null) editor.chain().focus().unsetHighlight().run();
            else editor.chain().focus().toggleHighlight({ color: value }).run();
            setOpen(null);
          }}
        />
      </MenuButton>

      {sep}

      <button type="button" className={btn(active('link'), !has('link'))} disabled={!has('link')}
        title="Link" onMouseDown={noFocusSteal}
        onClick={() => {
          if (!editor) return;
          const previous = editor.getAttributes('link').href as string | undefined;
          const url = window.prompt('Link URL', previous ?? 'https://');
          if (url === null) return;
          if (url === '') editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }}>
        <LinkIcon className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

function MenuButton({
  label,
  icon,
  title,
  open,
  disabled,
  onMouseDown,
  onClick,
  children,
}: {
  label?: string;
  icon?: React.ReactNode;
  title: string;
  open: boolean;
  disabled: boolean;
  onMouseDown: (event: React.MouseEvent) => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="v3-toolbar-menu">
      <button type="button" data-v3-toolbar-trigger title={title} disabled={disabled}
        className={`v3-toolbar-button${disabled ? ' v3-toolbar-button-disabled' : ''}`}
        onMouseDown={onMouseDown} onClick={onClick}>
        {icon ?? <span className="v3-toolbar-text-label">{label}</span>}
      </button>
      {open ? children : null}
    </div>
  );
}

function ListPopover({
  choices,
  current,
  apply,
}: {
  choices: Array<{ label: string; value: string | null }>;
  current: string | null;
  apply: (value: string | null) => void;
}) {
  return (
    <div data-v3-toolbar-popover className="v3-toolbar-popover v3-toolbar-list" onMouseDown={(event) => event.preventDefault()}>
      {choices.map(({ label, value }) => (
        <button key={label} type="button" className={current === value ? 'active' : ''}
          style={{ fontFamily: value ?? undefined }} onClick={() => apply(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function PalettePopover({
  palette,
  apply,
}: {
  palette: Array<{ label: string; value: string | null }>;
  apply: (value: string | null) => void;
}) {
  return (
    <div data-v3-toolbar-popover className="v3-toolbar-popover v3-toolbar-palette" onMouseDown={(event) => event.preventDefault()}>
      {palette.map(({ label, value }) => (
        <button key={label} type="button" title={label} onClick={() => apply(value)}
          style={{ background: value ?? 'linear-gradient(135deg, #fff 45%, #ef4444 47%, #ef4444 53%, #fff 55%)' }} />
      ))}
    </div>
  );
}
