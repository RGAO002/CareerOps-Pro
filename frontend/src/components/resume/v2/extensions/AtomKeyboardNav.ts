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
        // If at start of bullet AND bullet content is empty → merge with previous
        const { from, to } = this.editor.state.selection;
        if (from !== to) return false;
        const isAtStart = from <= 1;
        if (!isAtStart) return false;
        // Delete this bullet, focus previous field
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
