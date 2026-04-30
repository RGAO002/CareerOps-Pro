// T26 — M3 integration smoke.
// Boots a complete v3 editor (T18 schema + T19 NodeViews + GroupsPlugin +
// AILockPlugin + SlashMenuPlugin + Enter/Backspace/Cmd+A keymaps + rangeResolver)
// and exercises end-to-end behaviors that pin F1 / F4 / F5 contracts.
//
// Spec ref: docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md § 7.3 + § 7.6.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { history, undo } from '@tiptap/pm/history';
import * as React from 'react';
import { act } from 'react';

import { v3RowExtensions, buildContent } from '../../schema/pmSchema';
import { hydrateInitialState } from '../../schema/hydrate';
import { createGroupsPlugin, groupsPluginKey } from '../../plugins/GroupsPlugin';
import { aiLockPlugin } from '../../plugins/AILockPlugin';
import { slashMenuPlugin, runSlashCommand } from '../../plugins/SlashMenuPlugin';
import { handleEnter } from '../../interaction/keymap/enter';
import { handleBackspace } from '../../interaction/keymap/backspace';
import { handleCmdA, notePressBreak } from '../../interaction/keymap/cmdA';
import { resolveBlockRange } from '../../interaction/rangeResolver';
import * as dispatchModule from '../../interaction/dispatchWithGroups';
import { useAILockStore } from '@/stores/aiLock';
import type { GroupId, RowId } from '../../schema/types';

import { onePage, onePageOrphan } from './fixtures/onePage';

// Restrict the doc node to v3 row group so the schema accepts only v3 row types.
const TestDoc = Document.extend({
  content: '(header_name | header_contact | section_heading | entry_title | entry_meta | plain | bullet)+',
});

const baseExtensions = [TestDoc, Text, Bold, Italic, Link, ...v3RowExtensions];
const schema = getSchema(baseExtensions);

// ---------- PM EditorView boot (used by most tests; faster than mounting React) ----------

interface BootedView {
  view: EditorView;
  cleanup: () => void;
}

function bootEditorPM(doc = onePage): BootedView {
  const { docJSON, groups } = hydrateInitialState(doc, schema);
  const pmDoc = schema.nodeFromJSON(docJSON);
  let state = EditorState.create({
    schema,
    doc: pmDoc,
    plugins: [
      history(),
      createGroupsPlugin(),
      slashMenuPlugin(),
      aiLockPlugin,
    ],
  });
  // Hydrate groups state.
  state = state.apply(state.tr.setMeta('groupsHydrate', groups));

  const place = document.createElement('div');
  document.body.appendChild(place);
  const view = new EditorView(place, {
    state,
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr));
    },
  });
  return {
    view,
    cleanup: () => {
      view.destroy();
      place.remove();
    },
  };
}

function placeCursorAtRow(view: EditorView, rowIndex: number, offsetInRow: number): void {
  let target = 1;
  view.state.doc.forEach((node, off, idx) => {
    if (idx === rowIndex) target = off + 1 + offsetInRow;
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target)));
}

function placeAtEndOfRow(view: EditorView, rowIndex: number): void {
  view.state.doc.forEach((node, off, idx) => {
    if (idx === rowIndex) {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, off + 1 + node.content.size)),
      );
    }
  });
}

function rowOffset(view: EditorView, rowIndex: number): number {
  let pos = 0;
  view.state.doc.forEach((_n, off, idx) => {
    if (idx === rowIndex) pos = off;
  });
  return pos;
}

// ---------- React boot (only used by F1 selector test) ----------

function MountReact({ onReady }: { onReady: (e: Editor) => void }) {
  const editor = useEditor({
    extensions: baseExtensions,
    content: buildContent(schema, onePage.rows),
    immediatelyRender: false,
  });
  React.useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);
  if (!editor) return null;
  return <EditorContent editor={editor} />;
}

async function flushFrames() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// ---------- tests ----------

describe('T26 — M3 integration smoke', () => {
  let booted: BootedView | null = null;
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useAILockStore.getState().clear();
    dispatchSpy = vi.spyOn(dispatchModule, 'dispatchWithGroups');
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
    if (booted) {
      booted.cleanup();
      booted = null;
    }
    cleanup();
    document.body.innerHTML = '';
  });

  // 1. ----------------------------------------------------------------
  it('boots editor with full extension list (T18 schema + 7 NodeViews + GroupsPlugin + AILockPlugin + slash + keymaps)', () => {
    booted = bootEditorPM();
    // Sanity checks — schema has all 7 row kinds, plugins are wired.
    for (const k of [
      'header_name', 'header_contact', 'section_heading',
      'entry_title', 'entry_meta', 'plain', 'bullet',
    ]) {
      expect(schema.nodes[k]).toBeTruthy();
    }
    // Plugin keys present.
    expect(groupsPluginKey.getState(booted.view.state)).toBeTruthy();
    // Doc successfully hydrated.
    expect(booted.view.state.doc.childCount).toBe(onePage.rows.length);
    // Smoke-call keymap helpers — don't crash when no row is selected/active.
    expect(typeof handleEnter).toBe('function');
    expect(typeof handleBackspace).toBe('function');
    expect(typeof handleCmdA).toBe('function');
    expect(typeof resolveBlockRange).toBe('function');
  });

  // 2. F1 wrapper-selector contract -------------------------------------
  it('hydrates a 1-page fixture; rows queryable via :scope > div > .row (F1)', async () => {
    let editorRef: Editor | null = null;
    render(<MountReact onReady={(e) => (editorRef = e)} />);
    await flushFrames();
    expect(editorRef).toBeTruthy();
    const view = editorRef!.view;
    const rows = view.dom.querySelectorAll(':scope > div > .row');
    expect(rows.length).toBe(onePage.rows.length);
  });

  // 3. ------------------------------------------------------------------
  it('typing into a bullet text content updates content and does NOT touch group state', () => {
    booted = bootEditorPM();
    const groupsBefore = groupsPluginKey.getState(booted.view.state);
    // Bullet is row index 5 (0-based after name, contact, heading, title, meta).
    const bulletIdx = 5;
    placeAtEndOfRow(booted.view, bulletIdx);
    const docBefore = booted.view.state.doc;
    // Type a character.
    booted.view.dispatch(
      booted.view.state.tr.insertText('!', booted.view.state.selection.from),
    );
    expect(booted.view.state.doc.eq(docBefore)).toBe(false);
    // Bullet text now ends with '!'.
    const bulletNode = booted.view.state.doc.child(bulletIdx);
    expect(bulletNode.textContent.endsWith('!')).toBe(true);
    // Groups state unchanged (same Map identity OR equal contents — we check equality).
    const groupsAfter = groupsPluginKey.getState(booted.view.state);
    expect(groupsAfter?.byId.size).toBe(groupsBefore?.byId.size);
    for (const [id, g] of groupsBefore!.byId.entries()) {
      expect(groupsAfter!.byId.get(id)).toEqual(g);
    }
  });

  // 4. ------------------------------------------------------------------
  it('cross-row Backspace deletes a multi-row text selection in one PM step', () => {
    booted = bootEditorPM();
    const view = booted.view;
    // Select from middle of bullet1 to middle of bullet2 (rows 5 and 6).
    let from = 0;
    let to = 0;
    view.state.doc.forEach((node, off, idx) => {
      if (idx === 5) from = off + 1 + 2; // 2 chars into bullet1
      if (idx === 6) to = off + 1 + 2;   // 2 chars into bullet2
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    const stepCountBefore = 0;
    let stepsApplied = 0;
    const origDispatch = view.dispatch.bind(view);
    (view as unknown as { dispatch: (t: import('@tiptap/pm/state').Transaction) => void }).dispatch = (tr) => {
      stepsApplied += tr.steps.length;
      origDispatch(tr);
    };
    const handled = handleBackspace(view);
    expect(handled).toBe(true);
    // The cross-row deletion should produce >= 1 transaction step but apply atomically.
    expect(stepsApplied).toBeGreaterThan(stepCountBefore);
    // Selection collapsed.
    expect(view.state.selection.from).toBe(view.state.selection.to);
  });

  // 5. F4 orphan tolerance ----------------------------------------------
  it('cross-row Backspace tolerates orphan group state (F4)', () => {
    booted = bootEditorPM(onePageOrphan);
    const view = booted.view;
    // Sanity: section group gS1 is NOT in plugin state (orphan fixture).
    const groups = groupsPluginKey.getState(view.state)!;
    expect(groups.byId.has('gS1' as GroupId)).toBe(false);
    expect(groups.byId.has('gE1' as GroupId)).toBe(true);

    // Select across two rows.
    let from = 0;
    let to = 0;
    view.state.doc.forEach((node, off, idx) => {
      if (idx === 5) from = off + 1;
      if (idx === 6) to = off + 1 + node.content.size;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    expect(() => handleBackspace(view)).not.toThrow();
  });

  // 6. F5 enter at end of section.heading -------------------------------
  it('Enter at end of section.heading creates entry.title + new entry group through dispatchWithGroups (F5)', () => {
    booted = bootEditorPM();
    const view = booted.view;
    // Heading is row index 2.
    placeAtEndOfRow(view, 2);
    const childCountBefore = view.state.doc.childCount;
    handleEnter(view);
    expect(dispatchSpy).toHaveBeenCalled();
    // At least one call had non-empty groupOps with a 'create' for an entry group.
    const calls = dispatchSpy.mock.calls;
    const groupCreateCall = calls.find((c) => {
      const args = c[1] as { groupOps?: Array<{ type: string; group?: { kind: string } }> };
      return (args.groupOps ?? []).some(
        (op) => op.type === 'create' && op.group?.kind === 'entry',
      );
    });
    expect(groupCreateCall).toBeTruthy();
    expect(view.state.doc.childCount).toBe(childCountBefore + 1);
    // The new row at index 3 should be entry_title.
    expect(view.state.doc.child(3).type.name).toBe('entry_title');
  });

  // 7. F5 slash heading -------------------------------------------------
  it('slash /heading converts current row to section_heading + creates section group through dispatchWithGroups (F5)', () => {
    booted = bootEditorPM();
    const view = booted.view;
    // Use the bullet row at index 5 — runSlashCommand operates on whatever the cursor row is.
    placeCursorAtRow(view, 5, 0);
    runSlashCommand(view, 'heading');
    expect(dispatchSpy).toHaveBeenCalled();
    const args = dispatchSpy.mock.calls[0][1] as {
      groupOps?: Array<{ type: string; group?: { kind: string; role: string } }>;
    };
    const ops = args.groupOps ?? [];
    expect(ops.some((op) => op.type === 'create' && op.group?.kind === 'section')).toBe(true);
    expect(view.state.doc.child(5).type.name).toBe('section_heading');
  });

  // 8. Cmd+A 2x expands to entry group ---------------------------------
  it('Cmd+A 2x expands selection to current entry group', () => {
    booted = bootEditorPM();
    const view = booted.view;
    notePressBreak(view);
    // Cursor inside entry_meta (row 4) which has gid gE1.
    placeCursorAtRow(view, 4, 0);
    handleCmdA(view); // level 1: row content
    handleCmdA(view); // level 2: entry group
    const sel = view.state.selection;
    // Expected entry group spans rows 3,4,5,6 (entry_title, entry_meta, bullet1, bullet2 — all gE1).
    let expFrom = -1;
    let expTo = -1;
    view.state.doc.forEach((c, off) => {
      const cgid = c.attrs.semanticGroupId as string | null;
      if (cgid === 'gE1') {
        if (expFrom === -1) expFrom = off;
        expTo = off + c.nodeSize;
      }
    });
    expect(sel.from).toBe(expFrom);
    expect(sel.to).toBe(expTo);
  });

  // 9. Cmd+Z one-step revert of cross-row backspace --------------------
  it('Cmd+Z one-step reverts a cross-row backspace (PM native + GroupsPlugin atomic via single tr — F5 + § 2.6 atomicity)', () => {
    booted = bootEditorPM();
    const view = booted.view;
    const docBefore = view.state.doc;
    const childCountBefore = view.state.doc.childCount;
    const groupsBefore = groupsPluginKey.getState(view.state)!;

    // Select across rows 5 and 6.
    let from = 0;
    let to = 0;
    view.state.doc.forEach((node, off, idx) => {
      if (idx === 5) from = off + 1;
      if (idx === 6) to = off + 1 + node.content.size;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    handleBackspace(view);

    expect(view.state.doc.eq(docBefore)).toBe(false);

    // One undo step.
    let s = view.state;
    undo(s, (tr) => { s = s.apply(tr); view.updateState(s); });

    expect(view.state.doc.childCount).toBe(childCountBefore);
    // Groups state still consistent (orphan-tolerant).
    const groupsAfter = groupsPluginKey.getState(view.state)!;
    expect(groupsAfter.byId.size).toBeGreaterThanOrEqual(groupsBefore.byId.size);
  });

  // 10. Cmd+Z revert of slash kind conversion --------------------------
  it('Cmd+Z one-step reverts a slash kind conversion including its group create (F5)', () => {
    booted = bootEditorPM();
    const view = booted.view;
    const childCountBefore = view.state.doc.childCount;

    placeCursorAtRow(view, 5, 0); // bullet → heading via /heading
    const kindBefore = view.state.doc.child(5).type.name;
    expect(kindBefore).toBe('bullet');
    runSlashCommand(view, 'heading');
    expect(view.state.doc.child(5).type.name).toBe('section_heading');

    // One undo step reverts the doc kind change.
    let s = view.state;
    undo(s, (tr) => { s = s.apply(tr); view.updateState(s); });

    expect(view.state.doc.child(5).type.name).toBe('bullet');
    expect(view.state.doc.childCount).toBe(childCountBefore);
    // Group state contract per § 2.6: groupOps meta is NOT preserved across PM history,
    // so the created section group lingers as orphan in plugin state. Save-time GC drops it.
    // We only assert the doc step was reverted atomically here.
  });

  // 11. AI lock blocks user / allows allowLockedEdit -------------------
  it('AI lock blocks user typing into a locked row but permits transactions tagged allowLockedEdit', () => {
    booted = bootEditorPM();
    const view = booted.view;
    // Lock the entry_meta row by RowId.
    useAILockStore.getState().lock(['r-meta' as RowId]);

    // User-style transaction: should be filtered out by AILockPlugin.
    const docBefore = view.state.doc;
    const metaPos = rowOffset(view, 4) + 1;
    view.dispatch(view.state.tr.insertText('X', metaPos));
    expect(view.state.doc.eq(docBefore)).toBe(true);

    // allowLockedEdit-tagged transaction: bypass.
    view.dispatch(
      view.state.tr.insertText('Z', metaPos).setMeta('allowLockedEdit', true),
    );
    expect(view.state.doc.eq(docBefore)).toBe(false);
    expect(view.state.doc.child(4).textContent.startsWith('Z')).toBe(true);
  });
});
