// frontend/src/components/resume/v2/layers/SectionHighlightLayer.tsx
//
// Renders block-level highlight backgrounds in the resume editor.
//
// Two layers of meaning (semantic, not decorative):
//   1. HOVER (light tint) — preview of "if you click the 6-dot here, this
//      block would be selected". Granularity is the same as the block whose
//      6-dot is currently visible in the gutter (section / entry / bullet).
//   2. SELECTED (deeper tint + 2px terracotta strip on the left) — committed
//      operation focus from clicking a 6-dot. Source of truth is the v2
//      selectionManager (so keyboard nav and 6-dot clicks share the same
//      state). Replaces the old blue selection outline.
//
// Bbox sourcing:
//   - section: atoms-projection — union of section-heading atom + each entry
//     atom belonging to this section. Re-renders when `layouts` prop ticks.
//   - entry:   single entry atom's layout.
//   - bullet:  DOM rect of the `<li data-block-id="${bulletId}">` (bullets
//     aren't atoms — they live inside entry atoms). Recomputed on every
//     re-render; `outlineTick` from InteractionLayer is what currently drives
//     reflows for blue outlines, and we piggy-back on store subscriptions
//     here.

'use client';
import { useEffect, useState } from 'react';
import { useResumeStore } from '../store/useResumeStore';
import { useBlockHover, type HoveredBlock } from '@/stores/sectionHighlight';
import { selectionManager } from '../interaction/SelectionManager';
import type { LayoutAtom, AtomLayout, BlockId, SectionBlock } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';
import { getAtomAbsoluteCoord } from '../layout/coords';

interface Props {
  atoms: LayoutAtom[];
  layouts: Map<string, AtomLayout>;
  template: NormalizedTemplate;
}

const EMPTY_SECTIONS: SectionBlock[] = [];
const HOVER_BG = 'oklch(0.97 0.01 60)';            // light warm
const SELECT_BG = 'oklch(0.96 0.03 45)';           // deeper warm
const TERRACOTTA = 'oklch(0.62 0.13 38)';

interface Bbox { top: number; left: number; width: number; height: number }

function bboxForBlock(
  kind: 'section' | 'entry' | 'bullet',
  id: BlockId,
  atoms: LayoutAtom[],
  layouts: Map<string, AtomLayout>,
  template: NormalizedTemplate,
): Bbox | null {
  if (kind === 'section') {
    const r = useResumeStore.getState().resume;
    if (!r) return null;
    const section = r.sections.find(s => s.id === id);
    if (!section) return null;
    const childIds = new Set<string>([section.id, ...section.entries.map(e => e.id)]);
    let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    for (const a of atoms) {
      if (!childIds.has(a.sourceBlockId)) continue;
      const layout = layouts.get(a.id);
      if (!layout) continue;
      const c = getAtomAbsoluteCoord(layout, 'edit', template);
      top = Math.min(top, c.top);
      left = Math.min(left, c.left);
      right = Math.max(right, c.left + layout.width);
      bottom = Math.max(bottom, c.top + layout.height);
    }
    if (!isFinite(top)) return null;
    return { top, left, width: right - left, height: bottom - top };
  }

  if (kind === 'entry') {
    const atom = atoms.find(a => a.kind === 'entry' && a.sourceBlockId === id);
    if (!atom) return null;
    const layout = layouts.get(atom.id);
    if (!layout) return null;
    const c = getAtomAbsoluteCoord(layout, 'edit', template);
    return { top: c.top, left: c.left, width: layout.width, height: layout.height };
  }

  // bullet — DOM lookup
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
  const root = document.querySelector('[data-canvas-root]') as HTMLElement | null;
  if (!el || !root) return null;
  const rect = el.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return {
    top: rect.top - rootRect.top,
    left: rect.left - rootRect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function SectionHighlightLayer({ atoms, layouts, template }: Props) {
  const resume = useResumeStore((s) => s.resume);
  const sections = resume?.sections ?? EMPTY_SECTIONS;
  const hovered = useBlockHover((s) => s.hovered);

  // Subscribe to selectionManager: bump a tick to force re-render when selection
  // changes. We DON'T capture the selected id in a state closure (which had a
  // stale-`sections`-closure bug at first render). Instead, compute `selected`
  // at render time below from `selectionManager.getBlocks()` + the live
  // `sections` array.
  const [selectionTick, setSelectionTick] = useState(0);
  useEffect(() => selectionManager.subscribe(() => setSelectionTick(t => t + 1)), []);

  // Force re-render on layouts change (so bullet DOM-based bbox refreshes).
  const [, setLayoutTick] = useState(0);
  useEffect(() => { setLayoutTick(t => t + 1); }, [layouts]);

  // Live-compute selected at render time (uses the latest sections + selectionManager).
  // Reference `selectionTick` so the linter doesn't strip the dep that drives this.
  void selectionTick;
  const selectedIds = selectionManager.getBlocks();
  let selected: HoveredBlock | null = null;
  if (selectedIds.length === 1) {
    const id = selectedIds[0];
    const kind = inferKind(id, sections);
    if (kind) selected = { kind, id };
  }

  return (
    <div data-edit-only style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
      {hovered && (() => {
        // Don't paint hover if it's redundant with the selection.
        if (selected && selected.id === hovered.id) return null;
        const box = bboxForBlock(hovered.kind, hovered.id, atoms, layouts, template);
        if (!box) return null;
        return (
          <div
            style={{
              position: 'absolute',
              top: box.top - 4,
              left: box.left - 8,
              width: box.width + 16,
              height: box.height + 8,
              background: HOVER_BG,
              borderRadius: 6,
              transition: 'background 0.18s ease-out',
              pointerEvents: 'none',
            }}
          />
        );
      })()}

      {selected && (() => {
        const box = bboxForBlock(selected.kind, selected.id, atoms, layouts, template);
        if (!box) return null;
        return (
          <div
            style={{
              position: 'absolute',
              top: box.top - 4,
              left: box.left - 8,
              width: box.width + 16,
              height: box.height + 8,
              background: SELECT_BG,
              borderRadius: 6,
              transition: 'background 0.18s ease-out',
              pointerEvents: 'none',
            }}
          >
            <i
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                top: 4,
                bottom: 4,
                width: 2,
                background: TERRACOTTA,
                borderRadius: '0 2px 2px 0',
              }}
            />
          </div>
        );
      })()}
    </div>
  );
}

function inferKind(id: BlockId, sections: SectionBlock[]): 'section' | 'entry' | 'bullet' | null {
  for (const s of sections) {
    if (s.id === id) return 'section';
    for (const e of s.entries) {
      if (e.id === id) return 'entry';
      for (const b of e.bullets) if (b.id === id) return 'bullet';
    }
  }
  return null;
}
