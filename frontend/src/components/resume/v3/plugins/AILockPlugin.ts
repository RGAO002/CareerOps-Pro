// frontend/src/components/resume/v3/plugins/AILockPlugin.ts
//
// T24 — AI lock enforcement via PM Plugin.filterTransaction.
// Spec: docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md § 6.3.
//
// Contract:
//   - User transactions that modify a locked row's range are rejected.
//   - A row counts as "locked" if its `id` attr is in the lock set, OR its
//     `semanticGroupId` attr is in the lock set (direct attr match — F4
//     orphan-tolerant; we do NOT walk parent chains in GroupsPlugin state).
//   - Selection-only / no-doc-change transactions always pass.
//   - Transactions tagged with meta('allowLockedEdit', true) bypass the gate
//     (this is how AI/system applies a write to a locked row).
//
// filterTransaction sees ALL incoming transactions — keymap, paste, mark,
// drag-insertion, slash command — uniformly, so this gate is the single
// chokepoint for v3 lock enforcement.

import { Plugin } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { useAILockStore } from '@/stores/aiLock';

function rangesOverlap(
  aFrom: number,
  aTo: number,
  ranges: { from: number; to: number }[]
): boolean {
  for (const r of ranges) {
    if (!(aTo < r.from || aFrom > r.to)) return true;
  }
  return false;
}

function transactionTouchesRanges(
  tr: Transaction,
  ranges: { from: number; to: number }[]
): boolean {
  if (!tr.docChanged) return false;
  if (ranges.length === 0) return false;
  // Position-changing steps: report ranges via stepMap.forEach.
  let touched = false;
  tr.mapping.maps.forEach((stepMap) => {
    if (touched) return;
    stepMap.forEach((oldStart, oldEnd) => {
      if (touched) return;
      if (rangesOverlap(oldStart, oldEnd, ranges)) touched = true;
    });
  });
  if (touched) return true;
  // Mark steps (AddMarkStep / RemoveMarkStep) and any step whose stepMap is
  // empty (no position changes) — inspect raw step from/to.
  for (const step of tr.steps) {
    const anyStep = step as unknown as { from?: number; to?: number };
    if (typeof anyStep.from === 'number' && typeof anyStep.to === 'number') {
      if (rangesOverlap(anyStep.from, anyStep.to, ranges)) return true;
    }
  }
  return false;
}

function lockedRanges(state: EditorState): { from: number; to: number }[] {
  const keys = useAILockStore.getState().lockedKeys();
  if (keys.size === 0) return [];
  const out: { from: number; to: number }[] = [];
  state.doc.forEach((node, offset) => {
    const rid = node.attrs?.id as string | undefined;
    const gid = node.attrs?.semanticGroupId as string | null | undefined;
    if ((rid && keys.has(rid)) || (gid && keys.has(gid))) {
      out.push({ from: offset, to: offset + node.nodeSize });
    }
  });
  return out;
}

export const aiLockPlugin = new Plugin({
  filterTransaction(tr, state) {
    if (!tr.docChanged) return true;
    if (tr.getMeta('allowLockedEdit')) return true;
    return !transactionTouchesRanges(tr, lockedRanges(state));
  },
});
