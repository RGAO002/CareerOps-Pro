// frontend/src/components/resume/v2/atoms/EntryAtomRenderer.tsx
'use client';
import { useEffect, useState } from 'react';
import { PlainTextField } from '../fields/PlainTextField';
import { BulletField } from '../fields/BulletField';
import { BulletInteractionOverlay } from './BulletInteractionOverlay';
import { EntryRowInteractionOverlay } from './EntryRowInteractionOverlay';
import { getHoverState, subscribeHover } from '../interaction/hover-state';
import {
  getDragPreview,
  subscribeDragPreview,
  getRecentlyDroppedId,
  subscribeRecentlyDropped,
  type DragPreview,
} from '../interaction/drag-preview-state';
import { useResumeStore } from '../store/useResumeStore';
import type { Align } from '../fields/single-line-adapter';
import type { BlockId, CanvasMode, EntryBlock, SectionRole } from '../types';

interface Props {
  entry: EntryBlock;
  /** Owning section's role — drives role-aware placeholder text + whether to
   *  render meta at all. Skills/summary entries don't need "Date · Location". */
  sectionRole: SectionRole;
  mode: CanvasMode;
}

/** Placeholder text + visibility per section role.
 *
 * - `title`: shown when entry.title is empty + we're in edit mode.
 *            null = don't render title row at all.
 * - `meta`:  same, but for entry.meta. Skills / summary skip meta entirely
 *            because the data type doesn't have a date · location semantic.
 *
 * For 'custom', stay generic — we don't know what the user wants. */
function placeholdersFor(role: SectionRole): { title: string | null; meta: string | null } {
  switch (role) {
    case 'summary':       return { title: null, meta: null };
    case 'skills':        return { title: 'Skill category (e.g. Languages)', meta: null };
    case 'experience':    return { title: 'Title @ Company', meta: 'Date · Location' };
    case 'projects':      return { title: 'Project name', meta: 'Date · Tech / link' };
    case 'education':     return { title: 'Degree, Major', meta: 'School · Year' };
    case 'awards':        return { title: 'Award name', meta: 'Date · Issuer' };
    case 'publications':  return { title: 'Publication title', meta: 'Venue · Year' };
    case 'custom':        return { title: 'Title', meta: 'Subtitle' };
  }
}

const BULLET_SHIFT_GAP = 6;

export function EntryAtomRenderer({ entry, sectionRole, mode }: Props) {
  const ph = placeholdersFor(sectionRole);
  // Bullet hover via global Y-coord matcher (InteractionLayer publishes).
  // Same publisher also tracks `atomFieldKey` for the title/meta row handles.
  const initial = getHoverState();
  const [hoveredBulletId, setHoveredBulletId] = useState<BlockId | null>(initial.bulletId);
  const [hoveredFieldKey, setHoveredFieldKey] = useState<string | null>(initial.atomFieldKey);
  useEffect(() => subscribeHover((s) => {
    setHoveredBulletId(s.bulletId);
    setHoveredFieldKey(s.atomFieldKey);
  }), []);

  // Bullet drag preview: shift sibling bullets to make room (Notion-style).
  const [preview, setPreview] = useState<DragPreview>(getDragPreview());
  useEffect(() => subscribeDragPreview(setPreview), []);
  const [recentlyDroppedId, setRecentlyDroppedIdState] = useState<BlockId | null>(
    getRecentlyDroppedId(),
  );
  useEffect(() => subscribeRecentlyDropped(setRecentlyDroppedIdState), []);

  const bulletPreview = preview && preview.kind === 'bullet' && preview.dstEntryId === entry.id
    ? preview : null;
  const draggedBulletId = preview?.kind === 'bullet' ? preview.draggedBulletId : null;
  const recentlyDroppedInEntry = recentlyDroppedId !== null
    && entry.bullets.some(b => b.id === recentlyDroppedId);

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

  // Unified row model:
  //  - EDIT: always render entry.title and entry.meta. Empty rows show a
  //    placeholder (template guidance) and a hover-revealed ⋮⋮ drag handle,
  //    so the user sees what could go there and can rearrange the entry from
  //    any row.
  //  - EXPORT: skip rendering empty title / meta. An empty row in the PDF is
  //    pure padding and would break visual rhythm.
  //
  // Caveat: editor preview height ≠ PDF height when these rows are empty
  // (edit shows the placeholder line, export omits the row entirely).
  // Acceptable trade — accurate on-page editing of guidance > exact preview.
  const titleEmpty = (entry.title?.trim().length ?? 0) === 0;
  const metaEmpty = (entry.meta?.trim().length ?? 0) === 0;
  // Hide rows that don't make sense for this section role even in edit mode.
  // E.g., Skills entries shouldn't show a "Date · Location" placeholder, and
  // Summary entries shouldn't show "Title (e.g. Software Engineer @ Acme)".
  const titleApplies = ph.title !== null;
  const metaApplies = ph.meta !== null;
  const renderTitle = (mode === 'edit' && titleApplies) || (!titleEmpty);
  const renderMeta = (mode === 'edit' && metaApplies) || (!metaEmpty);

  const titleRowKey = `entry.title:${entry.id}`;
  const metaRowKey = `entry.meta:${entry.id}`;

  return (
    <div className="resume-entry" data-block-id={entry.id} data-atom-content>
      {renderTitle && (
        <div
          style={{ position: 'relative' }}
          data-row-field-key={mode === 'edit' ? titleRowKey : undefined}
        >
          {mode === 'edit' && (
            <EntryRowInteractionOverlay
              entryId={entry.id}
              field="title"
              hovered={hoveredFieldKey === titleRowKey}
            />
          )}
          <PlainTextField
            fieldKey={{ kind: 'entry.title', id: entry.id }}
            value={entry.title}
            align={titleAlign}
            mode={mode}
            className="resume-entry-title"
            placeholder={ph.title ?? ''}
          />
        </div>
      )}
      {renderMeta && (
        <div
          style={{ position: 'relative' }}
          data-row-field-key={mode === 'edit' ? metaRowKey : undefined}
        >
          {mode === 'edit' && (
            <EntryRowInteractionOverlay
              entryId={entry.id}
              field="meta"
              hovered={hoveredFieldKey === metaRowKey}
            />
          )}
          <PlainTextField
            fieldKey={{ kind: 'entry.meta', id: entry.id }}
            value={entry.meta}
            align={metaAlign}
            mode={mode}
            className="resume-entry-meta"
            placeholder={ph.meta ?? ''}
          />
        </div>
      )}
      <ul className="resume-entry-bullets">
        {entry.bullets.map((b, idx) => {
          const dragged = draggedBulletId === b.id;
          const shift = bulletShift(idx, b.id);
          const justDropped = recentlyDroppedId === b.id;
          const transition = recentlyDroppedInEntry
            ? 'none'
            : 'transform 0.18s ease-out, opacity 0.12s ease-out';
          return (
            <li
              key={b.id}
              className="resume-bullet"
              data-block-id={b.id}
              data-kind={b.kind ?? 'bullet'}
              style={{
                position: 'relative',
                transform: `translateY(${shift}px)`,
                transition,
                animation: justDropped ? 'bullet-settle 0.18s ease-out' : undefined,
                opacity: dragged ? 0 : 1,
                visibility: dragged ? 'hidden' : 'visible',
                willChange: (preview || justDropped) ? 'transform, opacity' : undefined,
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
