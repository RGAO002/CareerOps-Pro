// frontend/src/components/resume/v2/fields/bullet-paste-normalize.ts
import { Slice, Fragment, Node as PMNode } from '@tiptap/pm/model';
import type { ProseMirrorBulletDoc, BlockId } from '../types';

/**
 * collapseToSingleParagraph: walk a Slice, gather all inline content from
 * any block-level child (paragraph, heading, list item, etc.), join them with
 * a single space when crossing block boundaries, and return a Slice that is
 * just inline content. The bullet's BulletDocument schema (content: 'paragraph')
 * will then accept it inside the existing single paragraph.
 */
export function collapseToSingleParagraph(slice: Slice): Slice {
  const inlineNodes: PMNode[] = [];
  let firstBlock = true;
  slice.content.forEach((node) => {
    if (node.isText || node.isInline) {
      inlineNodes.push(node);
      return;
    }
    if (node.isBlock) {
      if (!firstBlock && inlineNodes.length > 0) {
        inlineNodes.push(node.type.schema.text(' '));
      }
      firstBlock = false;
      node.descendants((desc) => {
        if (desc.isText) inlineNodes.push(desc);
      });
    }
  });
  return new Slice(Fragment.from(inlineNodes), 0, 0);
}

/**
 * Parse a possibly multi-paragraph HTML string. Returns a list of paragraph
 * texts (plain). Used by transformPastedHTML to decide if we need to spawn
 * additional bullets after the first paragraph.
 */
export function splitHtmlIntoParagraphs(html: string): string[] {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // First, replace <br> with paragraph splits
  tmp.querySelectorAll('br').forEach(br => {
    br.replaceWith(document.createTextNode('\n\n'));
  });
  const blocks: string[] = [];
  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text.trim()) blocks.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName.toLowerCase();
    if (tag === 'p' || tag === 'div' || tag === 'li' || /^h[1-6]$/.test(tag)) {
      const text = (node.textContent ?? '').trim();
      if (text) blocks.push(text);
      return;
    }
    node.childNodes.forEach(walk);
  }
  Array.from(tmp.childNodes).forEach(walk);
  // Re-split on \n\n boundaries that came from <br>
  const out: string[] = [];
  for (const b of blocks) {
    b.split(/\n\n+/).map(s => s.trim()).filter(Boolean).forEach(s => out.push(s));
  }
  return out;
}

/**
 * Build a ProseMirrorBulletDoc from plain text.
 */
export function plainTextToBulletDoc(text: string): ProseMirrorBulletDoc {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : undefined,
    }],
  };
}

export type SpawnExtraBullets = (
  currentBulletId: BlockId,
  extraTexts: string[],
) => void;

/**
 * Returns transformPastedHTML handler bound to a spawn callback.
 * The handler:
 *   - parses pasted HTML into paragraphs
 *   - if 1 paragraph: returns it as-is (TipTap will paste normally)
 *   - if N paragraphs: returns the FIRST one's HTML, schedules spawn of N-1 new bullets
 */
export function makeTransformPastedHTML(
  currentBulletId: BlockId,
  spawn: SpawnExtraBullets,
): (html: string) => string {
  return (html: string) => {
    const paragraphs = splitHtmlIntoParagraphs(html);
    if (paragraphs.length <= 1) return html;
    spawn(currentBulletId, paragraphs.slice(1));
    return `<p>${escapeHtml(paragraphs[0])}</p>`;
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
