/**
 * @fileoverview Disallow direct `.byId.set(...)` / `.byId.delete(...)` mutations outside the
 * GroupsPlugin authority surface.
 *
 * Rationale (spec § C8 / § 2.6 atomicity): `GroupsState` mutations must flow through
 * `GroupsPlugin.apply` (driven by `dispatchWithGroups` + `groupsOp` meta), so each visible
 * doc change ships with exactly one matching groups update. Direct Map mutations on
 * `state.byId` bypass that pipeline and break undo/redo atomicity.
 *
 * Heuristic (no runtime types at lint time): flags any `<expr>.byId.set(...)` or
 * `<expr>.byId.delete(...)`. This will also flag arbitrary `.byId.set/delete` on
 * non-`GroupsState` shapes — accepted as an over-approximation. Path-scope this rule
 * to `frontend/src/components/resume/v3/**` via the ESLint config to keep noise out
 * of unrelated code.
 *
 * Allowed files (the GroupsPlugin authority surface and its tests):
 *   - plugins/GroupsPlugin.ts
 *   - plugins/GroupOps.ts
 *   - plugins/__tests__/GroupsPlugin.*.ts
 *   - plugins/__tests__/GroupOps.*.ts
 */
'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct `.byId.set/delete` mutations outside GroupsPlugin/GroupOps. ' +
        'Approximation: matches any `*.byId.set/delete` call regardless of static type. ' +
        'Path-scope this rule to v3 source via ESLint config.',
    },
    schema: [],
    messages: {
      noMutate:
        'Do not call `.byId.{{method}}` directly — route group mutations through GroupsPlugin (dispatchWithGroups + groupsOp).',
    },
  },

  create(context) {
    const filename = (context.filename || context.getFilename() || '').replace(/\\/g, '/');

    // Allow inside GroupsPlugin / GroupOps and their test files.
    const ALLOWED_BASENAMES = [
      '/plugins/GroupsPlugin.ts',
      '/plugins/GroupOps.ts',
    ];
    const ALLOWED_TEST_PREFIXES = [
      '/plugins/__tests__/GroupsPlugin.',
      '/plugins/__tests__/GroupOps.',
    ];
    if (ALLOWED_BASENAMES.some((s) => filename.endsWith(s))) return {};
    if (ALLOWED_TEST_PREFIXES.some((p) => filename.includes(p))) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier') return;
        const method = callee.property.name;
        if (method !== 'set' && method !== 'delete') return;

        const obj = callee.object; // expected to be `<expr>.byId`
        if (
          obj.type !== 'MemberExpression' ||
          obj.computed ||
          obj.property.type !== 'Identifier' ||
          obj.property.name !== 'byId'
        ) {
          return;
        }

        context.report({
          node,
          messageId: 'noMutate',
          data: { method },
        });
      },
    };
  },
};
