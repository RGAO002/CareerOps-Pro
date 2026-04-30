import { describe, it, expect, vi } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { history } from '@tiptap/pm/history';
import { dispatchWithGroups } from '../dispatchWithGroups';
import { createGroupsPlugin, getGroupsState } from '../../plugins/GroupsPlugin';
import type { GroupId, GroupOp } from '../../schema/types';

const schema = new Schema({
  nodes: {
    doc:  { content: 'row+' },
    text: {},
    row:  { attrs: { id: { default: '' }, semanticGroupId: { default: null } }, content: 'text*' },
  },
});

function makeView() {
  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.nodes.row.create({ id: 'r1' }, schema.text(' '))]),
    plugins: [history(), createGroupsPlugin()],
  });
  const view = {
    get state() { return state; },
    dispatch: vi.fn((tr) => { state = state.apply(tr); }),
  } as unknown as { state: EditorState; dispatch: ReturnType<typeof vi.fn> };
  return { view, getState: () => state };
}

describe('dispatchWithGroups', () => {
  it('dispatches a single transaction containing both doc ops and group ops', () => {
    const { view, getState } = makeView();
    const docOp = (tr: typeof view.state.tr) =>
      tr.replaceWith(getState().doc.content.size, getState().doc.content.size, schema.nodes.row.create({ id: 'r2', semanticGroupId: 'g1' }, schema.text(' ')));
    const groupOps: GroupOp[] = [{ type: 'create', group: { id: 'g1' as GroupId, kind: 'section', role: 'experience' } }];

    dispatchWithGroups(view, { docOp, groupOps });

    expect(view.dispatch).toHaveBeenCalledTimes(1);
    expect(getState().doc.childCount).toBe(2);
    expect(getGroupsState(getState()).byId.has('g1' as GroupId)).toBe(true);
  });
  it('throws if neither docOp nor groupOps is provided', () => {
    const { view } = makeView();
    expect(() => dispatchWithGroups(view, {} as any)).toThrow();
  });
});
