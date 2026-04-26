// frontend/src/app/resume/[id]/print/PrintCanvasClient.tsx
"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import Script from "next/script";
import { useEffect, useState } from "react";

import { createResumeEditorExtensions } from "@/components/resume/extensions/createResumeEditor";
import type { Resume } from "@/lib/resumeApi";

import "@/components/resume/resume-editor.css";
import "./print.css";

declare global {
  interface Window {
    PagedPolyfill?: {
      preview: (
        content?: HTMLElement | string,
        stylesheets?: string[],
        renderTo?: HTMLElement,
      ) => Promise<unknown>;
    };
    PagedConfig?: {
      auto: boolean;
      content?: HTMLElement | string;
      before?: () => void;
      after?: (flow: { total: number }) => void;
    };
  }
}

export function PrintCanvasClient({ resume }: { resume: Resume }) {
  return <PrintCanvas resume={resume} />;
}

/**
 * Headless Chromium loads this via Playwright. We render the resume via
 * TipTap (editable=false) into the body, then load Paged.js polyfill from
 * /public/paged.polyfill.js. The polyfill rewrites body content into
 * <div class="pagedjs_page"> page cards. Playwright waits for the
 * polyfill's "after" hook to fire, then page.pdf() captures the
 * paginated DOM.
 *
 * Why script-tag (not npm import): pagedjs's npm ESM source crashes
 * inside Turbopack with `TypeError: contains.call is not a function`
 * (vendored es5-ext polyfill ships unbundled). The pre-built UMD polyfill
 * loaded via <script> sidesteps the bundler entirely and Just Works.
 */
function PrintCanvas({ resume }: { resume: Resume }) {
  const editor = useEditor({
    ...createResumeEditorExtensions(
      resume.doc as Parameters<typeof createResumeEditorExtensions>[0],
    ),
    editable: false,
    immediatelyRender: false,
  });

  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    if (!editor) return;
    setEditorReady(true);
  }, [editor]);

  // Configure Paged.js BEFORE the script loads (the polyfill checks for
  // window.PagedConfig at startup). auto: false means it won't run on
  // DOMContentLoaded — we trigger it manually after TipTap is ready.
  useEffect(() => {
    window.PagedConfig = {
      auto: false,
      after: (flow) => {
        const total = flow?.total ?? 0;
        document.body.setAttribute("data-paged-pages", String(total));
        document.body.setAttribute("data-paged-ready", "true");
      },
    };
  }, []);

  // Once both the editor has rendered AND Paged.js polyfill is loaded,
  // trigger pagination. We extract the editor's HTML and feed it to
  // Paged.js as a fresh fragment — NOT as the .resume-canvas element
  // itself. The .resume-canvas has sizing constraints (8.5in width,
  // padding, min-height) that confuse Paged.js's flow algorithm; using
  // a bare fragment lets Paged.js apply @page sizing cleanly.
  const [polyfillLoaded, setPolyfillLoaded] = useState(false);
  useEffect(() => {
    if (!editorReady || !polyfillLoaded || !editor) return;
    if (!window.PagedPolyfill) return;

    // Build a fragment that's just the editor's nested content (header +
    // sections), wrapped in a class hook for the print CSS to style.
    const fragment = document.createElement("div");
    fragment.className = "paged-source";
    fragment.innerHTML = editor.getHTML();

    // Hide the source TipTap canvas so users (or Chromium's PDF) only
    // see the paginated copy.
    const sourceWrapper = document.querySelector(".print-mode") as HTMLElement | null;
    if (sourceWrapper) sourceWrapper.style.display = "none";

    void window.PagedPolyfill.preview(fragment, [], document.body);
  }, [editorReady, polyfillLoaded, editor]);

  return (
    <>
      <Script
        src="/paged.polyfill.js"
        strategy="afterInteractive"
        onLoad={() => setPolyfillLoaded(true)}
      />
      <div className="print-mode">
        <div className="resume-canvas">
          {editor && <EditorContent editor={editor} />}
        </div>
      </div>
    </>
  );
}
