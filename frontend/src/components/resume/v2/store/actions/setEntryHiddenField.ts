// frontend/src/components/resume/v2/store/actions/setEntryHiddenField.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, EntryBlock, UpdateOrigin } from '../../types';

/**
 * Add or remove `field` (entry.title / entry.meta) from an entry's
 * `hiddenFields` array — the user-controlled hide state for that single-line
 * row. When the array would become empty we drop the property entirely so the
 * serialized JSON stays minimal (matches the schema's "default ≡ undefined").
 *
 * Undoable. No-ops when:
 *  - the entry doesn't exist
 *  - the requested state already matches (avoids a wasted undo entry)
 */
export function setEntryHiddenField(
  entryId: BlockId,
  field: 'title' | 'meta',
  hidden: boolean,
  // origin is part of the public action surface for symmetry with the rest of
  // the store, even though we don't currently route it anywhere — _pushUndo
  // captures the snapshot regardless.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _origin: UpdateOrigin,
): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;

  // Find first to no-op cleanly when nothing changes.
  let entry: EntryBlock | undefined;
  for (const s of r.sections) {
    entry = s.entries.find(e => e.id === entryId);
    if (entry) break;
  }
  if (!entry) return;

  const current = entry.hiddenFields ?? [];
  const isHidden = current.includes(field);
  if (isHidden === hidden) return;

  _pushUndo('setEntryHiddenField');

  const nextHidden: Array<'title' | 'meta'> = hidden
    ? [...current, field]
    : current.filter(f => f !== field);

  const next = r.sections.map(s => ({
    ...s,
    entries: s.entries.map(e => {
      if (e.id !== entryId) return e;
      // Drop the field entirely when empty — keeps JSON small and matches
      // the "undefined ≡ no hidden fields" schema convention.
      if (nextHidden.length === 0) {
        const { hiddenFields: _drop, ...rest } = e;
        return rest;
      }
      return { ...e, hiddenFields: nextHidden };
    }),
  }));
  useResumeStore.setState({
    resume: {
      ...r,
      sections: next,
      metadata: { ...r.metadata, updated_at: new Date().toISOString() },
    },
  });
}
