// frontend/src/components/resume/v2/fields/ContactLinesField.tsx
'use client';
import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import { UndoRedo } from '@tiptap/extensions';

import { SingleLineWithMarksDocument } from '../extensions/SingleLineWithMarksDocument';
import { NoNewline } from '../extensions/NoNewline';
import { SingleLineKeyboardNav } from '../extensions/SingleLineKeyboardNav';
import { contactItemsToDoc, docToContactItems } from './contact-lines-adapter';
import { alignFromDoc, type Align } from './single-line-adapter';
import { useMeasureModeSync } from './useMeasureModeSync';
import { useResumeStore, fieldKeyToStr } from '../store/useResumeStore';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import type { CanvasMode, ContactItem, EditorId } from '../types';

interface Props {
  index: number;
  items: ContactItem[];
  align?: Align;
  mode: CanvasMode;
}

let _idCounter = 0;
function nextEditorId(): EditorId { _idCounter += 1; return `cl-${_idCounter}`; }

type SyncProps = { items: ContactItem[]; align: Align | undefined };

export function ContactLinesField({ index, items, align, mode }: Props) {
  const editorIdRef = useRef<EditorId>(nextEditorId());
  const initialDoc = useMemo(
    () => contactItemsToDoc(items, align),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useEditor({
    extensions: [
      SingleLineWithMarksDocument,
      Paragraph,
      Text,
      TextStyle,
      Bold,
      Italic,
      Underline,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      NoNewline,
      TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right'] }),
      ...(mode === 'edit'
        ? [
            UndoRedo,
            SingleLineKeyboardNav.configure({
              field: { kind: 'header.contact', index },
            }),
          ]
        : []),
    ],
    content: initialDoc,
    editable: mode === 'edit',
    immediatelyRender: false,
    fieldKey: { kind: 'header.contact', index },
    editorId: editorIdRef.current,
    onUpdate: mode === 'edit'
      ? ({ editor }) => {
          const next = docToContactItems(editor);
          const nextAlign = alignFromDoc(editor);
          const r = useResumeStore.getState().resume;
          if (!r) return;
          // Update both contact_lines content and the alignment map in one
          // setState. We can't reuse the store's setFieldAlign action here
          // because it wouldn't carry the contact_lines change atomically.
          const key = fieldKeyToStr({ kind: 'header.contact', index });
          const currentAlignments = r.alignments ?? {};
          const wantOmit = nextAlign === undefined || nextAlign === 'left';
          let nextAlignments: Record<string, Align> | undefined = currentAlignments as Record<string, Align>;
          if (wantOmit) {
            if (key in currentAlignments) {
              const copy = { ...currentAlignments };
              delete copy[key];
              nextAlignments = copy as Record<string, Align>;
            }
          } else if (currentAlignments[key] !== nextAlign) {
            nextAlignments = { ...currentAlignments, [key]: nextAlign } as Record<string, Align>;
          }
          const finalAlignments =
            nextAlignments && Object.keys(nextAlignments).length > 0 ? nextAlignments : undefined;
          useResumeStore.setState({
            resume: {
              ...r,
              header: { ...r.header, contact_lines: next },
              alignments: finalAlignments,
              metadata: { ...r.metadata, updated_at: new Date().toISOString() },
            },
          });
        }
      : undefined,
  });

  const syncProps: SyncProps = useMemo(() => ({ items, align }), [items, align]);
  useMeasureModeSync<SyncProps>(
    mode, editor, syncProps,
    (p) => contactItemsToDoc(p.items, p.align),
  );

  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    atomFocusManager.register({ kind: 'header.contact', index }, editor);
    return () => atomFocusManager.unregister({ kind: 'header.contact', index });
  }, [mode, editor, index]);

  return (
    <EditorContent
      editor={editor}
      className="resume-contact-line"
      data-placeholder="email | phone | location"
      style={{ ['--resume-placeholder' as string]: '"email | phone | location"' } as React.CSSProperties}
    />
  );
}
