// frontend/src/components/resume/v2/extensions/AtomKeyboardNav.ts
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from 'prosemirror-model';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import { forceShowTitle } from '../interaction/title-visibility';
import { insertBullet } from '../store/actions/insertBlock';
import { deleteBullet } from '../store/actions/deleteBlock';
import { setBulletKind } from '../store/actions/setBulletKind';
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin } from '../store/source-of-truth';
import type {
  BlockId, EditableField, ProseMirrorBulletDoc, ProseMirrorParagraph,
} from '../types';

export interface AtomKeyboardNavOptions {
  bulletId: BlockId;
  entryId: BlockId;
  field: EditableField;
}

/** Extract the inline content (text + marks) AFTER `cursorPos` in the
 *  bullet's single paragraph, returning a JSON paragraph node suitable for
 *  storing as the new bullet's doc body.
 *  If there's nothing after cursor, returns an empty paragraph. */
function suffixParagraphAfterCursor(editor: Editor, cursorPos: number): ProseMirrorParagraph {
  const { doc } = editor.state;
  // BulletDocument schema is `content: 'paragraph'` — exactly one paragraph child.
  const para: PMNode | undefined = doc.firstChild ?? undefined;
  if (!para) return { type: 'paragraph' };

  // The doc has exactly one paragraph. Inline content sits at positions
  // [1, 1 + paraContentSize). A doc-level slice(cursorPos, paraInlineEnd)
  // gives us the inline tail safely without crossing the paragraph close
  // token (which would force ProseMirror to wrap the result in a paragraph).
  const paraInlineEnd = 1 + para.content.size;
  // Carry over the paragraph's textAlign attr so the new bullet visually matches.
  const attrs = (para.attrs ?? {}) as { textAlign?: 'left' | 'center' | 'right' };
  const base: ProseMirrorParagraph = { type: 'paragraph' };
  if (attrs.textAlign) base.attrs = { textAlign: attrs.textAlign };

  if (cursorPos >= paraInlineEnd) return base;

  const sliced = doc.slice(cursorPos, paraInlineEnd);
  const json = sliced.toJSON() as
    | { content?: Array<unknown> }
    | undefined;
  const rawInline = json?.content ?? [];
  // sliced.toJSON() may return either inline content directly or wrapped in
  // a paragraph depending on openStart/openEnd. Normalize both shapes.
  let normalizedInline: ProseMirrorParagraph['content'] = [];
  if (Array.isArray(rawInline) && rawInline.length > 0) {
    const first = rawInline[0] as { type?: string; content?: ProseMirrorParagraph['content'] };
    if (first && first.type === 'paragraph') {
      normalizedInline = Array.isArray(first.content) ? first.content : [];
    } else {
      normalizedInline = rawInline as ProseMirrorParagraph['content'];
    }
  }
  if (normalizedInline && normalizedInline.length > 0) base.content = normalizedInline;
  return base;
}

/** Find the EditableField that should receive focus when the user backspaces
 *  on an empty bullet — the previous bullet in the same entry, or the
 *  entry.meta of the same entry if this was the first bullet. */
function previousFieldForBackspace(
  bulletId: BlockId, entryId: BlockId,
): EditableField | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  const entry = r.sections.flatMap(s => s.entries).find(e => e.id === entryId);
  if (!entry) return null;
  const idx = entry.bullets.findIndex(b => b.id === bulletId);
  if (idx < 0) return null;
  if (idx > 0) {
    return { kind: 'bullet.content', id: entry.bullets[idx - 1].id };
  }
  // First bullet in the entry → fall back to entry.meta of same entry.
  return { kind: 'entry.meta', id: entryId };
}

/** Read the BulletBlock.kind for `bulletId`. Treats absence as 'bullet'.
 *  Returns 'bullet' if the bullet can't be found (safe default). */
function readBulletKind(bulletId: BlockId): 'bullet' | 'plain' {
  const r = useResumeStore.getState().resume;
  if (!r) return 'bullet';
  for (const s of r.sections) {
    for (const e of s.entries) {
      for (const b of e.bullets) {
        if (b.id === bulletId) return b.kind ?? 'bullet';
      }
    }
  }
  return 'bullet';
}

export const AtomKeyboardNav = Extension.create<AtomKeyboardNavOptions>({
  name: 'atomKeyboardNav',
  addOptions() {
    return { bulletId: '', entryId: '', field: { kind: 'bullet.content', id: '' } };
  },
  addKeyboardShortcuts() {
    const opts = this.options;

    const splitOnEnter = (editor: Editor): boolean => {
      const r = useResumeStore.getState().resume;
      if (!r) return false;
      const entry = r.sections.flatMap(s => s.entries).find(e => e.id === opts.entryId);
      if (!entry) return false;
      const idx = entry.bullets.findIndex(b => b.id === opts.bulletId);
      if (idx < 0) return false;

      const { from } = editor.state.selection;
      const para = editor.state.doc.firstChild;
      const paraInlineEnd = para ? 1 + para.content.size : 0;

      // Build the suffix paragraph BEFORE we mutate the current doc.
      const suffixPara = suffixParagraphAfterCursor(editor, from);

      // Trim the current bullet's paragraph to keep only the prefix.
      // (Going through chain().run() triggers onUpdate → store write-back.)
      if (from < paraInlineEnd) {
        editor.chain().deleteRange({ from, to: paraInlineEnd }).run();
      }

      const newDoc: ProseMirrorBulletDoc = {
        type: 'doc',
        content: [suffixPara],
      };

      // Propagate the current bullet's kind so Enter creates a row of the
      // same kind (bullet stays bullet, plain stays plain).
      const currentKind = readBulletKind(opts.bulletId);
      const newId = insertBullet(
        opts.entryId, idx + 1, newDoc, makeOrigin('tiptap'), currentKind,
      );

      // The new bullet's editor instance won't exist until React commits
      // and BulletField's effect registers it. Poll via rAF until it does.
      atomFocusManager.focusFieldWhenReady({ kind: 'bullet.content', id: newId });
      return true;
    };

    return {
      Enter: () => splitOnEnter(this.editor),
      'Mod-Enter': () => splitOnEnter(this.editor),
      'Shift-Enter': () => {
        // Hard break is deferred to v2.1; suppress default paragraph split
        return true;
      },
      Backspace: () => {
        // Backspace at start of a bullet row, by current kind + content:
        //   bullet + empty   → delete the row, focus END of previous field
        //   bullet + content → outdent to kind='plain' (drop marker + indent,
        //                       preserve content + cursor)
        //   plain  + empty   → delete the row, focus END of previous field
        //   plain  + content → no-op (don't lose content; "merge into prev"
        //                       is v2.1 territory)
        //   selection / mid-text → let TipTap delete normally
        const { from, to } = this.editor.state.selection;
        if (from !== to) return false;       // selection — let TipTap handle
        if (from > 1) return false;          // not at start — TipTap deletes char

        const isEmpty = this.editor.state.doc.textContent.trim() === '';
        const kind = readBulletKind(opts.bulletId);

        if (kind === 'bullet') {
          if (isEmpty) {
            // Empty bullet: single-step delete.
            const prev = previousFieldForBackspace(opts.bulletId, opts.entryId);
            deleteBullet(opts.bulletId, makeOrigin('tiptap'));
            if (prev) atomFocusManager.focusFieldEnd(prev);
            return true;
          }
          // Non-empty bullet: outdent to plain. Keep content + cursor.
          setBulletKind(opts.bulletId, 'plain', makeOrigin('tiptap'));
          return true;
        }

        // kind === 'plain'
        if (isEmpty) {
          // Empty plain row: delete it (no marker, no content — get rid of it).
          const prev = previousFieldForBackspace(opts.bulletId, opts.entryId);
          deleteBullet(opts.bulletId, makeOrigin('tiptap'));
          if (prev) atomFocusManager.focusFieldEnd(prev);
          return true;
        }
        // Non-empty plain at start: no-op (don't lose content).
        return false;
      },
      ArrowUp: () => {
        const { from } = this.editor.state.selection;
        if (from <= 1) {
          atomFocusManager.focusPrevious(opts.field);
          return true;
        }
        return false;
      },
      ArrowDown: () => {
        const { from } = this.editor.state.selection;
        const docSize = this.editor.state.doc.content.size;
        if (from >= docSize - 1) {
          atomFocusManager.focusNext(opts.field);
          return true;
        }
        return false;
      },
    };
  },
});
