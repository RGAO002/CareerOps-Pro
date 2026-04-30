// frontend/src/components/resume/v2/store/actions/moveSection.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import { useAILockStore } from '@/stores/aiLock';
import type { BlockId, UpdateOrigin } from '../../types';

export function moveSection(
  sectionId: BlockId,
  beforeSectionId: BlockId | null,
  origin: UpdateOrigin,
): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;
  if (useAILockStore.getState().isLocked(sectionId)) {
    console.warn(`[ai-lock] suppressed moveSection(${sectionId}) — locked`);
    return;
  }
  const srcIdx = r.sections.findIndex(s => s.id === sectionId);
  if (srcIdx < 0) return;

  // No-op detection: cursor stays near the source. Without these guards the
  // splice/findIndex math yields a "phantom move to end" because the source
  // is filtered out before findIndex runs.
  //   case 1: drop on self ("insert before me") → unchanged
  //   case 2: drop "at end" while already last
  //   case 3: drop "before next sibling" (semantically same position)
  if (beforeSectionId === sectionId) return;
  const isLast = srcIdx === r.sections.length - 1;
  if (beforeSectionId === null && isLast) return;
  const next = r.sections[srcIdx + 1];
  if (next && beforeSectionId === next.id) return;

  const section = r.sections[srcIdx];
  _pushUndo('moveSection');
  const remaining = r.sections.filter(s => s.id !== sectionId);
  const insertAt = beforeSectionId === null
    ? remaining.length
    : remaining.findIndex(s => s.id === beforeSectionId);
  const out = [...remaining];
  out.splice(insertAt < 0 ? remaining.length : insertAt, 0, section);
  useResumeStore.setState({
    resume: { ...r, sections: out, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
