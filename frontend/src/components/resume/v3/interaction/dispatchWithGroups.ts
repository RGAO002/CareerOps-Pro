import type { EditorView } from '@tiptap/pm/view';
import type { Transaction } from '@tiptap/pm/state';
import type { GroupOp } from '../schema/types';

export interface DispatchWithGroupsArgs {
  docOp?: (tr: Transaction) => Transaction;
  groupOps?: GroupOp[];
  meta?: Record<string, unknown>;
  addToHistory?: boolean;       // default true
}

/**
 * Dispatch a single PM transaction that mutates both doc and GroupsPlugin
 * state atomically. The atomic guarantee comes from PM's single-transaction
 * commit + history extension preserving full EditorState per step.
 *
 * Tasks must use this helper instead of view.dispatch + raw tr.setMeta in
 * any case where group state changes alongside doc changes (drag drop,
 * backspace cascading group GC, slash command kind conversion, AI apply).
 *
 * The ESLint rule no-direct-groups-mutation enforces this.
 */
export function dispatchWithGroups(view: EditorView, args: DispatchWithGroupsArgs): void {
  if (!args.docOp && (!args.groupOps || args.groupOps.length === 0)) {
    throw new Error('dispatchWithGroups requires at least one of docOp or non-empty groupOps');
  }
  let tr = view.state.tr;
  if (args.docOp) tr = args.docOp(tr);
  if (args.groupOps && args.groupOps.length > 0) tr = tr.setMeta('groupOps', args.groupOps);
  if (args.meta) {
    for (const [k, v] of Object.entries(args.meta)) tr = tr.setMeta(k, v);
  }
  if (args.addToHistory === false) tr = tr.setMeta('addToHistory', false);
  view.dispatch(tr);
}
