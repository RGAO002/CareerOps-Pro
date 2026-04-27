// frontend/src/components/resume/v2/atoms/EntryAtomRenderer.tsx
'use client';
import { useEffect, useState } from 'react';
import { PlainTextField } from '../fields/PlainTextField';
import { BulletField } from '../fields/BulletField';
import { BulletInteractionOverlay } from './BulletInteractionOverlay';
import { getHoverState, subscribeHover } from '../interaction/hover-state';
import {
  getDragPreview,
  subscribeDragPreview,
  type DragPreview,
} from '../interaction/drag-preview-state';
import { atomFocusManager } from '../interaction/AtomFocusManager';
import {
  isMetaForced,
  subscribeMetaVisibility,
  unforceShowMeta,
} from '../interaction/meta-visibility';
import {
  isTitleForced,
  subscribeTitleVisibility,
  unforceShowTitle,
} from '../interaction/title-visibility';
import { useResumeStore } from '../store/useResumeStore';
import { setEntryHiddenField } from '../store/actions/setEntryHiddenField';
import { makeOrigin } from '../store/source-of-truth';
import type { Align } from '../fields/single-line-adapter';
import type { BlockId, CanvasMode, EntryBlock } from '../types';

interface Props {
  entry: EntryBlock;
  mode: CanvasMode;
}

const BULLET_SHIFT_GAP = 6;

export function EntryAtomRenderer({ entry, mode }: Props) {
  // Bullet hover via global Y-coord matcher (InteractionLayer publishes).
  // The overlay sits in the gutter at left:-28 with pointerEvents:'none'
  // until hovered → we can't rely on the <li>'s own onMouseEnter alone
  // (cursor moving from text into gutter passes through to underlying
  // canvas, and the <li> mouseleave fires before the overlay can grab focus).
  const [hoveredBulletId, setHoveredBulletId] = useState<BlockId | null>(getHoverState().bulletId);
  useEffect(() => subscribeHover(s => setHoveredBulletId(s.bulletId)), []);

  // Bullet drag preview: shift sibling bullets to make room (Notion-style).
  const [preview, setPreview] = useState<DragPreview>(getDragPreview());
  useEffect(() => subscribeDragPreview(setPreview), []);

  const bulletPreview = preview && preview.kind === 'bullet' && preview.dstEntryId === entry.id
    ? preview : null;
  const draggedBulletId = preview?.kind === 'bullet' ? preview.draggedBulletId : null;

  function bulletShift(bulletIdx: number, bulletId: BlockId): number {
    if (!bulletPreview) return 0;
    if (bulletPreview.draggedBulletId === bulletId) return 0;
    // Find src index within THIS entry (only valid if drag originated here)
    const srcIdx = bulletPreview.srcEntryId === entry.id
      ? entry.bullets.findIndex(b => b.id === bulletPreview.draggedBulletId)
      : -1;
    const dst = bulletPreview.dstBulletIndex;
    const H = bulletPreview.draggedHeight + BULLET_SHIFT_GAP;
    if (srcIdx < 0) {
      // Bullet from another entry → just open a slot at dst, shift bullets ≥ dst down
      return bulletIdx >= dst ? H : 0;
    }
    // Same-entry move: same Notion math as atom level
    if (srcIdx < dst) {
      if (bulletIdx > srcIdx && bulletIdx < dst) return -H;
    } else if (srcIdx > dst) {
      if (bulletIdx >= dst && bulletIdx < srcIdx) return H;
    }
    return 0;
  }

  const titleAlign = useResumeStore(
    s => s.resume?.alignments?.[`entry.title:${entry.id}`],
  ) as Align | undefined;
  const metaAlign = useResumeStore(
    s => s.resume?.alignments?.[`entry.meta:${entry.id}`],
  ) as Align | undefined;

  // Visibility model for entry.title / entry.meta:
  //  - DEFAULT: render — even when empty — so the placeholder ("Title (e.g. …)")
  //    acts as template guidance. Users see what could go there.
  //  - HIDE: only when the user has explicitly hidden the row by pressing
  //    Backspace at the start of an empty title/meta. That hide is persisted
  //    on EntryBlock.hiddenFields so it survives reload.
  //  - REVEAL: Tab from the previous field force-shows a hidden row via the
  //    title-/meta-visibility pub/sub (covers the brief window between
  //    forceShowX() and the new editor receiving focus). Focus inside also
  //    keeps it shown.
  //  - AUTO-UNHIDE on edit: if a hidden field gets non-empty content and the
  //    user blurs, we clear hiddenFields automatically so the persisted state
  //    matches what's now visible.
  //  - On blur with empty + hidden, we drop the transient force-show flag and
  //    leave hiddenFields alone — the row returns to hidden on the next render.
  const titleHidden = entry.hiddenFields?.includes('title') ?? false;
  const metaHidden = entry.hiddenFields?.includes('meta') ?? false;

  const [metaForced, setMetaForced] = useState<boolean>(() => isMetaForced(entry.id));
  useEffect(() => {
    return subscribeMetaVisibility((id, forced) => {
      if (id === entry.id) setMetaForced(forced);
    });
  }, [entry.id]);

  const [metaFocused, setMetaFocused] = useState(false);
  useEffect(() => {
    return atomFocusManager.subscribe(() => {
      const el = document.activeElement as HTMLElement | null;
      const inMeta = !!el?.closest?.(`[data-field-key="entry.meta:${entry.id}"]`);
      setMetaFocused(inMeta);
    });
  }, [entry.id]);

  const showMeta = !metaHidden || metaForced || metaFocused;

  // Title mirrors meta. CAVEAT: the entry's drag handle (⋮⋮) is currently
  // anchored to the title row. When the title is hidden, the handle floats
  // over whatever the next visible row is (meta or first bullet). Phase 2
  // will re-anchor the handle to the entry as a whole.
  const [titleForced, setTitleForced] = useState<boolean>(() => isTitleForced(entry.id));
  useEffect(() => {
    return subscribeTitleVisibility((id, forced) => {
      if (id === entry.id) setTitleForced(forced);
    });
  }, [entry.id]);

  const [titleFocused, setTitleFocused] = useState(false);
  useEffect(() => {
    return atomFocusManager.subscribe(() => {
      const el = document.activeElement as HTMLElement | null;
      const inTitle = !!el?.closest?.(`[data-field-key="entry.title:${entry.id}"]`);
      setTitleFocused(inTitle);
    });
  }, [entry.id]);

  const showTitle = !titleHidden || titleForced || titleFocused;

  return (
    <div className="resume-entry" data-block-id={entry.id} data-atom-content>
      {showTitle && (
        <PlainTextField
          fieldKey={{ kind: 'entry.title', id: entry.id }}
          value={entry.title}
          align={titleAlign}
          mode={mode}
          className="resume-entry-title"
          placeholder="Title (e.g. Software Engineer @ Acme)"
          onBlur={(ed) => {
            // When the row blurs:
            //  - non-empty: ensure hiddenFields no longer contains 'title'.
            //    A user who started typing into a previously-hidden row clearly
            //    wants it shown — auto-unhide so reload stays consistent.
            //  - empty + force-shown: drop the transient force-show so the
            //    row returns to its hidden state (or stays visible if not
            //    hidden at all).
            const empty = ed.state.doc.textContent.trim() === '';
            if (!empty) {
              setEntryHiddenField(entry.id, 'title', false, makeOrigin('tiptap'));
            }
            unforceShowTitle(entry.id);
          }}
        />
      )}
      {showMeta && (
        <PlainTextField
          fieldKey={{ kind: 'entry.meta', id: entry.id }}
          value={entry.meta}
          align={metaAlign}
          mode={mode}
          className="resume-entry-meta"
          placeholder="Date · Location"
          onBlur={(ed) => {
            // Same auto-unhide / drop-force logic as title above.
            const empty = ed.state.doc.textContent.trim() === '';
            if (!empty) {
              setEntryHiddenField(entry.id, 'meta', false, makeOrigin('tiptap'));
            }
            unforceShowMeta(entry.id);
          }}
        />
      )}
      <ul className="resume-entry-bullets">
        {entry.bullets.map((b, idx) => {
          const dragged = draggedBulletId === b.id;
          const shift = bulletShift(idx, b.id);
          return (
            <li
              key={b.id}
              className="resume-bullet"
              data-block-id={b.id}
              data-kind={b.kind ?? 'bullet'}
              style={{
                position: 'relative',
                transform: `translateY(${shift}px)`,
                transition: 'transform 0.18s ease-out, opacity 0.12s ease-out',
                opacity: dragged ? 0 : 1,
                visibility: dragged ? 'hidden' : 'visible',
                willChange: preview ? 'transform, opacity' : undefined,
              }}
            >
              {mode === 'edit' && (
                <BulletInteractionOverlay
                  bulletId={b.id}
                  entryId={entry.id}
                  hovered={hoveredBulletId === b.id}
                />
              )}
              <BulletField bulletId={b.id} entryId={entry.id} content={b.content} mode={mode} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
