// frontend/src/components/resume/v2/fields/PlainTextField.tsx
'use client';
import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { UndoRedo } from '@tiptap/extensions';
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
import { SingleLineDocument } from '../extensions/SingleLineDocument';
import { NoNewline } from '../extensions/NoNewline';
import { SingleLineKeyboardNav } from '../extensions/SingleLineKeyboardNav';
import {
  stringToSingleLineDoc, singleLineDocToString, alignFromDoc,
  type Align,
} from './single-line-adapter';
import { useMeasureModeSync } from './useMeasureModeSync';
import { useResumeStore } from '../store/useResumeStore';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import { makeOrigin } from '../store/source-of-truth';
import type { CanvasMode, EditableField, EditorId } from '../types';

declare module '@tiptap/core' {
  interface EditorOptions {
    editorId?: EditorId;
  }
}

interface Props {
  fieldKey: EditableField;
  value: string;
  align?: Align;
  mode: CanvasMode;
  placeholder?: string;
  className?: string;
}

let _editorIdCounter = 0;
function nextEditorId(): EditorId {
  _editorIdCounter += 1;
  return `pt-${_editorIdCounter}`;
}

type SyncProps = { value: string; align: Align | undefined };

export function PlainTextField({ fieldKey, value, align, mode, placeholder, className }: Props) {
  const editorIdRef = useRef<EditorId>(nextEditorId());
  // Build initial doc once — measure-mode sync below keeps it fresh.
  const initialDoc = useMemo(
    () => stringToSingleLineDoc(value, align),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useEditor({
    extensions: [
      SingleLineDocument,
      Paragraph,            // required because the schema content is now 'paragraph'
      Text,
      TextStyle,            // required by Color
      Bold,
      Italic,
      Underline,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      NoNewline,
      TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right'] }),
      ...(mode === 'edit'
        ? [UndoRedo, SingleLineKeyboardNav.configure({ field: fieldKey })]
        : []),
    ],
    content: initialDoc,
    editable: mode === 'edit',
    immediatelyRender: false,
    fieldKey,
    editorId: editorIdRef.current,
    onUpdate: mode === 'edit'
      ? ({ editor }) => {
          const next = singleLineDocToString(editor);
          const nextAlign = alignFromDoc(editor);
          const origin = makeOrigin('tiptap', editorIdRef.current);
          useResumeStore.getState().updateField(fieldKey, next, origin);
          useResumeStore.getState().setFieldAlign(fieldKey, nextAlign, origin);
        }
      : undefined,
  });

  const syncProps: SyncProps = useMemo(() => ({ value, align }), [value, align]);
  useMeasureModeSync<SyncProps>(
    mode, editor, syncProps,
    (p) => stringToSingleLineDoc(p.value, p.align),
  );

  // Edit mode: register with focus manager
  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    atomFocusManager.register(fieldKey, editor);
    return () => atomFocusManager.unregister(fieldKey);
  }, [mode, editor, fieldKey]);

  return (
    <EditorContent
      editor={editor}
      className={className}
      data-field-key={fieldKeyString(fieldKey)}
      data-placeholder={placeholder}
    />
  );
}

function fieldKeyString(f: EditableField): string {
  switch (f.kind) {
    case 'header.name': return 'header.name';
    case 'header.contact': return `header.contact:${f.index}`;
    case 'section.heading': return `section.heading:${f.id}`;
    case 'entry.title': return `entry.title:${f.id}`;
    case 'entry.meta': return `entry.meta:${f.id}`;
    case 'bullet.content': return `bullet.content:${f.id}`;
  }
}
