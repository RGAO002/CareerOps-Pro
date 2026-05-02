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
import { UndoRedo } from '@tiptap/extensions';
import { Extension } from '@tiptap/core';
import { keymap } from '@tiptap/pm/keymap';
import type { Editor } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

import { AppShell } from '@/components/layout/AppShell';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { Assistant } from '@/components/ai/assistant';
import { AnimatePresence } from 'framer-motion';
import { SidebarPose } from '@/components/ai/assistant/poses/SidebarPose';
import { PreferencesDrawer } from '@/components/layout/PreferencesDrawer';
import { useAppStore } from '@/stores/app';
import { EditorShellCop } from './EditorShellCop';
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
import {
  type ResumeFileV3,
  v3FileToEditorBody,
  editorBodyToV3File,
  v3ApiToV2,
} from './schema/v3Envelope';
import { v3ToV2 } from './schema/v2Adapter';
import { handleEnter } from './interaction/keymap/enter';
import { handleBackspace } from './interaction/keymap/backspace';
import { handleCmdA, notePressBreak } from './interaction/keymap/cmdA';
import { FormatToolbarV3 } from './interaction/FormatToolbarV3';
import { FontSize } from '../v2/extensions/FontSize';
import { MarkdownInputRules } from '../v2/extensions/MarkdownInputRules';

import './EditorPageV3.css';
import './templates/fullstack.css';

export type TemplateId = 'minimal' | 'fullstack';
const TEMPLATE_CLASS: Record<TemplateId, string | null> = {
  minimal: null,
  fullstack: 'template-fullstack',
};

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
  /** v3 API envelope as returned by GET /api/resume/{id}. */
  initialResume: ResumeFileV3;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Editor-only Assistant — renders ONLY the sidebar pose. Orb and bar
 * are skipped so the editor view doesn't have a floating ball lurking
 * around. Closing the sidebar (`setPose('orb')` from the X button)
 * triggers the SidebarPose's exit animation (slide out to the right)
 * via AnimatePresence; afterwards nothing is rendered.
 */
function EditorAssistant() {
  const pose = useAssistantStore((s) => s.pose);
  return (
    <AnimatePresence mode="wait" initial={false}>
      {pose === 'sidebar' && <SidebarPose key="sidebar" />}
    </AnimatePresence>
  );
}

export function EditorPageV3({ initialResume }: Props) {
  // Track the latest v3 envelope (id/title/metadata + last-saved body) so
  // PUT can reconstruct an envelope without re-fetching, and so we have a
  // stable baseline for v3ApiToV2 when feeding the legacy v2 useResumeStore.
  const previousFileRef = React.useRef<ResumeFileV3>(initialResume);
  const previousResumeRef = React.useRef<ResumeDocV2>(v3ApiToV2(initialResume));
  const hydratedRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightSaveRef = React.useRef<Promise<void> | null>(null);
  const latestSnapshotRef = React.useRef('');
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle');
  const [pageCount, setPageCount] = React.useState(1);
  // Template selection — visual-only CSS class swap on the canvas root.
  // Persists in localStorage per-resume so reload remembers user's choice;
  // not yet stored in the v3 doc (would need a schema field).
  const [templateId, setTemplateId] = React.useState<TemplateId>('minimal');
  React.useEffect(() => {
    try {
      const k = `v3-template:${initialResume.id}`;
      const v = window.localStorage.getItem(k);
      if (v === 'fullstack' || v === 'minimal') setTemplateId(v);
    } catch {}
  }, [initialResume.id]);
  const setTemplate = React.useCallback((next: TemplateId) => {
    setTemplateId(next);
    try { window.localStorage.setItem(`v3-template:${initialResume.id}`, next); } catch {}
  }, [initialResume.id]);

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
    // initialResume is now a v3 API envelope. Strip to editor body and
    // hydrate. Feed a v3-derived v2 doc to useResumeStore so AI features
    // (SidebarPose / BarPose) that still read v2 keep working.
    const v3 = v3FileToEditorBody(initialResume);
    const v2Equivalent = v3ApiToV2(initialResume);
    previousFileRef.current = initialResume;
    previousResumeRef.current = v2Equivalent;
    const schema = editor.schema as Schema;
    const { docJSON, groups } = hydrateInitialState(v3, schema);

    useResumeStore.getState().hydrate(v2Equivalent);

    queueMicrotask(() => {
      if (cancelled) return;
      // Hydrate GroupsPlugin BEFORE setContent. NodeViews resolve their
      // role-aware placeholder ('Title @ Company' for Experience entries,
      // null for Summary, etc.) at mount time by reading
      // groupsPluginKey.getState(...). If we run setContent first, NodeViews
      // mount against an empty groups Map and fall back to the 'custom'
      // role -> 'Title' / 'Subtitle' show up where v2 wouldn't render
      // anything. Plugin-state changes alone don't trigger NodeView
      // re-render, so the wrong placeholder sticks. Order matters.
      const seedTr = editor.view.state.tr
        .setMeta('groupsHydrate', groups)
        .setMeta('addToHistory', false);
      editor.view.dispatch(seedTr);
      editor.commands.setContent(docJSON as Parameters<typeof editor.commands.setContent>[0], { emitUpdate: false });
      requestPaginationLayout(editor.view);
      latestSnapshotRef.current = JSON.stringify(initialResume);
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

  /**
   * Build the next v3 API envelope from current editor state, plus the
   * derived v2 doc for legacy consumers (useResumeStore / AI). Returns null
   * if the editor isn't hydrated yet.
   */
  const buildNextSnapshot = React.useCallback((): { file: ResumeFileV3; v2: ResumeDocV2 } | null => {
    if (!editor || !hydratedRef.current) return null;
    const body = serializeEditorState(editor.state);
    const file = editorBodyToV3File(body, previousFileRef.current);
    const v2 = v3ToV2(body, previousResumeRef.current);
    return { file, v2 };
  }, [editor]);

  const saveNow = React.useCallback(async () => {
    const next = buildNextSnapshot();
    if (!next) return;
    const snapshot = JSON.stringify(next.file);
    if (snapshot === latestSnapshotRef.current) return;

    setSaveStatus('saving');
    const promise = fetch(`${API_BASE}/api/resume/${encodeURIComponent(next.file.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: snapshot,
    }).then(async (resp) => {
      if (!resp.ok) throw new Error(`Save failed: ${resp.status}`);
      // Server refreshes updated_at; pull the canonical envelope back.
      const saved = (await resp.json()) as ResumeFileV3;
      latestSnapshotRef.current = JSON.stringify(saved);
      previousFileRef.current = saved;
      previousResumeRef.current = next.v2;
      setSaveStatus('saved');
      useResumeStore.getState().hydrate(next.v2);
      useSuggestionStore.getState().hydrate(saved.id);
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
  }, [buildNextSnapshot]);

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
      const tpl = templateId !== 'minimal' ? `&template=${templateId}` : '';
      window.location.href = `${API_BASE}/api/resume/${encodeURIComponent(initialResume.id)}/pdf?frontend_base=${origin}${tpl}`;
    } catch (err) {
      alert(`Couldn't save before export: ${(err as Error).message}`);
    }
  }, [flushSave, initialResume.id, templateId]);

  // AppShell unused on v3 editor — full-bleed shell below mirrors AppShell's
  // structure (Sidebar + TopBar + Assistant + PreferencesDrawer) but drops
  // the `max-w-5xl mx-auto px-8 py-10` main wrapper so the brand chrome and
  // tactical rail can span from the menu sidebar's right edge to the
  // viewport's right edge.
  void AppShell;
  return <EditorPageV3FullBleed
    title={initialResume.title ?? ''}
    targetCompany={initialResume.metadata.target_company ?? null}
    targetRole={initialResume.metadata.target_role ?? null}
    saveStatus={saveStatus}
    pageCount={pageCount}
    onExport={exportPdf}
    editor={editor}
    templateId={templateId}
    onTemplateChange={setTemplate}
  />;
}

function EditorPageV3FullBleed(props: {
  title: string;
  targetCompany: string | null;
  targetRole: string | null;
  saveStatus: SaveStatus; pageCount: number; onExport: () => void;
  editor: Editor | null;
  templateId: TemplateId;
  onTemplateChange: (next: TemplateId) => void;
}) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const { editor } = props;
  // Read sidebar pose so the page card can slide left when the sidebar is
  // open (avoids the floating panel covering the right side of the resume).
  // Editor area itself stays the same width — we only translate the card.
  const aiSidebarOpen = useAssistantStore((s) => s.pose === 'sidebar');
  // Suppress unused warnings — kept around for trivial revert.
  void V3TopBar;
  void TopBar;
  void props.targetCompany;
  void props.targetRole;

  // Push the AI sidebar to top:0 (full viewport height) only on this editor
  // route, AND drop the sidebar's left 1px separator border (otherwise it
  // shows as a seam against the full-bleed brand chrome). Restored on unmount.
  // Also lock body/html scroll — the editor shell already runs at 100vh with
  // its own internal scroll containers; an extra page-level scrollbar
  // appearing (e.g. via incidental overflow) was rendering as visible
  // gaps along the bottom + right edges.
  React.useEffect(() => {
    const root = document.documentElement.style;
    const bodyStyle = document.body.style;
    // AI sidebar in editor route → floating rounded card, inset from edges,
    // heavy shadow. Override the SidebarPose's CSS-var defaults.
    root.setProperty('--assistant-top-offset', '90px');
    root.setProperty('--assistant-right-offset', '16px');
    root.setProperty('--assistant-bottom-offset', '16px');
    root.setProperty('--assistant-width', '360px');
    root.setProperty('--assistant-radius', '20px');
    root.setProperty('--assistant-border-left', 'none');
    root.setProperty(
      '--assistant-shadow',
      [
        // Mid-strength elevation shadow — between the original light pass
        // and the heavy ground-shadow. Noticeably floating but still soft.
        '0 40px 100px -18px oklch(0.10 0.02 50 / 0.55)',
        '0 16px 40px -10px oklch(0.10 0.02 50 / 0.42)',
        '0 3px 8px -2px oklch(0.10 0.02 50 / 0.22)',
      ].join(', ')
    );
    const prevHtmlOverflow = root.overflow;
    const prevBodyOverflow = bodyStyle.overflow;
    root.overflow = 'hidden';
    bodyStyle.overflow = 'hidden';
    document.body.classList.add('cop-editor-fullbleed');
    return () => {
      root.removeProperty('--assistant-top-offset');
      root.removeProperty('--assistant-right-offset');
      root.removeProperty('--assistant-bottom-offset');
      root.removeProperty('--assistant-width');
      root.removeProperty('--assistant-radius');
      root.removeProperty('--assistant-border-left');
      root.removeProperty('--assistant-shadow');
      root.overflow = prevHtmlOverflow;
      bodyStyle.overflow = prevBodyOverflow;
      document.body.classList.remove('cop-editor-fullbleed');
    };
  }, []);

  // Force the menu sidebar collapsed when entering the editor view, regardless
  // of its previous state. The user's collapsed/expanded preference outside
  // editor is preserved by snapshotting + restoring on unmount.
  React.useEffect(() => {
    const prev = useAppStore.getState().sidebarCollapsed;
    if (!prev) useAppStore.setState({ sidebarCollapsed: true });
    return () => {
      useAppStore.setState({ sidebarCollapsed: prev });
    };
  }, []);

  // Scroll-indicator visibility is now LOCAL to each scroll container
  // (resume area + AI sidebar body manage their own indicators with inline
  // opacity). The previous global body.cop-s-N stepped-class system was
  // removed because it caused cross-talk: scrolling one container would
  // light up the other's indicator. No-op effect kept as a placeholder
  // in case we want to re-introduce a global "any scroll" hook later.
  React.useEffect(() => {
    return;
  }, []);

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div
        className="transition-[margin] duration-300"
        style={{
          marginLeft: collapsed ? 64 : 224,
          // AI sidebar floats — does NOT reflow the editor. Sidebar overlays
          // content with rounded corners + heavy shadow, no margin push.
          transitionTimingFunction: 'var(--ease-out-expo)',
        }}
      >
        {/* Global TopBar hidden on editor view — kept imported for trivial
            revert. Brand chrome takes its place at top of editor area. */}
        {/* V3TopBar removed in editor view — its FormatToolbar duplicated
            EditorShellCop's, and Saved/Pages/Export now live in EditorShellCop's
            toolbar row. Reference kept via void below for trivial revert. */}
        <EditorShellCop
          title={props.title}
          saveStatus={props.saveStatus}
          pageCount={props.pageCount}
          onExport={props.onExport}
          templateId={props.templateId}
          onTemplateChange={props.onTemplateChange}
          formatToolbar={editor ? <FormatToolbarV3 editor={editor} /> : null}
        >
          {/* Override v3-editor-stage's defaults:
              - overflow: visible / minHeight: auto → outer <main> in
                EditorShellCop is the sole scroll container (needed for the
                scroll-driven banner shrink + bounce)
              - background: transparent → don't paint the editor-stage's
                own beige radial-gradient. The wrapping <main> already has
                a paper-area gradient; v3-editor-stage's bg used to peek
                out below the last page card as a different-color block. */}
          <div
            className="v3-editor-stage ai-host-reflow"
            style={{
              overflow: 'visible',
              minHeight: 'auto',
              background: 'transparent',
              // Bottom padding gives the visible whitespace below the last
              // page card. Combined with canvas-root min-height that matches
              // the full page-card stack (see below), this makes the last
              // page's bottom edge sit ~80px above the viewport bottom.
              paddingBottom: 80,
            }}
          >
            <div
              className={`v3-editor-canvas-root${TEMPLATE_CLASS[props.templateId] ? ' ' + TEMPLATE_CLASS[props.templateId] : ''}`}
              style={{
                // Force canvas-root to be at least as tall as the entire
                // page-card stack. Page cards are absolutely positioned with
                // explicit top + height; if ProseMirror's content is shorter
                // than a full page, canvas-root would otherwise be shorter
                // than the last card's bottom edge, making the card visually
                // overflow into v3-editor-stage's padding area (looking like
                // the white paper bleeds to the viewport edge).
                //
                // pageCount * 11in (page) + (pageCount - 1) * 32px (gap).
                minHeight:
                  props.pageCount > 0
                    ? `calc(${props.pageCount} * 11in + ${Math.max(0, props.pageCount - 1)} * 32px)`
                    : '11in',
                // Slide the page card left when AI sidebar is open. Resume
                // intentionally LANDS LATER than the glass: same easing as
                // the sidebar but a longer duration so the glass arrives
                // first, then the resume drifts into place a beat later.
                // Companion timing in SidebarPose.tsx (~line 143).
                transform: aiSidebarOpen ? 'translateX(-180px)' : 'translateX(0)',
                transition: 'transform 0.95s cubic-bezier(0.5, 0.5, 0.5, 1)',
                willChange: 'transform',
              }}
            >
              <ResumeCanvasV3 view={editor?.view ?? null}>
                <PageChromeLayer editor={editor} />
                {editor ? <EditorContent editor={editor} /> : <div className="v3-loading">Loading editor…</div>}
              </ResumeCanvasV3>
              {editor ? <SlashMenuOverlay view={editor.view} /> : null}
            </div>
          </div>
        </EditorShellCop>
      </div>
      {/* In editor view we only render the sidebar pose — no orb / bar.
          Closing (X button → setPose('orb')) makes the sidebar fly out via
          AnimatePresence's exit animation; nothing replaces it. To re-open,
          use the global Cmd+\ shortcut or any setPose('sidebar') trigger. */}
      <EditorAssistant />
      {/* Original Assistant kept around as a no-op reference so the import
          isn't tree-shaken (in case other routes need it). */}
      {false && <Assistant />}
      <PreferencesDrawer />
    </div>
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
