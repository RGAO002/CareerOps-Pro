import Document from '@tiptap/extension-document';

/**
 * name/title/meta/heading: a single paragraph wrapping plain text.
 *
 * Why a paragraph (and not just `text*`)? TipTap's TextAlign extension
 * targets node attrs (e.g. paragraph.attrs.textAlign). Without a paragraph
 * node, alignment has nowhere to attach. The schema constraint of exactly
 * one `paragraph` (singular, not `paragraph+`) prevents Enter from
 * splitting the field — the split is rejected by ProseMirror and our
 * NoNewline keymap routes Enter to the next field instead.
 */
export const SingleLineDocument = Document.extend({
  name: 'doc',
  content: 'paragraph',
});
