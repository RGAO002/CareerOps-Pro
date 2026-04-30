'use client';

import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { Extension } from '@tiptap/core';
import { history } from '@tiptap/pm/history';
import { keymap } from '@tiptap/pm/keymap';
import type { Editor } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

import { AppShell } from '@/components/layout/AppShell';
import { usePageContext } from '@/hooks/usePageContext';
import { useAssistantStore } from '@/stores/assistant';
import { useSuggestionStore } from '@/stores/aiSuggestion';
import { Download } from 'lucide-react';

import type { ResumeDoc as ResumeDocV2 } from '../v2/types';
import { ResumeCanvasV3 } from './ResumeCanvasV3';
import { PageChromeLayer } from './layers/PageChromeLayer';
import { SlashMenuOverlay } from './plugins/SlashMenuOverlay';
import { createGroupsPlugin } from './plugins/GroupsPlugin';
import { slashMenuPlugin } from './plugins/SlashMenuPlugin';
import { aiLockPlugin } from './plugins/AILockPlugin';
import { createPaginationPlugin, getPaginationState, requestPaginationLayout } from './plugins/PaginationPlugin';
import { v3RowExtensions } from './schema/pmSchema';
import { hydrateInitialState } from './schema/hydrate';
import { serializeEditorState } from './schema/serialize';
import { v2ToV3, v3ToV2 } from './schema/v2Adapter';
import { handleEnter } from './interaction/keymap/enter';
import { handleBackspace } from './interaction/keymap/backspace';
import { handleCmdA, notePressBreak } from './interaction/keymap/cmdA';

import './EditorPageV3.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
const SAVE_DEBOUNCE_MS = 1200;

const V3Doc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});

const HistoryExt = Extension.create({
  name: 'v3EditorHistory',
  addProseMirrorPlugins() {
    return [history()];
  },
});

const GroupsExt = Extension.create({
  name: 'v3EditorGroups',
  addProseMirrorPlugins() {
    return [createGroupsPlugin()];
  },
});

const SlashExt = Extension.create({
  name: 'v3EditorSlash',
  addProseMirrorPlugins() {
    return [slashMenuPlugin()];
  },
});

const AILockExt = Extension.create({
  name: 'v3EditorAILock',
  addProseMirrorPlugins() {
    return [aiLockPlugin];
  },
});

const PaginationExt = Extension.create({
  name: 'v3EditorPagination',
  addProseMirrorPlugins() {
    return [createPaginationPlugin({ canvasRootSelector: '.v3-editor-canvas-root' })];
  },
});

const KeymapExt = Extension.create({
  name: 'v3EditorKeymap',
  addProseMirrorPlugins() {
    return [
      keymap({
        Enter(_state, _dispatch, view) {
          return view ? handleEnter(view) : false;
        },
        Backspace(_state, _dispatch, view) {
          return view ? handleBackspace(view) : false;
        },
        'Mod-a'(_state, _dispatch, view) {
          return view ? handleCmdA(view) : false;
        },
        'Mod-A'(_state, _dispatch, view) {
          return view ? handleCmdA(view) : false;
        },
        Escape(_state, _dispatch, view) {
          if (view) notePressBreak(view);
          return false;
        },
      }),
    ];
  },
});

interface Props {
  initialResume: ResumeDocV2;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function EditorPageV3({ initialResume }: Props) {
  const previousResumeRef = React.useRef(initialResume);
  const hydratedRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightSaveRef = React.useRef<Promise<void> | null>(null);
  const latestSnapshotRef = React.useRef('');
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle');
  const [pageCount, setPageCount] = React.useState(1);

  const editor = useEditor({
    extensions: [
      V3Doc,
      Text,
      Bold,
      Italic,
      Link,
      HistoryExt,
      GroupsExt,
      SlashExt,
      AILockExt,
      PaginationExt,
      KeymapExt,
      ...v3RowExtensions,
    ],
    immediatelyRender: false,
    content: undefined,
  });

  React.useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    hydratedRef.current = false;
    const v3 = v2ToV3(initialResume);
    const schema = editor.schema as Schema;
    const { docJSON, groups } = hydrateInitialState(v3, schema);

    queueMicrotask(() => {
      if (cancelled) return;
      editor.commands.setContent(docJSON as Parameters<typeof editor.commands.setContent>[0], { emitUpdate: false });
      const tr = editor.view.state.tr
        .setMeta('groupsHydrate', groups)
        .setMeta('addToHistory', false);
      editor.view.dispatch(tr);
      requestPaginationLayout(editor.view);
      latestSnapshotRef.current = JSON.stringify(initialResume);
      previousResumeRef.current = initialResume;
      hydratedRef.current = true;
      setSaveStatus('saved');
    });
    return () => {
      cancelled = true;
    };
  }, [editor, initialResume]);

  React.useEffect(() => {
    if (!editor) return;
    const updatePageCount = () => {
      const pages = getPaginationState(editor.state).pageGeometries.length;
      if (pages > 0) setPageCount(pages);
    };
    updatePageCount();
    editor.on('transaction', updatePageCount);
    return () => {
      editor.off('transaction', updatePageCount);
    };
  }, [editor]);

  const buildV2Snapshot = React.useCallback((): ResumeDocV2 | null => {
    if (!editor || !hydratedRef.current) return null;
    const v3 = serializeEditorState(editor.state);
    return v3ToV2(v3, previousResumeRef.current);
  }, [editor]);

  const saveNow = React.useCallback(async () => {
    const next = buildV2Snapshot();
    if (!next) return;
    const snapshot = JSON.stringify(next);
    if (snapshot === latestSnapshotRef.current) return;

    setSaveStatus('saving');
    const promise = fetch(`${API_BASE}/api/resume/${encodeURIComponent(next.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: snapshot,
    }).then((resp) => {
      if (!resp.ok) throw new Error(`Save failed: ${resp.status}`);
      latestSnapshotRef.current = snapshot;
      previousResumeRef.current = next;
      setSaveStatus('saved');
      useSuggestionStore.getState().hydrate(next.id);
    }).catch((err) => {
      setSaveStatus('error');
      throw err;
    });
    inflightSaveRef.current = promise;
    try {
      await promise;
    } finally {
      if (inflightSaveRef.current === promise) inflightSaveRef.current = null;
    }
  }, [buildV2Snapshot]);

  React.useEffect(() => {
    if (!editor) return;
    const onTx = ({ transaction }: { transaction: unknown }) => {
      if (!hydratedRef.current) return;
      if (!(transaction as { docChanged?: boolean }).docChanged) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void saveNow();
      }, SAVE_DEBOUNCE_MS);
    };
    editor.on('transaction', onTx);
    return () => {
      editor.off('transaction', onTx);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [editor, saveNow]);

  usePageContext({
    page: 'resume_editor',
    summary: `正在编辑「${initialResume.title || '未命名'}」简历，目标 ${
      initialResume.metadata?.target_company ?? initialResume.metadata?.target_role ?? '未指定'
    }`,
    data: { resumeId: initialResume.id, title: initialResume.title, editorVersion: 'v3' },
  });

  React.useEffect(() => {
    useSuggestionStore.getState().hydrate(initialResume.id);
  }, [initialResume.id]);

  React.useEffect(() => {
    const unsub = useAssistantStore.subscribe((s) => {
      document.body.classList.toggle('ai-sidebar-open', s.pose === 'sidebar');
    });
    return () => {
      unsub();
      document.body.classList.remove('ai-sidebar-open');
    };
  }, []);

  const flushSave = React.useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (inflightSaveRef.current) await inflightSaveRef.current;
    await saveNow();
    if (inflightSaveRef.current) await inflightSaveRef.current;
  }, [saveNow]);

  const exportPdf = React.useCallback(async () => {
    try {
      await flushSave();
      const origin = encodeURIComponent(window.location.origin);
      window.location.href = `${API_BASE}/api/resume/${encodeURIComponent(initialResume.id)}/pdf?frontend_base=${origin}`;
    } catch (err) {
      alert(`Couldn't save before export: ${(err as Error).message}`);
    }
  }, [flushSave, initialResume.id]);

  return (
    <AppShell>
      <V3TopBar
        title={initialResume.title}
        targetCompany={initialResume.metadata.target_company}
        targetRole={initialResume.metadata.target_role}
        saveStatus={saveStatus}
        pageCount={pageCount}
        onExport={exportPdf}
      />
      <div className="v3-editor-stage ai-host-reflow">
        <div className="v3-editor-canvas-root">
          <ResumeCanvasV3 view={editor?.view ?? null}>
            <PageChromeLayer editor={editor} />
            {editor ? <EditorContent editor={editor} /> : <div className="v3-loading">Loading editor…</div>}
          </ResumeCanvasV3>
          {editor ? <SlashMenuOverlay view={editor.view} /> : null}
        </div>
      </div>
    </AppShell>
  );
}

function V3TopBar({
  title,
  targetCompany,
  targetRole,
  saveStatus,
  pageCount,
  onExport,
}: {
  title: string;
  targetCompany: string | null;
  targetRole: string | null;
  saveStatus: SaveStatus;
  pageCount: number;
  onExport: () => void;
}) {
  const tailoringLabel =
    targetCompany && targetRole
      ? `${targetCompany} · ${targetRole}`
      : targetCompany || targetRole || null;

  return (
    <div data-edit-only className="v3-topbar">
      <span className="v3-topbar-title">{title || 'Untitled Resume'}</span>
      <span className="v3-topbar-divider" />
      <span className="v3-topbar-version">v3 NodeView editor</span>
      <div className="v3-topbar-center">
        {tailoringLabel && (
          <>
            <span className="v3-topbar-label">Tailoring for</span>
            <span className="v3-topbar-target">{tailoringLabel}</span>
          </>
        )}
      </div>
      <SaveStatusBadge status={saveStatus} />
      <span className="v3-topbar-pages">{pageCount === 1 ? '1 page' : `${pageCount} pages`}</span>
      <button type="button" className="v3-export-button" onClick={onExport}>
        <Download className="size-3.5" strokeWidth={2} />
        Export PDF
      </button>
    </div>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return <span className={`v3-save-status v3-save-status-${status}`}>{status}</span>;
}
