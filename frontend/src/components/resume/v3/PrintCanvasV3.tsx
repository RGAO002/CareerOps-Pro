// T34 — Production /print route canvas (v3).
//
// Mounts a readonly TipTap editor with the full v3 schema (v3RowExtensions),
// hydrates from a ResumeDocV3, and runs the production PaginationPlugin (T32).
// Crucially, this surface intentionally does NOT include drag/selection/AILock
// plugins — print is a static rendering target.
//
// F2 (M1 PoC sign-off, spec § 4):
// Chromium does NOT resolve CSS custom properties in `@page` blocks. So instead
// of relying on `@page { margin: var(--page-margin-top) ... }`, we read the
// resolved values via getComputedStyle at JS mount time and inject a literal
// `@page { size: 8.5in 11in; margin: <values>; }` rule via a <style> element.
//
// data-paginated pipeline (consumed by Puppeteer / Playwright PDF export):
//   1. mount: document.body data-paginated = 'false'
//   2. wait for PaginationPlugin to produce non-empty pageGeometries
//   3. await document.fonts.ready
//   4. requestAnimationFrame x 2 (let layout/paint settle)
//   5. document.body data-paginated = 'true'
//
// Spec ref: docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md § 4.5.

'use client';

import * as React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import { history } from '@tiptap/pm/history';
import { Extension } from '@tiptap/core';

import { v3RowExtensions } from './schema/pmSchema';
import { hydrateInitialState } from './schema/hydrate';
import { createPaginationPlugin, paginationPluginKey } from './plugins/PaginationPlugin';
import type { ResumeDocV3 } from './schema/types';
import type { Schema } from '@tiptap/pm/model';
import { FontSize } from '../v2/extensions/FontSize';
import './EditorPageV3.css';
import './templates/fullstack.css';
import { applyTemplateColumns } from './templates/applyTemplateColumns';

// Restrict the doc node to the v3 row group only — same pattern used by
// integration tests + V3TestHarness. Print mode is structurally identical.
const PrintDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});

// History plugin wrapper. Print is readonly so this is mostly inert; we keep
// it for parity with the editing surface (consistent plugin set, fewer schema
// surprises). It does not enable editing.
const HistoryExt = Extension.create({
  name: 'v3PrintHistory',
  addProseMirrorPlugins() {
    return [history()];
  },
});

// TipTap Extension wrapper around the production PaginationPlugin (T32).
// Configured with the print canvas-root selector so the plugin can read
// resolved page-margin tokens via getComputedStyle.
const PaginationExt = Extension.create({
  name: 'v3PaginationPrint',
  addProseMirrorPlugins() {
    return [createPaginationPlugin({ canvasRootSelector: '.v3-print-canvas-root' })];
  },
});

// F2 — emit a literal @page rule from resolved tokens. The page margin is
// applied via @page (paper-level) so it takes effect on EVERY printed page,
// not just the first. tiptap padding is removed in print mode (see
// EditorPageV3.css @media print) so margins aren't double-counted.
//
// Trying tiptap-padding-only (without @page margin) breaks page 2+: tiptap
// padding-top is the start-of-element padding, not a per-page repeated
// margin. After a `break-before: page`, content lands at paper top with no
// margin. Use @page margin to fix that.
//
// Chromium does not resolve CSS custom properties inside @page blocks, so we
// read the resolved values via getComputedStyle at JS mount time and inject
// literal in/px values.
function emitStaticPageRuleFromTokens(canvasRoot: HTMLElement): () => void {
  const cs = getComputedStyle(canvasRoot);
  const get = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v || fallback;
  };
  const top = get('--page-margin-top', '0.75in');
  const right = get('--page-margin-right', '1.0in');
  const bottom = get('--page-margin-bottom', '0.75in');
  const left = get('--page-margin-left', '1.0in');

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-v3-print-page-rule', 'true');
  styleEl.textContent = `@page { size: 8.5in 11in; margin: ${top} ${right} ${bottom} ${left}; }`;
  document.head.appendChild(styleEl);
  return () => { styleEl.remove(); };
}

export interface PrintCanvasV3Props {
  doc: ResumeDocV3;
  /** Visual template — applies a CSS class to the canvas root, no layout
   * algorithm change. Driven by the `?template=` URL param on /print. */
  templateId?: 'minimal' | 'fullstack';
}

export function PrintCanvasV3({ doc, templateId = 'minimal' }: PrintCanvasV3Props) {
  const canvasRootRef = React.useRef<HTMLDivElement | null>(null);
  const readyRef = React.useRef(false);

  // Set initial data-paginated flag synchronously on mount (test contract).
  // Use useState init function so it runs once before children render.
  React.useState(() => {
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-paginated', 'false');
    }
    return null;
  });

  // Paint <html> and <body> white for the entire print surface lifetime.
  // The app's default body bg (--background = warm cream / oklch(0.985 0.004 70))
  // bleeds onto pages where content doesn't fill paper-bottom — Chromium prints
  // body bg on every paper, so without this override the PDF shows a tan
  // rectangle on the last page (and any short page).
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const prevHtmlBg = htmlEl.style.background;
    const prevBodyBg = bodyEl.style.background;
    htmlEl.style.background = 'white';
    bodyEl.style.background = 'white';
    return () => {
      htmlEl.style.background = prevHtmlBg;
      bodyEl.style.background = prevBodyBg;
    };
  }, []);

  // Build initial editor content from the v3 doc using the M2 hydrate adapter.
  // We need the schema to call hydrateInitialState; useEditor provides it via
  // editor.schema after creation, so we hydrate inside the `content` factory.
  // Strategy: pass `content` as a function-of-schema isn't supported by Tiptap,
  // so we lazily call `setContent` after the editor is constructed.
  const editor = useEditor({
    extensions: [
      PrintDoc,
      Text,
      TextStyle,
      Bold,
      Italic,
      Underline,
      Color,
      FontFamily.configure({ types: ['textStyle'] }),
      FontSize.configure({ types: ['textStyle'] }),
      Highlight.configure({ multicolor: true }),
      Link,
      HistoryExt,
      ...v3RowExtensions,
      PaginationExt,
    ],
    editable: false,
    immediatelyRender: false,
    content: undefined,
  });

  // Hydrate doc once the editor is ready. setContent triggers React updates
  // in NodeViews; defer to a microtask so we don't flushSync mid-render.
  React.useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const schema = editor.schema as Schema;
      const { docJSON } = hydrateInitialState(doc, schema);
      editor.commands.setContent(docJSON as Parameters<typeof editor.commands.setContent>[0], { emitUpdate: false });
    });
    return () => { cancelled = true; };
  }, [editor, doc]);

  // F2 — inject literal @page rule once the canvas root is mounted.
  React.useEffect(() => {
    if (!editor) return;
    let cleanup: (() => void) | null = null;
    const tryEmit = () => {
      const root = canvasRootRef.current;
      if (!root) {
        requestAnimationFrame(tryEmit);
        return;
      }
      cleanup = emitStaticPageRuleFromTokens(root);
    };
    requestAnimationFrame(tryEmit);
    return () => { if (cleanup) cleanup(); };
  }, [editor]);

  // Tag rows for the Fullstack two-column template (sidebar / main).
  // No-op for minimal template (clears the attribute).
  React.useEffect(() => {
    if (!editor) return;
    const enabled = templateId === 'fullstack';
    const tag = () => applyTemplateColumns(editor.view, enabled);
    tag();
    editor.on('transaction', tag);
    return () => { editor.off('transaction', tag); };
  }, [editor, templateId]);

  // data-paginated pipeline.
  React.useEffect(() => {
    if (!editor || readyRef.current) return;
    document.body.setAttribute('data-paginated', 'false');
    let attempts = 0;
    const MAX_ATTEMPTS = 300; // ~5s @ 60fps
    const checkReady = () => {
      if (readyRef.current) return;
      attempts++;
      const root = canvasRootRef.current;
      const layoutError = root?.getAttribute('data-layout-error');
      const s = paginationPluginKey.getState(editor.state);
      if (layoutError) {
        document.body.setAttribute('data-paginated', `false-${layoutError}`);
        return;
      }
      if (!s || s.pageGeometries.length === 0) {
        if (attempts < MAX_ATTEMPTS) {
          requestAnimationFrame(checkReady);
          return;
        }
        document.body.setAttribute('data-paginated', 'false-timeout');
        return;
      }
      // Layout produced geometries — wait for fonts then 2× rAF, then flip.
      // Defensive: jsdom/happy-dom may not provide document.fonts; fall back
      // to an immediately resolved promise so the pipeline still terminates.
      const fontsReady: Promise<unknown> =
        (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready
          ?? Promise.resolve();
      void fontsReady.then(() => {
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
    <div
      ref={canvasRootRef}
      className={`v3-print-canvas-root v3-editor-canvas-root${templateId === 'fullstack' ? ' template-fullstack' : ''}`}
      style={{
        // Inline tokens: parity with v3-poc/poc.css. These mirror the values
        // baked into the @page rule injected from getComputedStyle.
        // (A future T33/T34 css consolidation pass can move these to a
        // stylesheet; inline keeps the print route self-contained today.)
        ['--page-margin-top' as string]: '0.75in',
        ['--page-margin-bottom' as string]: '0.75in',
        ['--page-margin-left' as string]: '1.0in',
        ['--page-margin-right' as string]: '1.0in',
        ['--page-content-width' as string]: '6.5in',
        ['--page-break-screen-gap' as string]: '32px',
        position: 'relative',
        width: '8.5in',
        margin: '0 auto',
        padding: 0,
        background: 'white',
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
