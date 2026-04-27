// frontend/src/components/resume/v2/atoms/EntryAtomRenderer.tsx
'use client';
import { PlainTextField } from '../fields/PlainTextField';
import { BulletField } from '../fields/BulletField';
import type { CanvasMode, EntryBlock } from '../types';

interface Props {
  entry: EntryBlock;
  mode: CanvasMode;
}

export function EntryAtomRenderer({ entry, mode }: Props) {
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
          <li key={b.id} className="resume-bullet" data-block-id={b.id}>
            <BulletField bulletId={b.id} entryId={entry.id} content={b.content} mode={mode} />
          </li>
        ))}
      </ul>
    </div>
  );
}
