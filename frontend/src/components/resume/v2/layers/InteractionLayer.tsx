// frontend/src/components/resume/v2/layers/InteractionLayer.tsx
'use client';
import { useEffect, useState } from 'react';
import { DragHandle } from '../interaction/DragHandle';
import { DropIndicator } from '../interaction/DropIndicator';
import { SlashMenu } from '../interaction/SlashMenu';
import { selectionManager } from '../interaction/SelectionManager';
import type { DropIndicatorPayload } from '../interaction/DragController';
import { setHoverState } from '../interaction/hover-state';
import { getAtomAbsoluteCoord } from '../layout/coords';
import { useResumeStore } from '../store/useResumeStore';
import type { LayoutAtom, AtomLayout, AtomId, SelectableBlock, BlockId } from '../types';
import type { NormalizedTemplate } from '../layout/normalize-template';
import { useAssistantStore } from '@/stores/assistant';
import { useBlockHover } from '@/stores/sectionHighlight';
import { AskAIPill } from '@/components/ai/assistant/AskAIPill';

interface Props {
  atoms: LayoutAtom[];
  layouts: Map<AtomId, AtomLayout>;
  template: NormalizedTemplate;
}

function selectableForAtom(atom: LayoutAtom): SelectableBlock | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  if (atom.kind === 'header') return null;            // header not draggable
  if (atom.kind === 'section-heading') return { kind: 'section', id: atom.sourceBlockId };
  // entry → find its section
  const section = r.sections.find(s => s.entries.some(e => e.id === atom.sourceBlockId));
  return section ? { kind: 'entry', id: atom.sourceBlockId, sectionId: section.id } : null;
}

/** Build a human-readable AI-scope label for a selected block. */
function labelForBlock(kind: 'section' | 'entry' | 'bullet', id: BlockId): string {
  const r = useResumeStore.getState().resume;
  if (!r) return id.slice(0, 8);
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
        if (e.bullets.some(b => b.id === id)) return `${s.heading} · bullet`;
      }
    }
  }
  return id.slice(0, 8);
}

/** Returns the section.id that an atom belongs to, or null if it's a header. */
function sectionForAtom(atom: LayoutAtom): BlockId | null {
  const r = useResumeStore.getState().resume;
  if (!r) return null;
  if (atom.kind === 'header') return null;
  if (atom.kind === 'section-heading') return atom.sourceBlockId;
  // entry atom — sourceBlockId is an entry id; find its section
  const section = r.sections.find(s => s.entries.some(e => e.id === atom.sourceBlockId));
  return section?.id ?? null;
}

function aiScopeForBlock(block: SelectableBlock): BlockId {
  return block.kind === 'header-row' ? block.headerId : block.id;
}

export function InteractionLayer({ atoms, layouts, template }: Props) {
  const [dropPayload, setDropPayload] = useState<DropIndicatorPayload>(null);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<BlockId>>(new Set());
  // Track the atom whose content the user is hovering — used to fade in the
  // ⋮⋮ drag handle and + / × buttons only for that row.
  const [hoveredAtomId, setHoveredAtomId] = useState<AtomId | null>(null);
  // Tick to force re-render of selection outlines when layouts shift (e.g.
  // typing causes atoms to grow / pagination to recompute).
  const [, setOutlineTick] = useState(0);

  useEffect(() => {
    return selectionManager.subscribe((s) => {
      setSelectedBlocks(new Set(s));
      setOutlineTick(t => t + 1);
    });
  }, []);

  // Outlines reposition when layouts change (atoms move during pagination).
  useEffect(() => {
    setOutlineTick(t => t + 1);
  }, [layouts]);

  // Selection: clicking anywhere selects the block at the cursor's
  // granularity (matches the hover preview's logic). Specifically:
  //   - Click a 6-dot handle → DragController.onUp handles fine-grained
  //     selection per the handle's block kind. Skip here; that path wins.
  //   - Click on a bullet (text or gutter beside it) → select that bullet.
  //   - Click on an entry's title / meta row → select that entry.
  //   - Click on a section-heading atom (the heading row only) → select
  //     that section.
  //   - Click in a gap or anywhere ELSE inside the canvas → no-op (don't
  //     change current selection — avoids surprising "click empty space
  //     selected the whole section" behavior).
  //   - Click outside the canvas → clear selection.
  //   - When AI sidebar is open, mirror the selected block into assistant
  //     scope so the next AI request targets it.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest('button[data-edit-only]')) return;

      const root = document.querySelector('[data-canvas-root]') as HTMLElement | null;
      if (!root || !t || !root.contains(t)) {
        selectionManager.clear();
        useBlockHover.getState().setHovered(null);
        return;
      }

      // Use the same finest-granularity resolution as hover preview.
      // bullet > entry-row > section-heading > nothing.
      let target: { kind: 'bullet' | 'entry' | 'section'; id: BlockId } | null = null;

      // Bullet hit-test: any rendered .resume-bullet whose Y-band contains the cursor.
      const bulletEls = document.querySelectorAll('li.resume-bullet[data-block-id]');
      for (const el of Array.from(bulletEls)) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          target = { kind: 'bullet', id: (el as HTMLElement).getAttribute('data-block-id') as BlockId };
          break;
        }
      }

      // Entry-row hit-test: title / meta wrapper Y-band.
      if (!target) {
        const rowEls = document.querySelectorAll('[data-row-field-key]');
        for (const el of Array.from(rowEls)) {
          const fk = (el as HTMLElement).getAttribute('data-row-field-key') ?? '';
          if (!fk.startsWith('entry.title') && !fk.startsWith('entry.meta')) continue;
          const r = (el as HTMLElement).getBoundingClientRect();
          if (e.clientY >= r.top && e.clientY <= r.bottom) {
            // entry.title:<entryId> / entry.meta:<entryId>
            const entryId = fk.split(':')[1] as BlockId;
            if (entryId) target = { kind: 'entry', id: entryId };
            break;
          }
        }
      }

      // Section-heading hit-test: the section-heading atom's Y-band.
      if (!target) {
        const rootRect = root.getBoundingClientRect();
        const cursorY = e.clientY - rootRect.top;
        for (const a of atoms) {
          if (a.kind !== 'section-heading') continue;
          const layout = layouts.get(a.id);
          if (!layout) continue;
          const top = getAtomAbsoluteCoord(layout, 'edit', template).top;
          const bottom = top + layout.height;
          if (cursorY >= top && cursorY <= bottom) {
            target = { kind: 'section', id: a.sourceBlockId };
            break;
          }
        }
      }

      if (!target) {
        // Empty zone inside canvas (gap between sections / between bullets
        // not on any row) → treat as a "click in empty space" and clear
        // selection, mirroring the click-outside-canvas behavior above.
        selectionManager.clear();
        useBlockHover.getState().setHovered(null);
        return;
      }

      selectionManager.selectSingleBlock(target.id);

      // Mirror to AI sidebar scope when sidebar is open.
      const aState = useAssistantStore.getState();
      if (aState.pose === 'sidebar') {
        const label = labelForBlock(target.kind, target.id);
        aState.openSidebarWithScope({ blockId: target.id, label });
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [atoms, layouts, template]);

  // Document-level hover detection: figure out which atom the cursor is over.
  // We use mousemove + Y-coordinate matching against atom layouts, NOT
  // event-target walking. Reason: the gutter (where ⋮⋮ lives) sits at
  // left:-28 with pointerEvents:'none' until hovered → before hover,
  // mouseover targets pass through to the page card / canvas root, which
  // has no [data-atom-id], which would clear the hover state right when
  // the user is reaching for the ⋮⋮.
  //
  // Y-coordinate matching ignores X entirely, so the ⋮⋮ in the gutter is
  // treated as "still on the same atom row" — hover stays put as the
  // cursor crosses from content into gutter.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.querySelector('[data-canvas-root]') as HTMLElement | null;
    if (!root) return;

    const onMove = (e: MouseEvent) => {
      const rootRect = root.getBoundingClientRect();
      const cursorY = e.clientY - rootRect.top;
      // Find the atom whose layout band contains cursorY.
      let atomHit: AtomId | null = null;
      for (const [id, layout] of layouts.entries()) {
        const top = getAtomAbsoluteCoord(layout, 'edit', template).top;
        const bottom = top + layout.height;
        if (cursorY >= top && cursorY <= bottom) { atomHit = id; break; }
      }
      setHoveredAtomId(prev => (prev === atomHit ? prev : atomHit));

      // Bullet hover: scan all rendered .resume-bullet <li>s for Y-band match.
      // Cheap because there are typically <50 bullets per resume.
      let bulletHit: BlockId | null = null;
      const bulletEls = document.querySelectorAll('li.resume-bullet[data-block-id]');
      for (const el of Array.from(bulletEls)) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          bulletHit = (el as HTMLElement).getAttribute('data-block-id') as BlockId;
          break;
        }
      }
      // Field-row hover (entry.title / entry.meta): scan rendered single-line
      // editor wrappers tagged with data-row-field-key for Y-band match. Same
      // cheap approach as bullets so the row-level ⋮⋮ handle behaves identically.
      let atomFieldKey: string | null = null;
      const rowEls = document.querySelectorAll('[data-row-field-key]');
      for (const el of Array.from(rowEls)) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          atomFieldKey = (el as HTMLElement).getAttribute('data-row-field-key');
          break;
        }
      }
      setHoverState({ atomId: atomHit, bulletId: bulletHit, atomFieldKey });

      // Drive the block-hover preview at the finest available granularity.
      //
      // Crucial: ONLY map to entry-level preview when the cursor is actually
      // on the entry's title or meta ROW (atomFieldKey set). When the cursor
      // is in the gap BETWEEN bullets within an entry, atomHit still equals
      // the entry atom, but treating that as "preview entry" causes a jarring
      // flash from "this small bullet" → "the whole entry/section" when the
      // mouse glides 1-2px between bullet rows. Solution: in those gap
      // moments, stick with the last hovered bullet (don't widen the preview).
      // The data-row-field-key values used by EntryAtomRenderer are
      // `entry.title:<entryId>` and `entry.meta:<entryId>` (suffixed with
      // the entry id) — NOT bare `'title'` / `'meta'`. Use prefix matching.
      const isEntryRow = !!atomFieldKey && (
        atomFieldKey.startsWith('entry.title') || atomFieldKey.startsWith('entry.meta')
      );
      let preview: { kind: 'section' | 'entry' | 'bullet'; id: BlockId } | null = null;
      if (bulletHit) {
        preview = { kind: 'bullet', id: bulletHit };
      } else if (isEntryRow) {
        // Cursor is on entry's title or meta row → preview the entry.
        if (atomHit) {
          const a = atoms.find(x => x.id === atomHit);
          if (a?.kind === 'entry') preview = { kind: 'entry', id: a.sourceBlockId };
        }
      } else if (atomHit) {
        const a = atoms.find(x => x.id === atomHit);
        if (a?.kind === 'section-heading') {
          preview = { kind: 'section', id: a.sourceBlockId };
        }
        // Note: atomHit may be an entry atom while we're in a bullet-gap
        // (no bulletHit, no entry row hit). In that case we DELIBERATELY
        // leave preview = null rather than jumping to entry-wide highlight.
      }
      const cur = useBlockHover.getState().hovered;
      const same = (cur && preview && cur.kind === preview.kind && cur.id === preview.id) ||
                   (cur === null && preview === null);
      if (!same) useBlockHover.getState().setHovered(preview);
    };
    const onLeaveRoot = () => {
      setHoveredAtomId(null);
      setHoverState({ atomId: null, bulletId: null, atomFieldKey: null });
      useBlockHover.getState().setHovered(null);
    };
    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeaveRoot);
    return () => {
      root.removeEventListener('mousemove', onMove);
      root.removeEventListener('mouseleave', onLeaveRoot);
    };
  }, [layouts, template]);

  return (
    <div
      className="interaction-layer"
      data-edit-only
      style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
    >
      {atoms.map((atom) => {
        const layout = layouts.get(atom.id);
        if (!layout) return null;
        const block = selectableForAtom(atom);
        if (!block) return null;
        const coord = getAtomAbsoluteCoord(layout, 'edit', template);
        const isHovered = hoveredAtomId === atom.id;
        return (
          <>
            <div
              key={atom.id}
              onMouseEnter={() => setHoveredAtomId(atom.id)}
              onMouseLeave={() => setHoveredAtomId(prev => (prev === atom.id ? null : prev))}
              style={{
                position: 'absolute',
                // The atom's first text line — pin handle at the TOP of the atom
                // (not centered to atom height; entry atoms span 60-80px including
                // bullets, and centering puts the handle below the title where the
                // user expects to click).
                top: coord.top,
                left: coord.left - 28,
                opacity: isHovered ? 1 : 0,
                transition: 'opacity 0.15s',
                pointerEvents: isHovered ? 'auto' : 'none',
              }}
            >
              <DragHandle
                block={block}
                onDropIndicator={setDropPayload}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  useAssistantStore.getState().openSidebarWithScope({ blockId: aiScopeForBlock(block), label: aiScopeForBlock(block).slice(0, 8) });
                }}
                // Selection (click-without-drag → selectSingleBlock) is
                // already handled inside DragController.onUp. We deliberately
                // do NOT pass onClick here — adding our own would race with
                // DragController and toggle the just-set selection right back
                // off. SectionHighlightLayer subscribes to selectionManager
                // and renders the result.
              />
            </div>
            {block.kind === 'section' && (
              <div
                key={`pill-${atom.id}`}
                onMouseEnter={() => setHoveredAtomId(atom.id)}
                onMouseLeave={() => setHoveredAtomId(prev => (prev === atom.id ? null : prev))}
                style={{
                  position: 'absolute',
                  top: coord.top - 4,
                  // Right edge of canvas content (assume 8.5in - margins is exposed via CSS var; fallback to template.page.contentWidthPx)
                  left: coord.left + (template.page.contentWidthPx ?? 720) - 70,
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.15s',
                  pointerEvents: isHovered ? 'auto' : 'none',
                }}
              >
                <AskAIPill blockId={block.id} label={`Section ${block.id.slice(0, 6)}`} />
              </div>
            )}
          </>
        );
      })}
      {/* Selection visual is now rendered by SectionHighlightLayer (background
          tint + 2px terracotta strip) — driven by the same selectionManager
          state. This used to be a 2px blue outline; replaced per design
          direction (highlight = "operation focus", not just "this is selected"). */}
      <DropIndicator target={dropPayload?.target ?? null} y={dropPayload?.y ?? 0} />
      <SlashMenu />
    </div>
  );
}
