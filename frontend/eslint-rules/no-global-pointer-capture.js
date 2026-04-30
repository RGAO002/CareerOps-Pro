/**
 * @fileoverview Disallow capture-phase pointer/mouse listeners on `window` or `document`.
 *
 * Rationale (spec § C7): capture-phase global listeners on pointerdown/up/mousedown/up
 * compete with PM editor's own input handling and break selection / drag invariants.
 * Use element-scoped listeners or the DragController's transient window listeners (added
 * after `setPointerCapture` and removed on pointerup/cancel/Esc) instead.
 *
 * Heuristic: fires on `window.addEventListener(<pointerEvt>, h, true | { capture: true })`
 * or the same on `document`. File-level exception: `interaction/DragController.ts`.
 */
'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow capture-phase pointer/mouse listeners on window/document. ' +
        'Element-scoped listeners or DragController-style transient window listeners are safe.',
    },
    schema: [],
    messages: {
      noCapture:
        'Avoid capture-phase {{event}} listeners on {{target}} — they conflict with ProseMirror input handling (see C7).',
    },
  },

  create(context) {
    const filename = context.filename || context.getFilename();
    // Path exception: DragController owns transient window listeners around setPointerCapture.
    if (
      filename &&
      filename.replace(/\\/g, '/').includes(
        'src/components/resume/v3/interaction/DragController.ts'
      )
    ) {
      return {};
    }

    const POINTER_EVENTS = new Set([
      'pointerdown',
      'pointerup',
      'mousedown',
      'mouseup',
    ]);

    function isCaptureArg(node) {
      if (!node) return false;
      if (node.type === 'Literal' && node.value === true) return true;
      if (node.type === 'ObjectExpression') {
        for (const prop of node.properties) {
          if (
            prop.type === 'Property' &&
            !prop.computed &&
            ((prop.key.type === 'Identifier' && prop.key.name === 'capture') ||
              (prop.key.type === 'Literal' && prop.key.value === 'capture')) &&
            prop.value.type === 'Literal' &&
            prop.value.value === true
          ) {
            return true;
          }
        }
      }
      return false;
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'addEventListener'
        ) {
          return;
        }
        const obj = callee.object;
        if (obj.type !== 'Identifier') return;
        if (obj.name !== 'window' && obj.name !== 'document') return;

        const args = node.arguments;
        if (args.length < 1) return;
        const evtArg = args[0];
        if (
          evtArg.type !== 'Literal' ||
          typeof evtArg.value !== 'string' ||
          !POINTER_EVENTS.has(evtArg.value)
        ) {
          return;
        }
        if (args.length < 3) return;
        if (!isCaptureArg(args[2])) return;

        context.report({
          node,
          messageId: 'noCapture',
          data: { event: evtArg.value, target: obj.name },
        });
      },
    };
  },
};
