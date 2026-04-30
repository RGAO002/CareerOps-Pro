// frontend/src/components/resume/v2/interaction/keyboard-router.ts
import { atomFocusManager } from './AtomFocusManager';
import { useResumeStore } from '../store/useResumeStore';
import { useAILockStore } from '@/stores/aiLock';
import { selectionManager } from './SelectionManager';
import { deleteBullet, deleteEntry, deleteSection } from '../store/actions/deleteBlock';
import { duplicateBullet, duplicateEntry, duplicateSection } from '../store/actions/duplicateBlock';
import { makeOrigin } from '../store/source-of-truth';
import { crossEditorSelection, editorRangesForKeys } from './CrossEditorSelection';
import type { BlockId } from '../types';

export function isEditorRoot(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('[data-canvas-root][data-mode="edit"]');
}

function isEditorKeyboardContext(target: EventTarget | null): boolean {
  if (isEditorRoot(target)) return true;
  if (selectionManager.hasBlockSelection()) return true;
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  const canvas = document.querySelector('[data-canvas-root][data-mode="edit"]');
  return !!canvas && (active === document.body || active === document.documentElement);
}

export function installKeyboardRouter(): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (!isEditorKeyboardContext(e.target)) return;
    const meta = e.metaKey || e.ctrlKey;

    // Cmd+A selection semantics:
    // - If a TipTap text cursor is active, select all text in the current
    //   section. This keeps text-editing intent separate from block selection.
    // - If no text cursor is active, select all visible resume text.
    // Cmd/Ctrl+click handles structural multi-block selection elsewhere.
    if (meta && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      const focused = atomFocusManager.currentEditor();
      const fieldKey = atomFocusManager.currentFieldKey();
      if (focused && fieldKey) {
        const sectionId = sectionIdForFieldKey(fieldKey);
        if (sectionId && selectSectionText(sectionId)) {
          selectionManager.clear();
          return;
        }
        focused.commands.selectAll();
        selectionManager.clear();
        return;
      }
      selectDocumentText();
      selectionManager.clear();
      return;
    }

    // Cmd+Z / Cmd+Shift+Z
    if (meta && e.key === 'z' && !e.shiftKey) {
      const focused = atomFocusManager.currentEditor();
      if (focused && focused.can().undo()) {
        e.preventDefault();
        focused.commands.undo();
      } else {
        e.preventDefault();
        useResumeStore.getState().undo();
      }
      return;
    }
    if (meta && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      const focused = atomFocusManager.currentEditor();
      if (focused && focused.can().redo()) {
        e.preventDefault();
        focused.commands.redo();
      } else {
        e.preventDefault();
        useResumeStore.getState().redo();
      }
      return;
    }

    // Cross-editor TEXT selection delete. When the user has dragged across
    // multiple TipTap fields, our overlay manager (crossEditorSelection)
    // holds per-editor ranges. The browser's native keydown won't propagate
    // a delete into all of them — TipTap's per-field handler only sees its
    // OWN range. So we intercept Backspace/Delete here and apply a delete
    // command to each ranged editor, then clear the cross-selection.
    if (crossEditorSelection.hasSelection() && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const ranges = crossEditorSelection.getRanges();
      const firstKey = ranges[0]?.key;
      const editorsByKey = new Map(atomFocusManager.editorsInOrder().map(({ key, editor }) => [key, editor]));
      // Apply each delete via TipTap chain — each editor records its own
      // per-field PM history step. Cmd+Z must be pressed once per touched
      // editor to fully restore (NOT unified). Unified undo is the
      // architecture work being planned in `single-pm-nodeview` PoC.
      for (let i = ranges.length - 1; i >= 0; i--) {
        const r = ranges[i];
        const editor = editorsByKey.get(r.key);
        if (!editor) continue;
        editor.chain().focus().deleteRange({ from: r.from, to: r.to }).run();
      }
      crossEditorSelection.clear();
      if (firstKey) {
        const startEditor = editorsByKey.get(firstKey);
        const startFrom = ranges[0].from;
        if (startEditor) {
          startEditor.commands.focus();
          startEditor.commands.setTextSelection(startFrom);
        }
      }
      return;
    }

    // Block selection ops — but ONLY if no TipTap field is focused. Otherwise
    // a Backspace inside an editable field would route through deleteSelectedBlocks
    // and obliterate the section/entry/bullet the user is typing in (the
    // selection might still be set from an earlier ⋮⋮ click that wasn't cleared).
    const tiptapFocused = !!atomFocusManager.currentEditor();
    if (!tiptapFocused && selectionManager.hasBlockSelection()) {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteSelectedBlocks();
        return;
      }
      if (meta && e.key === 'd') {
        e.preventDefault();
        duplicateSelectedBlocks();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        selectionManager.clear();
        return;
      }
    }
  }

  window.addEventListener('keydown', onKeyDown, true);
  return () => window.removeEventListener('keydown', onKeyDown, true);
}

function sectionIdForFieldKey(key: string): BlockId | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  const colon = key.indexOf(':');
  if (colon < 0) return null;
  const kind = key.slice(0, colon);
  const id = key.slice(colon + 1);
  if (kind === 'section.heading') return id;
  if (kind === 'entry.title' || kind === 'entry.meta') {
    return r.sections.find(s => s.entries.some(e => e.id === id))?.id ?? null;
  }
  if (kind === 'bullet.content') {
    for (const section of r.sections) {
      for (const entry of section.entries) {
        if (entry.bullets.some(b => b.id === id)) return section.id;
      }
    }
  }
  return null;
}

function selectSectionText(sectionId: BlockId): boolean {
  const r = useResumeStore.getState().resume;
  const section = r?.sections.find(s => s.id === sectionId);
  if (!section) return false;
  const keys = [
    `section.heading:${section.id}`,
    ...section.entries.flatMap(e => [
      `entry.title:${e.id}`,
      `entry.meta:${e.id}`,
      ...e.bullets.map(b => `bullet.content:${b.id}`),
    ]),
  ];
  return selectEditorKeys(keys);
}

function selectDocumentText(): boolean {
  const r = useResumeStore.getState().resume;
  if (!r) return false;
  const keys: string[] = ['header.name'];
  r.header.contact_lines.forEach((_, i) => keys.push(`header.contact:${i}`));
  for (const section of r.sections) {
    keys.push(`section.heading:${section.id}`);
    for (const entry of section.entries) {
      keys.push(`entry.title:${entry.id}`);
      keys.push(`entry.meta:${entry.id}`);
      for (const bullet of entry.bullets) keys.push(`bullet.content:${bullet.id}`);
    }
  }
  return selectEditorKeys(keys);
}

function selectEditorKeys(keys: string[]): boolean {
  const ranges = editorRangesForKeys(keys);
  if (ranges.length === 0) return false;
  window.getSelection()?.removeAllRanges();
  crossEditorSelection.setRanges(ranges);
  return true;
}

function deleteSelectedBlocks(): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  const ids = selectionManager.getBlocks();
  const lock = useAILockStore.getState();
  for (const id of ids) {
    // ★ AI lock guard (spec § 6.2 / Task 19 Step 5c): selection itself is
    // permitted on locked blocks ("locked blocks remain selectable") — but
    // mutation triggered FROM a multi-block selection must skip locked ids.
    if (lock.isLocked(id)) continue;
    if (r.sections.some(s => s.id === id)) deleteSection(id, makeOrigin('tiptap'));
    else if (r.sections.flatMap(s => s.entries).some(e => e.id === id)) deleteEntry(id, makeOrigin('tiptap'));
    else deleteBullet(id, makeOrigin('tiptap'));
  }
  selectionManager.clear();
}

function duplicateSelectedBlocks(): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  const ids = selectionManager.getBlocks();
  const lock = useAILockStore.getState();
  for (const id of ids) {
    if (lock.isLocked(id)) continue;
    if (r.sections.some(s => s.id === id)) duplicateSection(id, makeOrigin('tiptap'));
    else if (r.sections.flatMap(s => s.entries).some(e => e.id === id)) duplicateEntry(id, makeOrigin('tiptap'));
    else duplicateBullet(id, makeOrigin('tiptap'));
  }
}
