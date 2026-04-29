// frontend/src/components/resume/v2/interaction/keyboard-router.ts
import { atomFocusManager } from './AtomFocusManager';
import { useResumeStore } from '../store/useResumeStore';
import { useAILockStore } from '@/stores/aiLock';
import { selectionManager } from './SelectionManager';
import { deleteBullet, deleteEntry, deleteSection } from '../store/actions/deleteBlock';
import { duplicateBullet, duplicateEntry, duplicateSection } from '../store/actions/duplicateBlock';
import { makeOrigin } from '../store/source-of-truth';
import type { BlockId } from '../types';

export function isEditorRoot(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('[data-canvas-root][data-mode="edit"]');
}

export function installKeyboardRouter(): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (!isEditorRoot(e.target)) return;
    const meta = e.metaKey || e.ctrlKey;

    // Cmd+A semantics:
    //   1. Cursor active in a TipTap field AND a block is currently selected
    //      → select all blocks belonging to the section that block is in
    //      (each text field is its own TipTap instance, so native Cmd+A
    //      can't span fields; promoting to block-level selection covers it).
    //   2. No TipTap focus            → select every block in the document.
    //   3. TipTap focus, no selection → fall through to TipTap's native
    //      select-all (don't intercept).
    if (meta && e.key === 'a' && !e.shiftKey) {
      const focused = atomFocusManager.currentEditor();
      const selected = selectionManager.getBlocks();

      if (focused && selected.length > 0) {
        const sectionId = findSectionForBlock(selected[0]);
        if (sectionId) {
          e.preventDefault();
          focused.commands.blur();
          selectAllBlocksInSection(sectionId);
          return;
        }
      }

      if (!focused) {
        e.preventDefault();
        selectAllBlocks();
        return;
      }

      // TipTap focused, no selection — let native select-all run.
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

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

function selectAllBlocks(): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  const ids: BlockId[] = [];
  for (const s of r.sections) {
    ids.push(s.id);
    for (const e of s.entries) {
      ids.push(e.id);
      for (const b of e.bullets) ids.push(b.id);
    }
  }
  selectionManager.setBlocks(ids);
}

function selectAllBlocksInSection(sectionId: BlockId): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  const sec = r.sections.find(s => s.id === sectionId);
  if (!sec) return;
  const ids: BlockId[] = [sec.id];
  for (const e of sec.entries) {
    ids.push(e.id);
    for (const b of e.bullets) ids.push(b.id);
  }
  selectionManager.setBlocks(ids);
}

/** Given any block id (section / entry / bullet), return the section.id it
 *  belongs to. */
function findSectionForBlock(id: BlockId): BlockId | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  for (const s of r.sections) {
    if (s.id === id) return s.id;
    for (const e of s.entries) {
      if (e.id === id) return s.id;
      if (e.bullets.some(b => b.id === id)) return s.id;
    }
  }
  return null;
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
