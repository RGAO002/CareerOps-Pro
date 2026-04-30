// frontend/src/components/resume/v2/extensions/SingleLineKeyboardNav.ts
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import { forceShowMeta } from '../interaction/meta-visibility';
import { forceShowTitle } from '../interaction/title-visibility';
import {
  insertBullet, insertEntry, insertContactLine,
} from '../store/actions/insertBlock';
import {
  deleteEntry, deleteSection, deleteContactLine,
} from '../store/actions/deleteBlock';
import { useResumeStore } from '../store/useResumeStore';
import { useAILockStore } from '@/stores/aiLock';
import { makeOrigin } from '../store/source-of-truth';
import type { BlockId, EditableField } from '../types';

export interface SingleLineKeyboardNavOptions {
  /** The field this extension instance is mounted on. Used to disambiguate
   *  Enter / Backspace structural intent. */
  field: EditableField;
}

declare module '@tiptap/core' {
  interface EditorOptions {
    fieldKey?: EditableField;
  }
}

const EMPTY_BULLET_DOC = {
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const }] as [
    { type: 'paragraph'; content?: undefined },
  ],
};

/** Shared "is the cursor at start of an empty single-line doc?" predicate. */
function isAtStartOfEmpty(editor: Editor): boolean {
  const { from, to } = editor.state.selection;
  if (from !== to) return false;
  if (from > 1) return false;
  return editor.state.doc.textContent.trim() === '';
}

/** Find the section + entry that owns the given entryId. */
function findEntry(entryId: BlockId): {
  sectionId: BlockId;
  entryId: BlockId;
  bulletsCount: number;
  metaText: string;
  bulletsAllEmpty: boolean;
} | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  for (const s of r.sections) {
    const e = s.entries.find(x => x.id === entryId);
    if (!e) continue;
    const bulletsAllEmpty = e.bullets.every(b => {
      const para = b.content.content?.[0];
      const text = (para?.content ?? [])
        .map(n => (n.type === 'text' ? n.text : ''))
        .join('');
      return text.trim() === '';
    });
    return {
      sectionId: s.id,
      entryId: e.id,
      bulletsCount: e.bullets.length,
      metaText: e.meta ?? '',
      bulletsAllEmpty,
    };
  }
  return null;
}

/** For section.heading: identify the section and check if it has entries. */
function findSection(sectionId: BlockId): {
  sectionId: BlockId;
  entriesCount: number;
} | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  const s = r.sections.find(x => x.id === sectionId);
  if (!s) return null;
  return { sectionId: s.id, entriesCount: s.entries.length };
}

/** Build the field that should receive focus AFTER deleting / leaving the
 *  given field. Used by Backspace handlers to fall back to the previous
 *  visual row. Returns null when there is no previous row (e.g. header.name). */
function previousFieldFor(field: EditableField): EditableField | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  switch (field.kind) {
    case 'header.name':
      return null;
    case 'header.contact':
      if (field.index > 0) return { kind: 'header.contact', index: field.index - 1 };
      return { kind: 'header.name' };
    case 'section.heading': {
      // Previous = last bullet of last entry of previous section, OR
      // last contact line, OR header.name.
      const idx = r.sections.findIndex(s => s.id === field.id);
      if (idx > 0) {
        const prev = r.sections[idx - 1];
        const lastEntry = prev.entries[prev.entries.length - 1];
        if (lastEntry) {
          const lastBullet = lastEntry.bullets[lastEntry.bullets.length - 1];
          if (lastBullet) return { kind: 'bullet.content', id: lastBullet.id };
          return { kind: 'entry.meta', id: lastEntry.id };
        }
        return { kind: 'section.heading', id: prev.id };
      }
      // First section → fall back into header
      const lines = r.header.contact_lines;
      if (lines.length > 0) {
        return { kind: 'header.contact', index: lines.length - 1 };
      }
      return { kind: 'header.name' };
    }
    case 'entry.title': {
      // Previous = previous entry's last bullet (or its meta/title), or the
      // owning section's heading.
      for (const s of r.sections) {
        const i = s.entries.findIndex(e => e.id === field.id);
        if (i < 0) continue;
        if (i > 0) {
          const prev = s.entries[i - 1];
          const lastBullet = prev.bullets[prev.bullets.length - 1];
          if (lastBullet) return { kind: 'bullet.content', id: lastBullet.id };
          return { kind: 'entry.meta', id: prev.id };
        }
        return { kind: 'section.heading', id: s.id };
      }
      return null;
    }
    case 'entry.meta':
      return { kind: 'entry.title', id: field.id };
    case 'bullet.content':
      // SingleLineKeyboardNav doesn't run on bullets; AtomKeyboardNav owns them.
      return null;
  }
}

export const SingleLineKeyboardNav = Extension.create<SingleLineKeyboardNavOptions>({
  name: 'singleLineKeyboardNav',
  // Higher than NoNewline (default 100) so this owns Enter / Shift-Enter for
  // single-line fields when both extensions are loaded.
  priority: 200,

  addOptions() {
    return { field: { kind: 'header.name' } };
  },

  addKeyboardShortcuts() {
    const opts = this.options;
    const field = opts.field;

    const handleEnter = (): boolean => {
      const origin = makeOrigin('tiptap');
      // ★ AI lock guard (spec § 6.2 / Task 19 Step 5b): suppress every
      // structural insert path when the parent block is AI-locked. Selection
      // / cursor itself remains active per § 6.2.
      const lock = useAILockStore.getState();

      switch (field.kind) {
        case 'header.name': {
          const r = useResumeStore.getState().resume;
          if (!r) return true;
          if (r.header.contact_lines.length === 0) {
            insertContactLine(0, origin);
          }
          // Always focus the (possibly newly inserted) first contact line.
          atomFocusManager.focusFieldWhenReady({ kind: 'header.contact', index: 0 });
          return true;
        }
        case 'header.contact': {
          const newIndex = field.index + 1;
          insertContactLine(newIndex, origin);
          atomFocusManager.focusFieldWhenReady({ kind: 'header.contact', index: newIndex });
          return true;
        }
        case 'section.heading': {
          if (lock.isLocked(field.id)) return true;
          // Insert a new entry at the START of this section's entries, then
          // focus its first bullet.
          const { entryId: _newEntryId, firstBulletId } = insertEntry(
            field.id, 0, origin,
          );
          // Reference the entry id to keep TS happy and document intent.
          void _newEntryId;
          atomFocusManager.focusFieldWhenReady({
            kind: 'bullet.content', id: firstBulletId,
          });
          return true;
        }
        case 'entry.title':
        case 'entry.meta': {
          if (lock.isLocked(field.id)) return true;
          const newId = insertBullet(
            field.id, 0,
            EMPTY_BULLET_DOC,
            origin,
          );
          atomFocusManager.focusFieldWhenReady({ kind: 'bullet.content', id: newId });
          return true;
        }
        case 'bullet.content':
          // Should never get here — bullets use AtomKeyboardNav.
          return false;
      }
    };

    const handleBackspace = (editor: Editor): boolean => {
      // Mid-text or with selection: let TipTap delete normally.
      if (!isAtStartOfEmpty(editor)) return false;
      const lock = useAILockStore.getState();

      switch (field.kind) {
        case 'header.name':
          // Nothing previous to merge into; do nothing (no-op).
          return false;
        case 'header.contact': {
          const prev = previousFieldFor(field);
          deleteContactLine(field.index, makeOrigin('tiptap'));
          if (prev) atomFocusManager.focusFieldEnd(prev);
          return true;
        }
        case 'section.heading': {
          if (lock.isLocked(field.id)) return true;
          const sec = findSection(field.id);
          if (!sec) return false;
          // Conservative rule: only delete an empty section. If it still has
          // entries, just move focus — undo wouldn't help users who don't
          // notice the destruction of real content.
          if (sec.entriesCount > 0) {
            const prev = previousFieldFor(field);
            if (prev) atomFocusManager.focusFieldEnd(prev);
            return true;
          }
          const prev = previousFieldFor(field);
          deleteSection(field.id, makeOrigin('tiptap'));
          if (prev) atomFocusManager.focusFieldEnd(prev);
          return true;
        }
        case 'entry.title': {
          if (lock.isLocked(field.id)) return true;
          const info = findEntry(field.id);
          if (!info) return false;
          const prev = previousFieldFor(field);
          // Only delete the entry when it's TRULY EMPTY end-to-end. If user
          // has any bullet content or meta text, just move focus — don't blow
          // away their work. Undo wouldn't help if they don't notice the
          // destruction.
          const canDelete =
            info.metaText.trim() === '' &&
            (info.bulletsCount === 0 || info.bulletsAllEmpty);
          if (canDelete) {
            deleteEntry(field.id, makeOrigin('tiptap'));
          }
          if (prev) atomFocusManager.focusFieldEnd(prev);
          return true;
        }
        case 'entry.meta': {
          // meta isn't its own deletable structure — just move focus to the
          // previous field (entry.title).
          const prev = previousFieldFor(field);
          if (prev) atomFocusManager.focusFieldEnd(prev);
          return true;
        }
        case 'bullet.content':
          return false;
      }
    };

    return {
      Enter: () => handleEnter(),
      'Mod-Enter': () => handleEnter(),
      // Shift-Enter is intentionally NOT mapped here — NoNewline still
      // suppresses hard breaks for these single-line fields.
      Backspace: () => handleBackspace(this.editor),
      Tab: () => {
        // From entry.title, jump to the entry's meta — even when meta is
        // currently hidden because empty. We force-render the meta via the
        // meta-visibility pub/sub so EntryAtomRenderer mounts the editor on
        // the next render, then focusFieldWhenReady polls until the editor
        // registers and we land in it.
        if (field.kind === 'entry.title') {
          forceShowMeta(field.id);
          atomFocusManager.focusFieldWhenReady({ kind: 'entry.meta', id: field.id });
          return true;
        }
        // From section.heading, jump to the FIRST entry's title — even when
        // the title is currently hidden because empty. We force-render the
        // title via the title-visibility pub/sub mirroring meta-visibility.
        if (field.kind === 'section.heading') {
          const r = useResumeStore.getState().resume;
          if (!r) return false;
          const sec = r.sections.find(s => s.id === field.id);
          if (!sec) return false;
          const firstEntry = sec.entries[0];
          if (!firstEntry) return false;
          forceShowTitle(firstEntry.id);
          atomFocusManager.focusFieldWhenReady({
            kind: 'entry.title', id: firstEntry.id,
          });
          return true;
        }
        // From entry.meta, jump to the NEXT entry's title (force-show if
        // hidden). Less critical than the section.heading case but mirrors
        // the same intent: Tab walks the visible structural rows.
        if (field.kind === 'entry.meta') {
          const r = useResumeStore.getState().resume;
          if (!r) return false;
          for (const s of r.sections) {
            const i = s.entries.findIndex(e => e.id === field.id);
            if (i < 0) continue;
            const nextEntry = s.entries[i + 1];
            if (!nextEntry) return false;
            forceShowTitle(nextEntry.id);
            atomFocusManager.focusFieldWhenReady({
              kind: 'entry.title', id: nextEntry.id,
            });
            return true;
          }
          return false;
        }
        return false;
      },
      ArrowUp: () => {
        const { from } = this.editor.state.selection;
        if (from <= 1) {
          atomFocusManager.focusPrevious(field);
          return true;
        }
        return false;
      },
      ArrowDown: () => {
        const { from } = this.editor.state.selection;
        const docSize = this.editor.state.doc.content.size;
        if (from >= docSize - 1) {
          atomFocusManager.focusNext(field);
          return true;
        }
        return false;
      },
    };
  },
});
