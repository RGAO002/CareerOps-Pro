// frontend/src/components/ai/concurrencyCheck.ts
import type { ResumeDoc, BlockId } from '../resume/v2/types';
import type { Suggestion } from '@/stores/aiSuggestion';

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: 'before_mismatch' | 'beforeChildIds_mismatch'
                       | 'parent_missing' | 'block_missing' | 'unknown_field' };

export function checkSuggestion(s: Suggestion, resume: ResumeDoc): CheckResult {
  switch (s.op) {
    case 'update': return _checkUpdate(s, resume);
    case 'insert': return _checkInsert(s, resume);
    case 'delete': return _checkDelete(s, resume);
    case 'move':   return _checkMove(s, resume);
  }
}

function _checkUpdate(s: Suggestion & { op: 'update' }, r: ResumeDoc): CheckResult {
  const cur = _readField(s.field, r);
  if (cur === undefined) return { ok: false, reason: 'unknown_field' };
  if (typeof cur === 'string') {
    return cur === s.before ? { ok: true } : { ok: false, reason: 'before_mismatch' };
  }
  // bullet content — JSON-stringify equality
  return JSON.stringify(cur) === JSON.stringify(s.before)
    ? { ok: true } : { ok: false, reason: 'before_mismatch' };
}

function _checkInsert(s: Suggestion & { op: 'insert' }, r: ResumeDoc): CheckResult {
  const childIds = _readChildIds(s.parentId, r);
  if (childIds === null) return { ok: false, reason: 'parent_missing' };
  return _arrEq(childIds, s.beforeChildIds)
    ? { ok: true } : { ok: false, reason: 'beforeChildIds_mismatch' };
}

function _checkDelete(s: Suggestion & { op: 'delete' }, r: ResumeDoc): CheckResult {
  const childIds = _readChildIds(s.parentId, r);
  if (childIds === null) return { ok: false, reason: 'parent_missing' };
  if (!_arrEq(childIds, s.beforeChildIds)) return { ok: false, reason: 'beforeChildIds_mismatch' };
  return childIds.includes(s.blockId) ? { ok: true } : { ok: false, reason: 'block_missing' };
}

function _checkMove(s: Suggestion & { op: 'move' }, r: ResumeDoc): CheckResult {
  const from = _readChildIds(s.fromParentId, r);
  const to = _readChildIds(s.toParentId, r);
  if (from === null || to === null) return { ok: false, reason: 'parent_missing' };
  if (!_arrEq(from, s.fromBeforeChildIds) || !_arrEq(to, s.toBeforeChildIds)) {
    return { ok: false, reason: 'beforeChildIds_mismatch' };
  }
  return { ok: true };
}

// Suggestion['field'] only exists on the UpdateSuggestion variant; pull it out
// directly from the discriminated union for a clean type.
type _Field = Extract<Suggestion, { op: 'update' }>['field'];

function _readField(f: _Field, r: ResumeDoc): string | object | undefined {
  switch (f.kind) {
    case 'header.name':     return r.header.name;
    case 'section.heading': return r.sections.find((s) => s.id === (f as any).id)?.heading;
    case 'entry.title': {
      for (const s of r.sections) {
        const e = s.entries.find((x) => x.id === (f as any).id);
        if (e) return e.title;
      }
      return undefined;
    }
    case 'entry.meta': {
      for (const s of r.sections) {
        const e = s.entries.find((x) => x.id === (f as any).id);
        if (e) return e.meta;
      }
      return undefined;
    }
    case 'bullet.content': {
      for (const s of r.sections) for (const e of s.entries) {
        const b = e.bullets.find((x) => x.id === (f as any).id);
        if (b) return b.content;
      }
      return undefined;
    }
  }
  return undefined;
}

function _readChildIds(parentId: BlockId, r: ResumeDoc): BlockId[] | null {
  // The "parent" can be: a section (children = entries), or an entry (children = bullets).
  for (const s of r.sections) {
    if (s.id === parentId) return s.entries.map((e) => e.id);
    for (const e of s.entries) {
      if (e.id === parentId) return e.bullets.map((b) => b.id);
    }
  }
  return null;
}

function _arrEq(a: BlockId[], b: BlockId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
