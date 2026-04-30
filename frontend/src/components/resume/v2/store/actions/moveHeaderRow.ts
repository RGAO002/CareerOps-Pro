// frontend/src/components/resume/v2/store/actions/moveHeaderRow.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import { useAILockStore } from '@/stores/aiLock';
import { effectiveHeaderRowOrder } from '../header-order';
import type { UpdateOrigin } from '../../types';

/**
 * Reorder header rows by writing `header.row_order`.
 *
 * `rowKey` is 'name' or 'contact:N' (matching the keys returned by
 * effectiveHeaderRowOrder). `insertAtIndex` is the destination index in the
 * post-removal order (matches DragController's header-row-slot semantics).
 *
 * No-ops when the resulting order equals the current effective order — keeps
 * the undo stack clean for accidental drags that land on the source slot.
 */
export function moveHeaderRow(
  rowKey: string,
  insertAtIndex: number,
  _origin: UpdateOrigin,
): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  // ★ AI lock guard: rowKey isn't a block id (it's "name" / "contact:N"), but
  // the header itself has an id — if AI is mutating the header, suppress.
  if (useAILockStore.getState().isLocked(r.header.id)) {
    console.warn(`[ai-lock] suppressed moveHeaderRow(${rowKey}) — header locked`);
    return;
  }
  const current = effectiveHeaderRowOrder(r.header);
  // The row must already exist in the effective order (otherwise this drag
  // can't have started — defensive guard).
  if (!current.includes(rowKey)) return;
  const filtered = current.filter((k) => k !== rowKey);
  const clampedIdx = Math.max(0, Math.min(insertAtIndex, filtered.length));
  const next = [...filtered];
  next.splice(clampedIdx, 0, rowKey);
  const same =
    current.length === next.length && current.every((k, i) => k === next[i]);
  if (same) return;
  _pushUndo('moveHeaderRow');
  useResumeStore.setState({
    resume: {
      ...r,
      header: { ...r.header, row_order: next },
      metadata: { ...r.metadata, updated_at: new Date().toISOString() },
    },
  });
}
