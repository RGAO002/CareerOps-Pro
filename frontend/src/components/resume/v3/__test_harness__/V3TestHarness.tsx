// V3TestHarness — test-only React component for /v3-test (T31).
//
// Mounts a real v3 editor (PM EditorView with v3 row extensions, GroupsPlugin,
// history) wrapped by ResumeCanvasV3 (which renders the InteractionLayer), and
// wires `.row-handle` pointerdown listeners to DragController so a Playwright
// pointer-driven drag actually moves rows and updates groups.
//
// Exposes `window.__v3TestHarness` for the e2e spec:
//   - getDoc():              ResumeDocV3 — reflects current state via serialize.
//   - getGroupParent(gid):   string | null — parentSectionGroupId for a group.
//   - getRowOrder():         RowId[] — child order in current doc.
//   - dispatchEsc():         simulate Escape on the active drag (defensive — the
//                            DragController already listens on window).
//
// NOTE: This file is intentionally outside production paths. It only ships
// because Next.js requires components be importable from /app pages. The
// /v3-test route is gated by being clearly out-of-band and excluded from any
// production navigation.

'use client';
import * as React from 'react';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { history } from '@tiptap/pm/history';

import { v3RowExtensions } from '../schema/pmSchema';
import { hydrateInitialState } from '../schema/hydrate';
import { serializeEditorState } from '../schema/serialize';
import { createGroupsPlugin, groupsPluginKey } from '../plugins/GroupsPlugin';
import { DragController } from '../interaction/DragController';
import type { RowId, GroupId } from '../schema/types';
import { twoSections } from './twoSections';

// Restrict doc node to v3 row group — same shape used by integration tests.
const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});

const baseExtensions = [TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions];
const schema = getSchema(baseExtensions);

interface HarnessGlobals {
  getDoc: () => unknown;
  getGroupParent: (gid: string) => string | null;
  getRowOrder: () => string[];
  getRowGroupId: (rowId: string) => string | null;
}

declare global {
  interface Window {
    __v3TestHarness?: HarnessGlobals;
  }
}

export function V3TestHarness() {
  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const dragRef = React.useRef<DragController | null>(null);
  const handleListenersRef = React.useRef<Array<() => void>>([]);

  React.useEffect(() => {
    const place = mountRef.current;
    if (!place) return;

    // Boot PM editor.
    const { docJSON, groups } = hydrateInitialState(twoSections, schema);
    const pmDoc = schema.nodeFromJSON(docJSON);
    let state = EditorState.create({
      schema,
      doc: pmDoc,
      plugins: [history(), createGroupsPlugin()],
    });
    state = state.apply(state.tr.setMeta('groupsHydrate', groups));

    const view = new EditorView(place, {
      state,
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr));
        // Re-bind row-handle listeners after structural changes (rows may have
        // been re-rendered with new DOM elements). Simple approach: re-bind on
        // every dispatch. Performance is irrelevant in a test harness.
        rebindRowHandles();
      },
    });
    viewRef.current = view;

    const ctl = new DragController({ view });
    dragRef.current = ctl;

    function rebindRowHandles() {
      // Detach previous listeners.
      for (const off of handleListenersRef.current) off();
      handleListenersRef.current = [];

      // Walk current rows and bind pointerdown on each .row-handle.
      const rows = place!.querySelectorAll<HTMLElement>('[data-row-id]');
      rows.forEach((row) => {
        const handle = row.querySelector<HTMLElement>('.row-handle');
        if (!handle) return;
        const rowId = row.getAttribute('data-row-id') as RowId | null;
        if (!rowId) return;
        const onDown = (ev: PointerEvent) => ctl.onPointerDown(ev, rowId, handle);
        handle.addEventListener('pointerdown', onDown);
        // Make handle reachable for tests + visible (interaction layer style).
        handle.setAttribute('data-test-handle', '');
        handle.style.cursor = 'grab';
        handleListenersRef.current.push(() => handle.removeEventListener('pointerdown', onDown));
      });
    }
    rebindRowHandles();

    // Expose harness API.
    const api: HarnessGlobals = {
      getDoc: () => serializeEditorState(view.state),
      getGroupParent: (gid: string) => {
        const g = groupsPluginKey.getState(view.state)?.byId.get(gid as GroupId);
        if (!g) return null;
        if (g.kind !== 'entry') return null;
        return (g.parentSectionGroupId as string | undefined) ?? null;
      },
      getRowOrder: () => {
        const ids: string[] = [];
        view.state.doc.forEach((c) => ids.push(c.attrs.id as string));
        return ids;
      },
      getRowGroupId: (rowId: string) => {
        let found: string | null = null;
        view.state.doc.forEach((c) => {
          if (c.attrs.id === rowId) {
            found = (c.attrs.semanticGroupId as string | null) ?? null;
          }
        });
        return found;
      },
    };
    window.__v3TestHarness = api;

    // Signal ready.
    place.setAttribute('data-v3-harness-ready', 'true');

    return () => {
      for (const off of handleListenersRef.current) off();
      handleListenersRef.current = [];
      view.destroy();
      viewRef.current = null;
      dragRef.current = null;
      delete window.__v3TestHarness;
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-v3-harness-root
      style={{
        position: 'relative',
        background: '#fff',
        padding: '16px',
        minHeight: '600px',
        // Visible row handles so Playwright can hover/click them deterministically.
      }}
    >
      <style>{`
        [data-v3-harness-root] .row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 4px 0;
          position: relative;
        }
        [data-v3-harness-root] .row-handle {
          display: inline-block;
          width: 12px;
          height: 12px;
          background: #ccc;
          border-radius: 2px;
          flex-shrink: 0;
          cursor: grab;
        }
        [data-v3-harness-root] .row.row-dragging { opacity: 0.4; }
      `}</style>
    </div>
  );
}
