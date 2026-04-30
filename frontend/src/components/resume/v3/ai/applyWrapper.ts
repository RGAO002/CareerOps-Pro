// T38 — applyWrapper: AI suggestion apply via single PM transaction (atomic).
//
// Spec ref: docs/superpowers/specs/2026-04-29-resume-editor-v3-design.md § 6.2 + § 6.5.
//
// Contract:
//   - All doc + group state changes go through dispatchWithGroups (C8/F5 — no raw
//     view.dispatch). Single PM transaction = single Cmd+Z step (history coherence).
//   - meta { allowLockedEdit: true } so the AI lock plugin (T24) lets the apply
//     through ranges that would otherwise reject user edits.
//   - meta { aiApply: { runId, suggestionIds: [s.id] } } so downstream listeners
//     (T39 suggestion store status migration) can detect the apply transaction.
//   - Stale targets (resolveTarget returned {status:'stale'}) DO NOT dispatch;
//     return {ok:false, reason:'stale'} so the caller updates suggestion status.
//   - F4 orphan-tolerance is inherited from suggestionResolver, which walks doc
//     attributes (not GroupsPlugin state) to find rows.
//   - GroupOps for create/delete are passed in by the caller (the LLM /
//     suggestion-construction layer is responsible for emitting them — this
//     layer just ferries them onto the transaction).

import type { EditorView } from '@tiptap/pm/view';
import type { Transaction } from '@tiptap/pm/state';
import type { Schema } from '@tiptap/pm/model';
import type { GroupOp, ResumeRow } from '../schema/types';
import { rowToPMNodeJSON } from '../schema/hydrate';
import { dispatchWithGroups } from '../interaction/dispatchWithGroups';
import { resolveTarget } from './suggestionResolver';
import type { AITarget } from './aiTargetTypes';

// Operations supported by the apply wrapper. The shape is intentionally minimal:
// callers (LLM response layer) construct rows fully formed; the apply wrapper
// only translates to PM positions + dispatches via dispatchWithGroups.
export type AISuggestionOperation =
  | { kind: 'replace'; rows: ResumeRow[]; groupOps?: GroupOp[] }
  | { kind: 'rewrite'; rows: ResumeRow[]; groupOps?: GroupOp[] } // alias for replace
  | { kind: 'insert'; rows: ResumeRow[]; at: 'before' | 'after'; groupOps?: GroupOp[] }
  | { kind: 'delete'; groupOps?: GroupOp[] };

export interface AISuggestionV3 {
  id: string;
  runId: string;
  target: AITarget;
  operation: AISuggestionOperation;
  status: 'pending' | 'applied' | 'stale' | 'rejected';
}

export type ApplyResult =
  | { ok: true; runId: string; suggestionId: string }
  | { ok: false; reason: 'stale' };

function rowsToPMNodes(rows: ResumeRow[], schema: Schema) {
  return rows.map((r) => schema.nodeFromJSON(rowToPMNodeJSON(r, schema)));
}

export function applySuggestionV3(
  suggestion: AISuggestionV3,
  view: EditorView,
): ApplyResult {
  const resolved = resolveTarget(suggestion.target, view.state);
  if (resolved.status === 'stale') {
    return { ok: false, reason: 'stale' };
  }

  const { from, to } = resolved;
  const schema = view.state.schema;
  const op = suggestion.operation;

  let docOp: ((tr: Transaction) => Transaction) | undefined;
  let groupOps: GroupOp[] | undefined = op.groupOps;

  switch (op.kind) {
    case 'replace':
    case 'rewrite': {
      const nodes = rowsToPMNodes(op.rows, schema);
      docOp = (tr) => tr.replaceWith(from, to, nodes);
      break;
    }
    case 'insert': {
      const nodes = rowsToPMNodes(op.rows, schema);
      const insertAt = op.at === 'before' ? from : to;
      docOp = (tr) => tr.insert(insertAt, nodes);
      break;
    }
    case 'delete': {
      docOp = (tr) => tr.delete(from, to);
      break;
    }
  }

  dispatchWithGroups(view, {
    docOp,
    groupOps,
    meta: {
      allowLockedEdit: true,
      aiApply: { runId: suggestion.runId, suggestionIds: [suggestion.id] },
    },
    addToHistory: true,
  });

  return { ok: true, runId: suggestion.runId, suggestionId: suggestion.id };
}
