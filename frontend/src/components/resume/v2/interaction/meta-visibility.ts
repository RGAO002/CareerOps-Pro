// frontend/src/components/resume/v2/interaction/meta-visibility.ts
//
// Tiny pub/sub for "force-show entry.meta" state. EntryAtomRenderer hides the
// meta editor when the field is empty (so blank rows don't visually orphan).
// Tab from entry.title needs to bring meta back even when empty — we record
// the entry id here, EntryAtomRenderer subscribes and re-renders, and the
// meta TipTap instance mounts in time for AtomFocusManager.focusFieldWhenReady
// to land focus there.
//
// On meta blur with empty content, the entry's id is removed so the meta row
// hides again on the next render.
import type { BlockId } from '../types';

type Listener = (entryId: BlockId, forced: boolean) => void;
const listeners = new Set<Listener>();
const forced = new Set<BlockId>();

export function forceShowMeta(entryId: BlockId): void {
  forced.add(entryId);
  for (const l of listeners) l(entryId, true);
}

export function unforceShowMeta(entryId: BlockId): void {
  if (!forced.has(entryId)) return;
  forced.delete(entryId);
  for (const l of listeners) l(entryId, false);
}

export function isMetaForced(entryId: BlockId): boolean {
  return forced.has(entryId);
}

export function subscribeMetaVisibility(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
