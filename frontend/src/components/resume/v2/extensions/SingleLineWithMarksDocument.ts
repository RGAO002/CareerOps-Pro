import Document from '@tiptap/extension-document';

/** contact_lines: text + inline marks (link), still no block. */
export const SingleLineWithMarksDocument = Document.extend({
  name: 'doc',
  content: 'inline*',
});
