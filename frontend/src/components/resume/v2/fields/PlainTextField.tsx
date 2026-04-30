// frontend/src/components/resume/v2/fields/PlainTextField.tsx
'use client';
import { useEffect, useMemo, useRef } from 'react';
import type { Editor } from '@tiptap/core';
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
import FontFamily from '@tiptap/extension-font-family';
import { FontSize } from '../extensions/FontSize';
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
  /** Optional TipTap blur handler. Wired only in edit mode. Used by
   *  EntryAtomRenderer to hide entry.meta again when it blurs empty. */
  onBlur?: (editor: Editor) => void;
}

let _editorIdCounter = 0;
function nextEditorId(): EditorId {
  _editorIdCounter += 1;
  return `pt-${_editorIdCounter}`;
}

type SyncProps = { value: string; align: Align | undefined };

export function PlainTextField({ fieldKey, value, align, mode, placeholder, className, onBlur }: Props) {
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
      TextStyle,            // required by Color + FontFamily
      Bold,
      Italic,
      Underline,
      Color,
      FontFamily.configure({ types: ['textStyle'] }),
      FontSize.configure({ types: ['textStyle'] }),
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

  // Edit mode: register with focus manager. fieldKey is a fresh object every
  // render — depend on its stringified identity so the effect doesn't churn.
  // Without this, every re-render unregister/re-registers the field and
  // pushes its key to the END of atomFocusManager.order, scrambling the
  // doc-order used by cross-editor selection.
  const fieldKeyStr = fieldKeyString(fieldKey);
  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    atomFocusManager.register(fieldKey, editor);
    return () => atomFocusManager.unregister(fieldKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fieldKey is unstable; fieldKeyStr captures its identity.
  }, [mode, editor, fieldKeyStr]);

  // Edit mode: optional TipTap blur callback for parents that need to react
  // (e.g. EntryAtomRenderer hides entry.meta when blurred empty).
  useEffect(() => {
    if (mode !== 'edit' || !editor || !onBlur) return;
    const handler = () => onBlur(editor);
    editor.on('blur', handler);
    return () => { editor.off('blur', handler); };
  }, [mode, editor, onBlur]);

  return (
    <EditorContent
      editor={editor}
      className={className}
      data-field-key={fieldKeyString(fieldKey)}
      data-placeholder={placeholder}
      // CSS-var-driven placeholder text. resume-styles.css reads this via
      // `content: var(--resume-placeholder, "")` on the empty <p>::before.
      // Quotes are required because `content` substitutes raw token text.
      style={placeholder ? { ['--resume-placeholder' as string]: `"${placeholder.replace(/"/g, '\\"')}"` } as React.CSSProperties : undefined}
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
