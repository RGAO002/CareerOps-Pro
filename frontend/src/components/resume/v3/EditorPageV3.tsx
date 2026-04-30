'use client';

import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
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
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { Extension } from '@tiptap/core';
import { keymap } from '@tiptap/pm/keymap';
import type { Editor } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

import { AppShell } from '@/components/layout/AppShell';
import { usePageContext } from '@/hooks/usePageContext';
import { useAssistantStore } from '@/stores/assistant';
import { useSuggestionStore } from '@/stores/aiSuggestion';
import { useResumeStore } from '../v2/store/useResumeStore';
import { _registerV3EditorView } from '@/components/ai/applySuggestion';
import { Download } from 'lucide-react';

import type { ResumeDoc as ResumeDocV2 } from '../v2/types';
import { ResumeCanvasV3 } from './ResumeCanvasV3';
import { PageChromeLayer } from './layers/PageChromeLayer';
import { SlashMenuOverlay } from './plugins/SlashMenuOverlay';
import { createGroupsPlugin, groupsPluginKey } from './plugins/GroupsPlugin';
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
import { FormatToolbarV3 } from './interaction/FormatToolbarV3';
import { FontSize } from '../v2/extensions/FontSize';
import { MarkdownInputRules } from '../v2/extensions/MarkdownInputRules';

import './EditorPageV3.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
const SAVE_DEBOUNCE_MS = 1200;

const V3Doc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});

// In Tiptap 3 the History extension was renamed UndoRedo and lives in
// @tiptap/extensions. It registers BOTH the PM history plugin AND the
// chain commands (undo/redo) AND the default Mod-Z / Mod-Shift-Z keymap.
// The previous raw `history()` from @tiptap/pm/history only added the
// plugin, so toolbar undo/redo buttons + the Cmd+Z keybind silently
// no-op'd because chain().undo() / chain().redo() weren't registered.
const HistoryExt = UndoRedo;

// Per-row-kind placeholder text. For entry rows we fall back further to
// the section role (Experience vs Skills vs Education etc.) since the
// "Title @ Company" hint is wrong for a Skills entry. Mirrors v2's
// placeholdersFor() in EntryAtomRenderer.tsx.
const PLACEHOLDER_BY_ROLE: Record<string, { title: string | null; meta: string | null }> = {
  summary:      { title: null, meta: null },
  skills:       { title: 'Skill category (e.g. Languages)', meta: null },
  experience:   { title: 'Title @ Company', meta: 'Date · Location' },
  projects:     { title: 'Project name', meta: 'Date · Tech / link' },
  education:    { title: 'Degree, Major', meta: 'School · Year' },
  awards:       { title: 'Award name', meta: 'Date · Issuer' },
  publications: { title: 'Publication title', meta: 'Venue · Year' },
  volunteer:    { title: 'Role @ Organization', meta: 'Date · Location' },
  custom:       { title: 'Title', meta: 'Subtitle' },
};

const PlaceholderExt = Placeholder.configure({
  showOnlyCurrent: false,  // show on all empty rows, not just the focused one
  includeChildren: false,
  placeholder: ({ editor, node }) => {
    const kind = node.type.name;
    if (kind === 'header_name')     return 'Your name';
    if (kind === 'header_contact')  return 'email | phone | location';
    if (kind === 'section_heading') return 'Section heading';
    if (kind === 'bullet')          return 'Empty bullet — type, or Backspace to remove';
    if (kind === 'plain')           return 'New line';

    if (kind === 'entry_title' || kind === 'entry_meta') {
      // Resolve owning section's role via GroupsPlugin state. Fall back to
      // 'custom' if the entry is orphan (F4-tolerant).
      const gid = node.attrs.semanticGroupId as string | null | undefined;
      let role = 'custom';
      try {
        const groups = groupsPluginKey.getState(editor.state);
        const entry = gid ? groups?.byId.get(gid as never) : undefined;
        if (entry?.kind === 'entry' && entry.parentSectionGroupId) {
          const section = groups?.byId.get(entry.parentSectionGroupId);
          if (section?.kind === 'section') role = section.role;
        }
      } catch {/* tolerate missing groups state */}
      const ph = PLACEHOLDER_BY_ROLE[role] ?? PLACEHOLDER_BY_ROLE.custom;
      const which = kind === 'entry_title' ? ph.title : ph.meta;
      return which ?? '';
    }
    return '';
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
      TextStyle,
      Bold,
      Italic,
      Underline,
      Color,
      FontFamily.configure({ types: ['textStyle'] }),
      FontSize.configure({ types: ['textStyle'] }),
      Highlight.configure({ multicolor: true }),
      Link,
      MarkdownInputRules,
      PlaceholderExt,
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

    // Hydrate v2 useResumeStore so AI features (SidebarPose / BarPose) that
    // read useResumeStore.getState().resume can find the current doc. v3 is
    // the editor of record but v2 store stays the source of truth for AI
    // calls (and for the v2 atom renderers used in PrintCanvasClient).
    useResumeStore.getState().hydrate(initialResume);

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
      // Keep v2 useResumeStore in sync so AI features always see the
      // freshest content (not the stale initialResume from page mount).
      useResumeStore.getState().hydrate(next);
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

  // Wire AI integration: register the live PM view so applySuggestion can
  // route v3 suggestions through dispatchWithGroups (T38), and attach the
  // suggestion store to PM transactions so applied/pending status tracks
  // PM history including undo (T39).
  React.useEffect(() => {
    if (!editor) return;
    _registerV3EditorView(editor.view);
    const detachStore = useSuggestionStore.getState().attachToEditor(editor);
    return () => {
      _registerV3EditorView(null);
      detachStore();
    };
  }, [editor]);

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
        editor={editor}
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
  editor,
}: {
  title: string;
  targetCompany: string | null;
  targetRole: string | null;
  saveStatus: SaveStatus;
  pageCount: number;
  onExport: () => void;
  editor: Editor | null;
}) {
  const tailoringLabel =
    targetCompany && targetRole
      ? `${targetCompany} · ${targetRole}`
      : targetCompany || targetRole || null;

  return (
    <div data-edit-only className="v3-topbar">
      <span className="v3-topbar-title">{title || 'Untitled Resume'}</span>
      <span className="v3-topbar-divider" />
      <FormatToolbarV3 editor={editor} />
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
