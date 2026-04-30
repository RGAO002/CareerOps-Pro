import { describe, it, expect } from 'vitest';
import { applyGroupOps, gcUnreferencedGroups, type GroupsState } from '../GroupOps';
import type { GroupId, GroupOp } from '../../schema/types';

const empty: GroupsState = { byId: new Map() };

describe('applyGroupOps', () => {
  it('create adds a group', () => {
    const ops: GroupOp[] = [{ type: 'create', group: { id: 'g1' as GroupId, kind: 'section', role: 'experience' } }];
    const next = applyGroupOps(empty, ops);
    expect(next.byId.get('g1' as GroupId)?.kind).toBe('section');
  });
  it('delete removes a group', () => {
    const seed: GroupsState = { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) };
    const next = applyGroupOps(seed, [{ type: 'delete', groupId: 'g1' as GroupId }]);
    expect(next.byId.has('g1' as GroupId)).toBe(false);
  });
  it('updateRole changes role + optional label', () => {
    const seed: GroupsState = { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) };
    const next = applyGroupOps(seed, [{ type: 'updateRole', groupId: 'g1' as GroupId, role: 'projects', label: 'Side Projects' }]);
    const g = next.byId.get('g1' as GroupId);
    expect(g?.kind).toBe('section');
    if (g?.kind === 'section') {
      expect(g.role).toBe('projects');
      expect(g.label).toBe('Side Projects');
    }
  });
  it('updateParent on entry group sets parentSectionGroupId', () => {
    const seed: GroupsState = { byId: new Map([['g2' as GroupId, { id: 'g2' as GroupId, kind: 'entry' }]]) };
    const next = applyGroupOps(seed, [{ type: 'updateParent', groupId: 'g2' as GroupId, parentSectionGroupId: 'g1' as GroupId }]);
    const g = next.byId.get('g2' as GroupId);
    if (g?.kind === 'entry') {
      expect(g.parentSectionGroupId).toBe('g1');
    }
  });
  it('returns the same state object when ops array is empty', () => {
    const next = applyGroupOps(empty, []);
    expect(next).toBe(empty);
  });
  it('treats applyGroupOps as immutable — input map not mutated', () => {
    const seed: GroupsState = { byId: new Map([['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }]]) };
    applyGroupOps(seed, [{ type: 'delete', groupId: 'g1' as GroupId }]);
    expect(seed.byId.has('g1' as GroupId)).toBe(true);
  });
});

describe('gcUnreferencedGroups', () => {
  it('removes groups not referenced by any row', () => {
    const seed: GroupsState = {
      byId: new Map([
        ['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }],
        ['g2' as GroupId, { id: 'g2' as GroupId, kind: 'entry' }],
        ['g3-orphan' as GroupId, { id: 'g3-orphan' as GroupId, kind: 'section', role: 'skills' }],
      ]),
    };
    const referencedIds = new Set(['g1' as GroupId, 'g2' as GroupId]);
    const next = gcUnreferencedGroups(seed, referencedIds);
    expect(next.byId.has('g1' as GroupId)).toBe(true);
    expect(next.byId.has('g2' as GroupId)).toBe(true);
    expect(next.byId.has('g3-orphan' as GroupId)).toBe(false);
  });
  it('clears parentSectionGroupId on entry groups when their parent is GCd', () => {
    // section group g1 is no longer referenced; entry g2 had it as parent.
    // GC removes g1 AND clears g2.parentSectionGroupId.
    const seed: GroupsState = {
      byId: new Map([
        ['g1' as GroupId, { id: 'g1' as GroupId, kind: 'section', role: 'experience' }],
        ['g2' as GroupId, { id: 'g2' as GroupId, kind: 'entry', parentSectionGroupId: 'g1' as GroupId }],
      ]),
    };
    const referencedIds = new Set(['g2' as GroupId]);
    const next = gcUnreferencedGroups(seed, referencedIds);
    expect(next.byId.has('g1' as GroupId)).toBe(false);
    const g2 = next.byId.get('g2' as GroupId);
    expect(g2?.kind).toBe('entry');
    if (g2?.kind === 'entry') {
      expect(g2.parentSectionGroupId).toBeUndefined();
    }
  });
});
