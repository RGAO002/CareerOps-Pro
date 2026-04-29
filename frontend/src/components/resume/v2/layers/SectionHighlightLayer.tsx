// frontend/src/components/resume/v2/layers/SectionHighlightLayer.tsx
//
// Renders a soft background behind each section that is currently
// hovered (light tint) or selected via 6-dot click (deeper tint with a
// 2px terracotta strip on the left).
//
// Per design_handoff_ai_sidebar/README.md (.r-section / .r-section.active).
//
// Implementation notes:
//   - Atoms are absolutely positioned by LayoutEngine. We compute each
//     section's bbox by union-ing the rects of its constituent atoms
//     (section-heading + entry atoms whose sourceBlockId is one of the
//     section's entries).
//   - Rendered ABOVE the page background but BELOW the AtomContentLayer.
//     The single highlight div uses pointer-events: none — interaction
//     stays with InteractionLayer above.
//   - Highlight extends 24px into the left/right gutters (matches the
//     design's `margin: 0 -56px; padding: ...` aesthetic, scaled smaller
//     for a printable-resume context).

'use client';
import { useResumeStore } from '../store/useResumeStore';
import { useSectionHighlight } from '@/stores/sectionHighlight';
import type { LayoutAtom, AtomLayout, SectionBlock } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';
import { getAtomAbsoluteCoord } from '../layout/coords';

// Stable empty fallback so the zustand selector returns the same reference
// when there's no resume — avoids "getSnapshot should be cached" infinite loop.
const EMPTY_SECTIONS: SectionBlock[] = [];

interface Props {
  atoms: LayoutAtom[];
  layouts: Map<string, AtomLayout>;
  template: NormalizedTemplate;
}

const GUTTER = 24;

export function SectionHighlightLayer({ atoms, layouts, template }: Props) {
  const resume = useResumeStore((s) => s.resume);
  const sections = resume?.sections ?? EMPTY_SECTIONS;
  const hoveredId = useSectionHighlight((s) => s.hoveredSectionId);
  const selectedId = useSectionHighlight((s) => s.selectedSectionId);

  return (
    <div
      data-edit-only
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    >
      {sections.map((section) => {
        const isHovered = hoveredId === section.id;
        const isSelected = selectedId === section.id;
        if (!isHovered && !isSelected) return null;

        // Collect atoms belonging to this section: section-heading + entries.
        const childIds = new Set<string>([section.id, ...section.entries.map((e) => e.id)]);
        const sectionAtoms = atoms.filter((a) => childIds.has(a.sourceBlockId));
        if (sectionAtoms.length === 0) return null;

        // Union bbox over those atoms.
        let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
        for (const a of sectionAtoms) {
          const layout = layouts.get(a.id);
          if (!layout) continue;
          const c = getAtomAbsoluteCoord(layout, 'edit', template);
          top = Math.min(top, c.top);
          left = Math.min(left, c.left);
          right = Math.max(right, c.left + layout.width);
          bottom = Math.max(bottom, c.top + layout.height);
        }
        if (!isFinite(top)) return null;

        // Selected wins visually if both true.
        const bg = isSelected ? 'oklch(0.96 0.03 45)' : 'oklch(0.97 0.01 60)';

        return (
          <div
            key={section.id}
            style={{
              position: 'absolute',
              top: top - 6,
              left: left - GUTTER,
              width: right - left + GUTTER * 2,
              height: bottom - top + 12,
              background: bg,
              borderRadius: 6,
              transition: 'background 0.18s ease-out',
              pointerEvents: 'none',
            }}
          >
            {isSelected && (
              <i
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 6,
                  bottom: 6,
                  width: 2,
                  background: 'oklch(0.62 0.13 38)', // --terracotta from design tokens
                  borderRadius: '0 2px 2px 0',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
