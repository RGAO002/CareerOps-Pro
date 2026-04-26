import Document from '@tiptap/extension-document';

/** name/title/meta/heading: just text nodes, no block-level structure. */
export const SingleLineDocument = Document.extend({
  name: 'doc',
  content: 'text*',
});
