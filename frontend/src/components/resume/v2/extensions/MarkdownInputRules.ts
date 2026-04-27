// frontend/src/components/resume/v2/extensions/MarkdownInputRules.ts
import { Extension, markInputRule } from '@tiptap/core';

/**
 * Bullet-only markdown shortcuts: **bold**, *italic*, [text](url) → bold/italic/link mark.
 */
export const MarkdownInputRules = Extension.create({
  name: 'markdownInputRules',
  addInputRules() {
    return [
      // **bold**
      markInputRule({
        find: /\*\*([^*]+)\*\*$/,
        type: this.editor.schema.marks.bold,
      }),
      // *italic*  (don't match leading ** for bold)
      markInputRule({
        find: /(?<!\*)\*([^*]+)\*(?!\*)$/,
        type: this.editor.schema.marks.italic,
      }),
      // [label](url)
      markInputRule({
        find: /\[([^\]]+)\]\(([^)]+)\)$/,
        type: this.editor.schema.marks.link,
        getAttributes: (match) => ({ href: match[2] }),
      }),
    ];
  },
});
