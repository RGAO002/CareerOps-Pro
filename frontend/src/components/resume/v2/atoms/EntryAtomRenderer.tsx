// frontend/src/components/resume/v2/atoms/EntryAtomRenderer.tsx
'use client';
import { useState } from 'react';
import { PlainTextField } from '../fields/PlainTextField';
import { BulletField } from '../fields/BulletField';
import { BulletInteractionOverlay } from './BulletInteractionOverlay';
import type { BlockId, CanvasMode, EntryBlock } from '../types';

interface Props {
  entry: EntryBlock;
  mode: CanvasMode;
}

export function EntryAtomRenderer({ entry, mode }: Props) {
  // Track which bullet's <li> is currently hovered. The overlay sits in the
  // left gutter (left:-28) so its own mouse events alone can't tell us when
  // the user is over the actual bullet text — we need to listen on <li>.
  const [hoveredBulletId, setHoveredBulletId] = useState<BlockId | null>(null);
  return (
    <div className="resume-entry" data-block-id={entry.id} data-atom-content>
      <PlainTextField
        fieldKey={{ kind: 'entry.title', id: entry.id }}
        value={entry.title}
        mode={mode}
        className="resume-entry-title"
        placeholder="Title (e.g. Software Engineer @ Acme)"
      />
      <PlainTextField
        fieldKey={{ kind: 'entry.meta', id: entry.id }}
        value={entry.meta}
        mode={mode}
        className="resume-entry-meta"
        placeholder="Date · Location"
      />
      <ul className="resume-entry-bullets">
        {entry.bullets.map(b => (
          <li
            key={b.id}
            className="resume-bullet"
            data-block-id={b.id}
            style={{ position: 'relative' }}
            onMouseEnter={() => setHoveredBulletId(b.id)}
            onMouseLeave={() => setHoveredBulletId(prev => (prev === b.id ? null : prev))}
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
        ))}
      </ul>
    </div>
  );
}
