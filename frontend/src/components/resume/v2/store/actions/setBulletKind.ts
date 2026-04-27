// frontend/src/components/resume/v2/store/actions/setBulletKind.ts
import { useResumeStore, _pushUndo } from '../useResumeStore';
import type { BlockId, UpdateOrigin } from '../../types';

/**
 * Flip a bullet's `kind` between 'bullet' and 'plain'. Used by the
 * Notion-style outdent path (Backspace on an empty 'bullet' kind row demotes
 * it to 'plain' before a second Backspace deletes the row).
 *
 * To keep serialized JSON minimal and back-compat, we OMIT the field when
 * kind === 'bullet' (the default) and only persist it when kind === 'plain'.
 */
export function setBulletKind(
  bulletId: BlockId,
  kind: 'bullet' | 'plain',
  origin: UpdateOrigin,
): void {
  const r = useResumeStore.getState().resume;
  if (!r) return;

  // Find the bullet first so we can no-op if there's nothing to change.
  let found = false;
  let unchanged = false;
  for (const s of r.sections) {
    for (const e of s.entries) {
      for (const b of e.bullets) {
        if (b.id === bulletId) {
          found = true;
          const current = b.kind ?? 'bullet';
          if (current === kind) unchanged = true;
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }
  if (!found || unchanged) return;

  _pushUndo('setBulletKind');
  const next = r.sections.map(s => ({
    ...s,
    entries: s.entries.map(e => ({
      ...e,
      bullets: e.bullets.map(b => {
        if (b.id !== bulletId) return b;
        const { kind: _drop, ...rest } = b;
        return kind === 'bullet' ? rest : { ...rest, kind: 'plain' as const };
      }),
    })),
  }));
  useResumeStore.setState({
    resume: { ...r, sections: next, metadata: { ...r.metadata, updated_at: new Date().toISOString() } },
  });
}
