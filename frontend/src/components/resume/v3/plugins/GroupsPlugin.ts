import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { GroupOp } from '../schema/types';
import { applyGroupOps, type GroupsState } from './GroupOps';

export const groupsPluginKey = new PluginKey<GroupsState>('groupsPlugin');

export function createGroupsPlugin() {
  return new Plugin<GroupsState>({
    key: groupsPluginKey,
    state: {
      init: () => ({ byId: new Map() }),
      apply(tr: Transaction, oldState: GroupsState): GroupsState {
        // 1. Hydration meta: seed entire state from passed-in groups.
        const hydrate = tr.getMeta('groupsHydrate') as GroupsState | undefined;
        if (hydrate) return hydrate;

        // 2. Apply explicit ops only. NO auto-GC: see architectural note in Task 13.
        //    Production code that wants a group deleted must emit an explicit
        //    {type:'delete'} groupOp paired with the doc step (via dispatchWithGroups).
        const ops = tr.getMeta('groupOps') as GroupOp[] | undefined;
        return ops ? applyGroupOps(oldState, ops) : oldState;
      },
    },
  });
}

/** Read groups state from an EditorState. */
export function getGroupsState(state: EditorState): GroupsState {
  return groupsPluginKey.getState(state) ?? { byId: new Map() };
}
