// frontend/src/components/resume/v2/extensions/AtomKeyboardNav.ts
import { Extension } from '@tiptap/core';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import { insertBullet } from '../store/actions/insertBlock';
import { deleteBullet } from '../store/actions/deleteBlock';
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin } from '../store/source-of-truth';
import type { BlockId, EditableField } from '../types';

export interface AtomKeyboardNavOptions {
  bulletId: BlockId;
  entryId: BlockId;
  field: EditableField;
}

export const AtomKeyboardNav = Extension.create<AtomKeyboardNavOptions>({
  name: 'atomKeyboardNav',
  addOptions() {
    return { bulletId: '', entryId: '', field: { kind: 'bullet.content', id: '' } };
  },
  addKeyboardShortcuts() {
    const opts = this.options;
    return {
      Enter: () => {
        const r = useResumeStore.getState().resume;
        if (!r) return false;
        const entry = r.sections.flatMap(s => s.entries).find(e => e.id === opts.entryId);
        if (!entry) return false;
        const idx = entry.bullets.findIndex(b => b.id === opts.bulletId);
        insertBullet(opts.entryId, idx + 1,
          { type: 'doc', content: [{ type: 'paragraph' }] },
          makeOrigin('tiptap'),
        );
        // Defer focus until React re-renders the new bullet
        setTimeout(() => {
          atomFocusManager.focusNext(opts.field);
        }, 0);
        return true;
      },
      'Mod-Enter': () => {
        // alias for Enter — use Mod- (cross-platform Cmd/Ctrl)
        const r = useResumeStore.getState().resume;
        if (!r) return false;
        const entry = r.sections.flatMap(s => s.entries).find(e => e.id === opts.entryId);
        if (!entry) return false;
        const idx = entry.bullets.findIndex(b => b.id === opts.bulletId);
        insertBullet(opts.entryId, idx + 1,
          { type: 'doc', content: [{ type: 'paragraph' }] },
          makeOrigin('tiptap'),
        );
        setTimeout(() => atomFocusManager.focusNext(opts.field), 0);
        return true;
      },
      'Shift-Enter': () => {
        // Hard break is deferred to v2.1; suppress default paragraph split
        return true;
      },
      Backspace: () => {
        // Notion behavior:
        //   - cursor in middle / end → let TipTap delete previous char
        //   - cursor at start of NON-empty bullet → no-op (don't lose content;
        //     true "merge into previous bullet" is v2.1 territory)
        //   - cursor at start of EMPTY bullet → delete the bullet, focus previous field
        const { from, to } = this.editor.state.selection;
        if (from !== to) return false;       // selection — let TipTap handle
        const isAtStart = from <= 1;
        if (!isAtStart) return false;        // not at start — TipTap deletes char
        const isEmpty = this.editor.state.doc.textContent.trim() === '';
        if (!isEmpty) return false;          // non-empty + at start — preserve content
        // Empty bullet → delete it, jump cursor to previous field
        atomFocusManager.focusPrevious(opts.field);
        deleteBullet(opts.bulletId, makeOrigin('tiptap'));
        return true;
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
