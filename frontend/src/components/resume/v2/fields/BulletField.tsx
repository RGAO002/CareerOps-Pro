// frontend/src/components/resume/v2/fields/BulletField.tsx
'use client';
import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { UndoRedo } from '@tiptap/extensions';   // TipTap 3 history

import { BulletDocument } from '../extensions/BulletDocument';
import { AtomKeyboardNav } from '../extensions/AtomKeyboardNav';
import { SlashCommand } from '../extensions/SlashCommand';
import { showSlashMenu, hideSlashMenu } from '../interaction/SlashMenu';
import { useMeasureModeSync } from './useMeasureModeSync';
import {
  makeTransformPastedHTML,
  plainTextToBulletDoc,
  collapseToSingleParagraph,
} from './bullet-paste-normalize';
import { useResumeStore } from '../store/useResumeStore';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import { makeOrigin, isOriginatedBy } from '../store/source-of-truth';
import { insertBullet } from '../store/actions/insertBlock';
import type {
  CanvasMode, BlockId, ProseMirrorBulletDoc, EditorId, EditableField,
} from '../types';

interface Props {
  bulletId: BlockId;
  entryId: BlockId;
  content: ProseMirrorBulletDoc;
  mode: CanvasMode;
}

let _editorIdCounter = 0;
function nextEditorId(): EditorId {
  _editorIdCounter += 1;
  return `bl-${_editorIdCounter}`;
}

function identity<T>(x: T): T { return x; }

export function BulletField({ bulletId, entryId, content, mode }: Props) {
  const editorIdRef = useRef<EditorId>(nextEditorId());
  const fieldKey: EditableField = useMemo(
    () => ({ kind: 'bullet.content', id: bulletId }),
    [bulletId]
  );

  const editor = useEditor({
    extensions: [
      BulletDocument,
      Paragraph,
      Text,
      Bold,
      Italic,
      Link.configure({ openOnClick: false }),
      ...(mode === 'edit' ? [
        UndoRedo,
        AtomKeyboardNav.configure({ bulletId, entryId, field: fieldKey }),
        SlashCommand.configure({
          bulletId,
          entryId,
          sectionId: useResumeStore.getState().resume?.sections.find(
            s => s.entries.some(e => e.id === entryId),
          )?.id ?? '',
          onShowMenu: showSlashMenu,
          onHideMenu: hideSlashMenu,
        }),
      ] : []),
    ],
    content,
    editable: mode === 'edit',
    immediatelyRender: false,
    editorId: editorIdRef.current,
    editorProps: {
      transformPastedHTML: mode === 'edit'
        ? makeTransformPastedHTML(bulletId, (currentId, extras) => {
            const r = useResumeStore.getState().resume;
            if (!r) return;
            const entry = r.sections
              .flatMap(s => s.entries)
              .find(e => e.bullets.some(b => b.id === currentId));
            if (!entry) return;
            const idx = entry.bullets.findIndex(b => b.id === currentId);
            extras.forEach((text, i) => {
              insertBullet(
                entry.id,
                idx + 1 + i,
                plainTextToBulletDoc(text),
                makeOrigin('paste', editorIdRef.current),
              );
            });
          })
        : undefined,
      transformPasted: (slice) => {
        if (slice.content.childCount === 0) return slice;
        return collapseToSingleParagraph(slice);
      },
      handleDOMEvents: mode === 'edit' ? {
        compositionstart: () => {
          (window as any).__layoutEngine?.compositionBegin(editorIdRef.current);
          return false;
        },
        compositionend: () => {
          (window as any).__layoutEngine?.compositionEnd(editorIdRef.current);
          return false;
        },
      } : {},
    },
    onUpdate: mode === 'edit'
      ? ({ editor }) => {
          const next = editor.getJSON() as unknown as ProseMirrorBulletDoc;
          useResumeStore.getState().updateBullet(
            bulletId, next, makeOrigin('tiptap', editorIdRef.current),
          );
        }
      : undefined,
  });

  useMeasureModeSync(mode, editor, content, identity);

  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    atomFocusManager.register(fieldKey, editor);
    return () => atomFocusManager.unregister(fieldKey);
  }, [mode, editor, fieldKey]);

  // External-source store update path (§ 3.3 of spec)
  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    return useResumeStore.subscribe(
      s => s.bulletMeta[bulletId],
      (meta) => {
        if (!meta) return;
        if (isOriginatedBy(meta.origin, editorIdRef.current)) return;
        if (editor.view.composing) return;
        if (editor.isFocused) return;
        const r = useResumeStore.getState().resume;
        const bullet = r?.sections
          .flatMap(s => s.entries)
          .flatMap(e => e.bullets)
          .find(b => b.id === bulletId);
        if (!bullet) return;
        editor.commands.setContent(bullet.content, { emitUpdate: false });
      },
    );
  }, [mode, editor, bulletId]);

  return (
    <EditorContent
      editor={editor}
      className="resume-bullet"
      data-field-key={`bullet.content:${bulletId}`}
    />
  );
}
