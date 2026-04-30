'use client';
import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { PocDoc, HeadingRow, PlainRow, BulletRow, PaginationExt, buildPocContent } from './PocEditor';
import { Text } from '@tiptap/extension-text';
import { PageChromeLayerMin } from './PageChromeLayerMin';
import { paginationPluginKey } from './PaginationPluginMin';

function emitStaticPageRuleFromTokens(canvasRoot: HTMLElement): () => void {
  const cs = getComputedStyle(canvasRoot);
  const get = (name: string) => cs.getPropertyValue(name).trim() || '0in';
  const top = get('--page-margin-top');
  const right = get('--page-margin-right');
  const bottom = get('--page-margin-bottom');
  const left = get('--page-margin-left');

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-v3-poc-print-page-rule', 'true');
  styleEl.textContent = `@page { size: 8.5in 11in; margin: ${top} ${right} ${bottom} ${left}; }`;
  document.head.appendChild(styleEl);

  // Return cleanup fn.
  return () => { styleEl.remove(); };
}

export function PocPrintCanvas() {
  const editor = useEditor({
    extensions: [PocDoc, Text, HeadingRow, PlainRow, BulletRow, PaginationExt],
    editable: false,
    content: buildPocContent(),
    immediatelyRender: false,
  });
  const readyRef = useRef(false);

  // STEP 2: Emit static @page rule from CSS tokens (sidesteps Chromium var() in @page).
  useEffect(() => {
    if (!editor) return;
    let cleanup: (() => void) | null = null;
    const tryEmit = () => {
      const canvasRoot = document.querySelector('.poc-canvas-root') as HTMLElement | null;
      if (!canvasRoot) { requestAnimationFrame(tryEmit); return; }
      cleanup = emitStaticPageRuleFromTokens(canvasRoot);
    };
    requestAnimationFrame(tryEmit);
    return () => { if (cleanup) cleanup(); };
  }, [editor]);

  // STEP 4: Hardened checkReady — respects data-layout-error, times out gracefully.
  useEffect(() => {
    if (!editor || readyRef.current) return;
    document.body.setAttribute('data-paginated', 'false');
    let attempts = 0;
    const MAX_ATTEMPTS = 300;     // 300 frames ≈ 5s
    const checkReady = () => {
      attempts++;
      const canvasRoot = document.querySelector('.poc-canvas-root');
      const layoutError = canvasRoot?.getAttribute('data-layout-error');
      const s = paginationPluginKey.getState(editor.state);
      if (layoutError) {
        document.body.setAttribute('data-paginated', `false-${layoutError}`);
        return;
      }
      if (!s || s.pageGeometries.length === 0) {
        if (attempts < MAX_ATTEMPTS) { requestAnimationFrame(checkReady); return; }
        document.body.setAttribute('data-paginated', 'false-timeout');
        return;
      }
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
