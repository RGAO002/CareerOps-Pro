'use client';
import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { PocDoc, HeadingRow, PlainRow, BulletRow, PaginationExt, buildPocContent } from './PocEditor';
import { Text } from '@tiptap/extension-text';
import { PageChromeLayerMin } from './PageChromeLayerMin';
import { paginationPluginKey } from './PaginationPluginMin';

export function PocPrintCanvas() {
  const editor = useEditor({
    extensions: [PocDoc, Text, HeadingRow, PlainRow, BulletRow, PaginationExt],
    editable: false,
    content: buildPocContent(),
    immediatelyRender: false,
  });
  const readyRef = useRef(false);

  useEffect(() => {
    if (!editor || readyRef.current) return;
    document.body.setAttribute('data-paginated', 'false');
    const checkReady = () => {
      const s = paginationPluginKey.getState(editor.state);
      if (!s || s.pageGeometries.length === 0) { requestAnimationFrame(checkReady); return; }
      // Pagination has emitted at least one page → wait for fonts + 2× rAF
      void document.fonts.ready.then(() => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.body.setAttribute('data-paginated', 'true');
          readyRef.current = true;
        }));
      });
    };
    requestAnimationFrame(checkReady);
  }, [editor]);

  if (!editor) return null;
  return (
    <div className="poc-canvas-root">
      <PageChromeLayerMin editor={editor} />
      <div className="poc-editor-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
