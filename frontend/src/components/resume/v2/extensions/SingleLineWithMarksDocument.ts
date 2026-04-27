import Document from '@tiptap/extension-document';

/**
 * contact_lines: a single paragraph wrapping inline content (text + marks
 * like Link). See SingleLineDocument for why paragraph wrapping is needed
 * (TextAlign attaches to the paragraph node).
 */
export const SingleLineWithMarksDocument = Document.extend({
  name: 'doc',
  content: 'paragraph',
});
