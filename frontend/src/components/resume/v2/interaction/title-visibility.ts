// frontend/src/components/resume/v2/interaction/title-visibility.ts
//
// Tiny pub/sub for "force-show entry.title" state. EntryAtomRenderer hides the
// title editor when the field is empty (so blank rows don't visually orphan).
// Tab from section.heading or a previous entry's last bullet needs to bring
// the title back even when empty — we record the entry id here, EntryAtomRenderer
// subscribes and re-renders, and the title TipTap instance mounts in time for
// AtomFocusManager.focusFieldWhenReady to land focus there.
//
// On title blur with empty content, the entry's id is removed so the title row
// hides again on the next render.
//
// Mirrors meta-visibility.ts.
import type { BlockId } from '../types';

type Listener = (entryId: BlockId, forced: boolean) => void;
const listeners = new Set<Listener>();
const forced = new Set<BlockId>();

export function forceShowTitle(entryId: BlockId): void {
  forced.add(entryId);
  for (const l of listeners) l(entryId, true);
}

export function unforceShowTitle(entryId: BlockId): void {
  if (!forced.has(entryId)) return;
  forced.delete(entryId);
  for (const l of listeners) l(entryId, false);
}

export function isTitleForced(entryId: BlockId): boolean {
  return forced.has(entryId);
}

export function subscribeTitleVisibility(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
