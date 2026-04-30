'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import { Document } from '@tiptap/extension-document';
import { Node } from '@tiptap/core';
import './poc.css';

export const PocDoc = Document.extend({ content: 'row+' });

export const HeadingRow = Node.create({
  name: 'heading_row',
  group: 'row',
  content: 'text*',
  defining: true,
  addAttributes() { return { id: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-row-kind="heading"]' }]; },
  renderHTML({ node }) {
    return ['div', { 'data-row-kind': 'heading', 'data-row-id': node.attrs.id }, 0];
  },
});

export const PlainRow = Node.create({
  name: 'plain_row',
  group: 'row',
  content: 'text*',
  defining: true,
  addAttributes() { return { id: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-row-kind="plain"]' }]; },
  renderHTML({ node }) {
    return ['div', { 'data-row-kind': 'plain', 'data-row-id': node.attrs.id }, 0];
  },
});

export const BulletRow = Node.create({
  name: 'bullet_row',
  group: 'row',
  content: 'text*',
  defining: true,
  addAttributes() { return { id: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-row-kind="bullet"]' }]; },
  renderHTML({ node }) {
    return ['div', { 'data-row-kind': 'bullet', 'data-row-id': node.attrs.id }, 0];
  },
});

interface PocEditorProps {
  /** When true, mount in read-only mode (used by /print route). */
  readOnly?: boolean;
}

export function PocEditor({ readOnly = false }: PocEditorProps) {
  const editor = useEditor({
    extensions: [PocDoc, HeadingRow, PlainRow, BulletRow],
    editable: !readOnly,
    content: buildPocContent(),
    immediatelyRender: false,
  });

  if (!editor) return null;
  return (
    <div className="poc-canvas-root">
      <div className="poc-editor-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function buildPocContent() {
  // 4 sections × 18 bullets — exercises 3-4 page boundaries to validate pagination.
  const sections = ['Experience', 'Education', 'Skills', 'Projects'];
  const content: { type: string; attrs: { id: string }; content?: { type: 'text'; text: string }[] }[] = [];
  let i = 0;
  for (const s of sections) {
    content.push({ type: 'heading_row', attrs: { id: `r${i++}` }, content: [{ type: 'text', text: s }] });
    for (let j = 0; j < 18; j++) {
      content.push({
        type: 'bullet_row',
        attrs: { id: `r${i++}` },
        content: [{ type: 'text', text: `${s} bullet ${j + 1}: ` + 'lorem ipsum dolor sit amet, '.repeat(4).trim() }],
      });
    }
  }
  return { type: 'doc', content };
}
