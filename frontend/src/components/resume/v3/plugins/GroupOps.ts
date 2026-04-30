import type { GroupId, GroupOp, SemanticGroup } from '../schema/types';

export interface GroupsState {
  byId: Map<GroupId, SemanticGroup>;
}

export function applyGroupOps(state: GroupsState, ops: GroupOp[]): GroupsState {
  if (ops.length === 0) return state;
  const next = new Map(state.byId);
  for (const op of ops) {
    switch (op.type) {
      case 'create':
        next.set(op.group.id, op.group);
        break;
      case 'delete':
        next.delete(op.groupId);
        break;
      case 'updateRole': {
        const existing = next.get(op.groupId);
        if (!existing || existing.kind !== 'section') break;
        next.set(op.groupId, { ...existing, role: op.role, label: op.label });
        break;
      }
      case 'updateParent': {
        const existing = next.get(op.groupId);
        if (!existing || existing.kind !== 'entry') break;
        next.set(op.groupId, { ...existing, parentSectionGroupId: op.parentSectionGroupId });
        break;
      }
    }
  }
  return { byId: next };
}

export function gcUnreferencedGroups(state: GroupsState, referencedIds: Set<GroupId>): GroupsState {
  let didChange = false;
  const next = new Map<GroupId, SemanticGroup>();
  // First pass: keep referenced groups.
  for (const [id, g] of state.byId.entries()) {
    if (referencedIds.has(id)) {
      next.set(id, g);
    } else {
      didChange = true;
    }
  }
  // Second pass: clear dangling parentSectionGroupId on entry groups whose parent was GC'd.
  for (const [id, g] of next.entries()) {
    if (g.kind === 'entry' && g.parentSectionGroupId && !next.has(g.parentSectionGroupId)) {
      next.set(id, { ...g, parentSectionGroupId: undefined });
      didChange = true;
    }
  }
  return didChange ? { byId: next } : state;
}
