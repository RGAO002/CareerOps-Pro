// frontend/src/components/resume/v2/extensions/SlashCommand.ts
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { insertBullet, insertEntry, insertSection } from '../store/actions/insertBlock';
import { useResumeStore } from '../store/useResumeStore';
import { makeOrigin } from '../store/source-of-truth';
import type { BlockId } from '../types';

export type SlashItem = {
  id: 'bullet' | 'entry' | 'heading';
  title: string;
  hint: string;
};

const ITEMS: SlashItem[] = [
  { id: 'bullet', title: 'Add bullet', hint: 'Insert a bullet below this one' },
  { id: 'entry', title: 'Add entry', hint: 'Insert a new entry in this section' },
  { id: 'heading', title: 'Add section', hint: 'Insert a new section' },
];

export interface SlashCommandOptions {
  bulletId: BlockId;
  entryId: BlockId;
  sectionId: BlockId;
  onShowMenu: (items: SlashItem[], onSelect: (item: SlashItem) => void) => void;
  onHideMenu: () => void;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',
  addOptions() {
    return {
      bulletId: '', entryId: '', sectionId: '',
      onShowMenu: () => {}, onHideMenu: () => {},
    };
  },
  addProseMirrorPlugins() {
    const opts = this.options;
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        items: () => ITEMS,
        command: ({ editor, range, props }) => {
          const item = props as SlashItem;
          editor.chain().focus().deleteRange(range).run();
          if (item.id === 'bullet') {
            const r = useResumeStore.getState().resume;
            if (!r) return;
            const entry = r.sections.flatMap(s => s.entries).find(e => e.id === opts.entryId);
            const idx = entry ? entry.bullets.findIndex(b => b.id === opts.bulletId) : -1;
            insertBullet(opts.entryId, idx + 1,
              { type: 'doc', content: [{ type: 'paragraph' }] },
              makeOrigin('tiptap'),
            );
          } else if (item.id === 'entry') {
            insertEntry(opts.sectionId, 9999, makeOrigin('tiptap'));
          } else if (item.id === 'heading') {
            insertSection('custom', null, makeOrigin('tiptap'));
          }
        },
        render: () => {
          return {
            onStart: (props) => {
              const onSelect = (item: SlashItem) => props.command(item as any);
              opts.onShowMenu(ITEMS, onSelect);
            },
            onUpdate: () => {},
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') { opts.onHideMenu(); return true; }
              return false;
            },
            onExit: () => { opts.onHideMenu(); },
          };
        },
      }),
    ];
  },
});
