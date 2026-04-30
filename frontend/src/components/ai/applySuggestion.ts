// frontend/src/components/ai/applySuggestion.ts
import {
  applySuggestionV3,
  type AISuggestionV3,
} from '@/components/resume/v3/ai/applyWrapper';
import {
  useResumeStore,
  _aiApplyTransaction,
} from '@/components/resume/v2/store/useResumeStore';
import { insertBullet, insertEntry } from '@/components/resume/v2/store/actions/insertBlock';
import {
  deleteBullet,
  deleteEntry,
  deleteSection,
} from '@/components/resume/v2/store/actions/deleteBlock';
import { moveBullet } from '@/components/resume/v2/store/actions/moveBullet';
import { moveEntry } from '@/components/resume/v2/store/actions/moveEntry';
import { makeOrigin } from '@/components/resume/v2/store/source-of-truth';
import { useSuggestionStore, type Suggestion } from '@/stores/aiSuggestion';
import { checkSuggestion } from './concurrencyCheck';

const ORIGIN = () => makeOrigin('ai-apply');

/** Per-op composition inside _aiApplyTransaction's fn. Returns true on success
 *  (so caller can include the suggestion id in applied list). */
function _composeApply(s: Suggestion): boolean {
  const store = useResumeStore.getState();
  switch (s.op) {
    case 'update':
      if (s.field.kind === 'bullet.content') {
        store.updateBullet(s.field.id, s.after as never, ORIGIN());
      } else {
        store.updateField(s.field as never, s.after as string, ORIGIN());
      }
      return true;
    case 'insert':
      if (s.insertedBlock.kind === 'bullet') {
        insertBullet(
          s.parentId,
          s.atIndex,
          s.insertedBlock.content as never,
          ORIGIN(),
          undefined,
          s.insertedBlock.id,
        );
      } else if (s.insertedBlock.kind === 'entry') {
        const ib = s.insertedBlock;
        const { entryId } = insertEntry(
          s.parentId,
          s.atIndex,
          ORIGIN(),
          ib.id,
          ib.bullets[0].id,
        );
        store.updateField(
          { kind: 'entry.title', id: entryId } as never,
          ib.title,
          ORIGIN(),
        );
        store.updateField(
          { kind: 'entry.meta', id: entryId } as never,
          ib.meta,
          ORIGIN(),
        );
        // First bullet's id was forced via insertEntry; overwrite content:
        store.updateBullet(
          ib.bullets[0].id,
          ib.bullets[0].content as never,
          ORIGIN(),
        );
        for (let i = 1; i < ib.bullets.length; i++) {
          insertBullet(
            entryId,
            i,
            ib.bullets[i].content as never,
            ORIGIN(),
            undefined,
            ib.bullets[i].id,
          );
        }
      }
      return true;
    case 'delete':
      if (s.deletedBlock.kind === 'bullet') deleteBullet(s.blockId, ORIGIN());
      else if (s.deletedBlock.kind === 'entry') deleteEntry(s.blockId, ORIGIN());
      else if (s.deletedBlock.kind === 'section') deleteSection(s.blockId, ORIGIN());
      return true;
    case 'move': {
      // Distinguish bullet vs entry move by which parents are present:
      // entry parents are sections; bullet parents are entries.
      const r = useResumeStore.getState().resume!;
      const isEntryMove = r.sections.some((sec) => sec.id === s.fromParentId);
      if (isEntryMove) moveEntry(s.blockId, s.toParentId, s.toIndex, ORIGIN());
      else moveBullet(s.blockId, s.toParentId, s.toIndex, ORIGIN());
      return true;
    }
  }
}

// T38 — v3 delegation hook. When the ENABLE_RESUME_V3 flag is on AND the
// suggestion has a v3 target shape AND a live v3 EditorView is registered, the
// apply path delegates to applySuggestionV3 (single PM transaction). When the
// flag is off, v2 path runs unchanged so the 244/1 baseline holds.
type V3View = Parameters<typeof applySuggestionV3>[1];
let _v3View: V3View | null = null;
export function _registerV3EditorView(view: V3View | null): void {
  _v3View = view;
}
function _isV3FlagOn(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_RESUME_V3 === 'true';
}
function _looksLikeV3Suggestion(s: unknown): s is AISuggestionV3 {
  if (!s || typeof s !== 'object') return false;
  const obj = s as { target?: { kind?: unknown }; operation?: { kind?: unknown }; runId?: unknown };
  return (
    typeof obj.runId === 'string' &&
    !!obj.target && typeof obj.target.kind === 'string' &&
    ['document', 'selection', 'group', 'row'].includes(obj.target.kind as string) &&
    !!obj.operation && typeof obj.operation.kind === 'string'
  );
}

export async function applySuggestion(
  suggestionId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const sugStore = useSuggestionStore.getState();
  const s = sugStore.byId[suggestionId];
  if (!s || s.status !== 'pending') return { ok: false, reason: 'not_pending' };

  // v3 delegation branch — flag-gated and shape-checked. v2 callers with v2
  // suggestions always fall through to the unchanged path below.
  if (_isV3FlagOn() && _v3View && _looksLikeV3Suggestion(s)) {
    const r = applySuggestionV3(s as AISuggestionV3, _v3View);
    if (r.ok) {
      sugStore.markStatusLocally(suggestionId, 'accepted');
      await sugStore.postStatusToBackend(suggestionId, 'accepted');
      return { ok: true };
    }
    if (r.reason === 'stale') {
      sugStore.markStatusLocally(suggestionId, 'superseded');
      await sugStore.postStatusToBackend(suggestionId, 'superseded');
      return { ok: false, reason: 'stale' };
    }
    return { ok: false };
  }

  const resume = useResumeStore.getState().resume;
  if (!resume) return { ok: false, reason: 'no_resume' };

  const check = checkSuggestion(s, resume);
  if (!check.ok) {
    sugStore.markStatusLocally(suggestionId, 'superseded');
    await sugStore.postStatusToBackend(suggestionId, 'superseded');
    return { ok: false, reason: check.reason };
  }

  let applied = false;
  _aiApplyTransaction(`aiApply:${suggestionId}`, { runId: s.runId }, () => {
    applied = _composeApply(s);
    return {
      appliedSuggestionIds: applied ? [suggestionId] : [],
      mutated: applied,
    };
  });

  if (applied) {
    sugStore.markStatusLocally(suggestionId, 'accepted');
    await sugStore.postStatusToBackend(suggestionId, 'accepted');
  }
  return { ok: applied };
}

/** Apply an explicit list of suggestion ids (caller-controlled scope). This is
 *  the underlying batch primitive. Used by:
 *   - Sidebar "Accept all" — passes visible+pending ids only (so a Suggestion
 *     hidden by the current sidebar scope is NOT silently accepted)
 *   - applyAllInRun(runId) — convenience wrapper for "all pending in this run"
 *
 *  Spec § 5.2 batch semantics: stable createdAt order, per-step concurrency
 *  re-check, per-item supersede on check fail, ONE outer aiApply undo entry
 *  per runId group. */
export async function applySuggestions(
  suggestionIds: string[],
): Promise<{ accepted: number; skipped: number }> {
  const sugStore = useSuggestionStore.getState();
  const candidates = suggestionIds
    .map((id) => sugStore.byId[id])
    .filter((s): s is Suggestion => !!s && s.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt);
  if (candidates.length === 0) return { accepted: 0, skipped: 0 };

  // All candidates of a single batch must share the same runId for the undo
  // entry's metadata. If caller passed a mixed-run set, group them and run
  // each group through its own transaction.
  const byRun = new Map<string, Suggestion[]>();
  for (const c of candidates) {
    if (!byRun.has(c.runId)) byRun.set(c.runId, []);
    byRun.get(c.runId)!.push(c);
  }

  let totalAccepted = 0;
  let totalSkipped = 0;
  for (const [runId, group] of byRun) {
    const r = await _applySuggestionGroup(runId, group);
    totalAccepted += r.accepted;
    totalSkipped += r.skipped;
  }
  return { accepted: totalAccepted, skipped: totalSkipped };
}

/** Convenience wrapper: apply EVERY pending Suggestion of a run (not
 *  scope-limited). Sidebar "Accept all" should pass the visible-pending
 *  subset directly to applySuggestions() instead so scope is honored. */
export async function applyAllInRun(
  runId: string,
): Promise<{ accepted: number; skipped: number }> {
  const sugStore = useSuggestionStore.getState();
  const ids = (sugStore.byRun[runId] || []).slice();
  return applySuggestions(ids);
}

async function _applySuggestionGroup(
  runId: string,
  candidates: Suggestion[],
): Promise<{ accepted: number; skipped: number }> {
  if (candidates.length === 0) return { accepted: 0, skipped: 0 };

  const skipped: string[] = [];
  const appliedIds: string[] = [];

  _aiApplyTransaction(`aiApply:batch:${runId}`, { runId }, () => {
    for (const cand of candidates) {
      const resume = useResumeStore.getState().resume!;
      const check = checkSuggestion(cand, resume);
      if (!check.ok) {
        // Concurrency check is the ONLY legitimate per-op skip path. Mutation
        // hasn't happened yet, so we can safely supersede this one and move on.
        skipped.push(cand.id);
        continue;
      }
      // ★ NO try/catch around _composeApply: if a store action throws (which
      // shouldn't happen given the concurrency check passed, but defensively),
      // the resume may be in a half-mutated state. We MUST let the exception
      // propagate so _aiApplyTransaction's catch rolls the whole batch back
      // to snapshotBefore. Swallowing here would leave stale partial mutations.
      const ok = _composeApply(cand);
      if (ok) appliedIds.push(cand.id);
      else skipped.push(cand.id);
    }
    return {
      appliedSuggestionIds: appliedIds,
      mutated: appliedIds.length > 0,
    };
  });

  // Post status for each:
  const sugStore = useSuggestionStore.getState();
  for (const id of appliedIds) {
    sugStore.markStatusLocally(id, 'accepted');
    await sugStore.postStatusToBackend(id, 'accepted');
  }
  for (const id of skipped) {
    sugStore.markStatusLocally(id, 'superseded');
    await sugStore.postStatusToBackend(id, 'superseded');
  }
  return { accepted: appliedIds.length, skipped: skipped.length };
}
