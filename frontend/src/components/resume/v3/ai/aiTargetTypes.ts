// Spec ref: § 6.1 — AITarget union for AI suggestions.
//
// 4 target kinds: document | selection | group | row.
// `group` carries an optional `rowIds` fallback hint for when the groupId
// has been GC'd or otherwise lost (F4 orphan tolerance).
// `row` carries an optional `groupId` hint for when the row is the head
// of a group and the row id has shifted but the group still exists.

import type { GroupId, RowId } from '../schema/types';

export type AITarget =
  | { kind: 'document' }
  | { kind: 'selection'; from: number; to: number }
  | { kind: 'group'; groupId: GroupId; rowIds?: RowId[] }
  | { kind: 'row'; rowId: RowId; groupId?: GroupId };

// Resolution result returned by suggestionResolver.resolveTarget.
// On success, `from`/`to` are PM positions and `rowIds` lists the rows
// covered (in document order). For document/selection targets, `rowIds`
// may be empty when the target doesn't map cleanly onto whole rows.
export type ResolvedTarget =
  | { status: 'ok'; from: number; to: number; rowIds: RowId[] }
  | { status: 'stale' };
