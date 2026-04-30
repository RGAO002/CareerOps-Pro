// frontend/src/components/resume/v2/interaction/scopeLabel.ts
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import type { BlockId } from '@/components/resume/v2/types';

/**
 * Build a human-readable AI-scope label for a selected block.
 * Used by every entry point that calls `openSidebarWithScope` so the scope
 * pill shows e.g. "Experience · Linear Labs · bullet" instead of a raw id.
 *
 * Falls back to the block id's first 8 chars only if the resume isn't loaded
 * or the block can't be located (defensive — should not normally happen).
 */
export function labelForBlock(kind: 'section' | 'entry' | 'bullet' | 'header', id: BlockId): string {
  const r = useResumeStore.getState().resume;
  if (!r) return id.slice(0, 8);
  if (kind === 'header') return r.header?.name || 'Header';
  if (kind === 'section') {
    const s = r.sections.find(x => x.id === id);
    return s?.heading || id.slice(0, 8);
  }
  if (kind === 'entry') {
    for (const s of r.sections) {
      const e = s.entries.find(x => x.id === id);
      if (e) return `${s.heading} · ${e.title || 'entry'}`;
    }
  }
  if (kind === 'bullet') {
    for (const s of r.sections) {
      for (const e of s.entries) {
        const idx = e.bullets.findIndex(b => b.id === id);
        if (idx >= 0) {
          // 1-based bullet number within its owning entry. Includes the entry
          // title for disambiguation when a section has multiple entries
          // (e.g. "Experience · Linear Labs · bullet 3"). Falls back to just
          // the section if entry title is empty.
          const entryLabel = e.title?.trim() ? ` · ${e.title}` : '';
          return `${s.heading}${entryLabel} · bullet ${idx + 1}`;
        }
      }
    }
  }
  return id.slice(0, 8);
}
