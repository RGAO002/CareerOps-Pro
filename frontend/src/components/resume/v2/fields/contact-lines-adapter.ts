// frontend/src/components/resume/v2/fields/contact-lines-adapter.ts
import type { Editor } from '@tiptap/core';
import type { ContactItem, SingleLineDoc, ProseMirrorInline } from '../types';
import type { Align } from './single-line-adapter';

const SEPARATOR = '  |  ';   // double-space pipe double-space visual

export function contactItemsToDoc(items: ContactItem[], align?: Align): SingleLineDoc {
  const inline: ProseMirrorInline[] = [];
  items.forEach((item, i) => {
    if (i > 0) inline.push({ type: 'text', text: SEPARATOR });
    if (item.type === 'text') {
      if (item.value) inline.push({ type: 'text', text: item.value });
    } else {
      inline.push({
        type: 'text',
        text: item.label,
        marks: [{ type: 'link', attrs: { href: item.url } }],
      });
    }
  });
  const paragraph: SingleLineDoc['content'][0] = { type: 'paragraph' };
  if (align && align !== 'left') paragraph.attrs = { textAlign: align };
  if (inline.length > 0) paragraph.content = inline;
  return { type: 'doc', content: [paragraph] };
}

/**
 * Walk editor JSON and rebuild ContactItem[]. Text nodes with link mark
 * become {type:'link'}; bare text becomes {type:'text'}.
 * Splits on the SEPARATOR (resilient to user editing it).
 *
 * Reads the inline children of the (single) wrapping paragraph.
 */
export function docToContactItems(editor: Editor): ContactItem[] {
  const doc = editor.getJSON() as {
    content?: Array<{ type: string; content?: ProseMirrorInline[] }>;
  };
  const items: ContactItem[] = [];
  const para = doc.content?.[0];
  const nodes: ProseMirrorInline[] = (para?.content as ProseMirrorInline[] | undefined) ?? [];

  // Concatenate all text nodes preserving link mark per-segment, then split on SEPARATOR
  type Segment = { text: string; href?: string };
  const segments: Segment[] = [];
  for (const n of nodes) {
    if (n.type !== 'text') continue;
    const linkMark = n.marks?.find(m => m.type === 'link') as
      | { attrs: { href: string } }
      | undefined;
    segments.push({ text: n.text, href: linkMark?.attrs.href });
  }

  // Re-flatten then split on SEPARATOR boundaries while preserving link runs
  let buffer: Segment[] = [];
  for (const seg of segments) {
    if (seg.href) {
      // link runs are atomic items
      if (buffer.length) {
        items.push(...flushBuffer(buffer));
        buffer = [];
      }
      items.push({ type: 'link', label: seg.text, url: seg.href });
    } else {
      buffer.push(seg);
    }
  }
  if (buffer.length) items.push(...flushBuffer(buffer));
  return items.filter(i => i.type === 'link' || (i.type === 'text' && i.value));
}

function flushBuffer(buffer: { text: string }[]): ContactItem[] {
  const joined = buffer.map(b => b.text).join('');
  const parts = joined.split(SEPARATOR).map(s => s.trim()).filter(Boolean);
  return parts.map(p => ({ type: 'text' as const, value: p }));
}
