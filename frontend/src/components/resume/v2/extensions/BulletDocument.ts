import Document from '@tiptap/extension-document';

/** bullet.content: schema-enforced exactly-one paragraph. */
export const BulletDocument = Document.extend({
  name: 'doc',
  content: 'paragraph',
});
