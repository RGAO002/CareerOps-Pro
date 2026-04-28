// frontend/src/components/resume/v2/extensions/FontSize.ts
//
// Custom TipTap extension that adds a `fontSize` attribute to the textStyle
// mark (mirrors how @tiptap/extension-font-family + @tiptap/extension-color
// extend textStyle with their own attrs). TipTap 3 doesn't ship an official
// font-size extension, and this is small enough that taking on a third-party
// dep wasn't worth it.
//
// Stored as inline CSS: <span style="font-size: 14px">…</span>.
// Persisted in the doc via the standard textStyle mark, so it round-trips
// through save / load without any schema changes elsewhere.
import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      /** Set the font-size on the current selection / stored mark. */
      setFontSize: (size: string) => ReturnType;
      /** Clear the font-size attr (revert to inherited size). */
      unsetFontSize: () => ReturnType;
    };
  }
}

export interface FontSizeOptions {
  /** Mark types that should accept the fontSize attribute. */
  types: string[];
}

export const FontSize = Extension.create<FontSizeOptions>({
  name: 'fontSize',

  addOptions() {
    return { types: ['textStyle'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]/g, '') || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize:
        () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});
