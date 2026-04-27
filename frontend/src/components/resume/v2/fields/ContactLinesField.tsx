// frontend/src/components/resume/v2/fields/ContactLinesField.tsx
'use client';
import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { UndoRedo } from '@tiptap/extensions';

import { SingleLineWithMarksDocument } from '../extensions/SingleLineWithMarksDocument';
import { NoNewline } from '../extensions/NoNewline';
import { contactItemsToDoc, docToContactItems } from './contact-lines-adapter';
import { useMeasureModeSync } from './useMeasureModeSync';
import { useResumeStore } from '../store/useResumeStore';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import type { CanvasMode, ContactItem, EditorId } from '../types';

interface Props {
  index: number;
  items: ContactItem[];
  mode: CanvasMode;
}

let _idCounter = 0;
function nextEditorId(): EditorId { _idCounter += 1; return `cl-${_idCounter}`; }

export function ContactLinesField({ index, items, mode }: Props) {
  const editorIdRef = useRef<EditorId>(nextEditorId());
  const initialDoc = useMemo(() => contactItemsToDoc(items), []);

  const editor = useEditor({
    extensions: [
      SingleLineWithMarksDocument,
      Text,
      Bold,
      Italic,
      Link.configure({ openOnClick: false }),
      NoNewline,
      ...(mode === 'edit' ? [UndoRedo] : []),
    ],
    content: initialDoc,
    editable: mode === 'edit',
    immediatelyRender: false,
    fieldKey: { kind: 'header.contact', index },
    editorId: editorIdRef.current,
    onUpdate: mode === 'edit'
      ? ({ editor }) => {
          const next = docToContactItems(editor);
          const r = useResumeStore.getState().resume;
          if (!r) return;
          useResumeStore.setState({
            resume: {
              ...r,
              header: { ...r.header, contact_lines: next },
              metadata: { ...r.metadata, updated_at: new Date().toISOString() },
            },
          });
        }
      : undefined,
  });

  useMeasureModeSync(mode, editor, items, contactItemsToDoc);

  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    atomFocusManager.register({ kind: 'header.contact', index }, editor);
    return () => atomFocusManager.unregister({ kind: 'header.contact', index });
  }, [mode, editor, index]);

  return <EditorContent editor={editor} className="resume-contact-line" />;
}
