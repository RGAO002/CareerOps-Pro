'use strict';

const { RuleTester } = require('eslint');
const rule = require('../no-direct-groups-mutation');

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const GROUP_OPS =
  '/Users/anywhere/frontend/src/components/resume/v3/plugins/GroupOps.ts';
const GROUPS_PLUGIN =
  '/Users/anywhere/frontend/src/components/resume/v3/plugins/GroupsPlugin.ts';
const GROUPS_PLUGIN_TEST =
  '/Users/anywhere/frontend/src/components/resume/v3/plugins/__tests__/GroupsPlugin.undoredo.test.ts';
const GROUP_OPS_TEST =
  '/Users/anywhere/frontend/src/components/resume/v3/plugins/__tests__/GroupOps.test.ts';
const NODEVIEW_FILE =
  '/Users/anywhere/frontend/src/components/resume/v3/nodeviews/SectionNodeView.tsx';
const AILOCK_FILE =
  '/Users/anywhere/frontend/src/components/resume/v3/plugins/AILockPlugin.ts';

tester.run('no-direct-groups-mutation', rule, {
  valid: [
    // Allowed inside GroupOps.ts / GroupsPlugin.ts and their test files.
    {
      filename: GROUP_OPS,
      code: 'state.byId.set(id, group); state.byId.delete(id);',
    },
    {
      filename: GROUPS_PLUGIN,
      code: 'next.byId.set(id, group);',
    },
    {
      filename: GROUPS_PLUGIN_TEST,
      code: 'next.byId.set(id, group);',
    },
    {
      filename: GROUP_OPS_TEST,
      code: 'next.byId.set(id, group);',
    },
    // Reads are always fine.
    {
      filename: AILOCK_FILE,
      code: 'state.byId.get(id); state.byId.has(id); state.byId.entries();',
    },
    // .set on a non-byId map is fine.
    {
      filename: AILOCK_FILE,
      code: 'someMap.set(id, x); other.delete(id);',
    },
  ],

  invalid: [
    {
      filename: NODEVIEW_FILE,
      code: 'state.byId.set(id, group);',
      errors: [{ messageId: 'noMutate', data: { method: 'set' } }],
    },
    {
      filename: AILOCK_FILE,
      code: 'groupsState.byId.delete(id);',
      errors: [{ messageId: 'noMutate', data: { method: 'delete' } }],
    },
    {
      filename: NODEVIEW_FILE,
      code: 'getGroupsState(state).byId.set(id, g); getGroupsState(state).byId.delete(id);',
      errors: [
        { messageId: 'noMutate', data: { method: 'set' } },
        { messageId: 'noMutate', data: { method: 'delete' } },
      ],
    },
  ],
});

console.log('no-direct-groups-mutation: OK');
