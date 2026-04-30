'use strict';

const { RuleTester } = require('eslint');
const rule = require('../no-global-pointer-capture');

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const DRAG_CTRL =
  '/Users/anywhere/frontend/src/components/resume/v3/interaction/DragController.ts';
const OTHER_V3 =
  '/Users/anywhere/frontend/src/components/resume/v3/plugins/AILockPlugin.ts';

tester.run('no-global-pointer-capture', rule, {
  valid: [
    // Element-scoped listener, even with capture, is OK.
    {
      filename: OTHER_V3,
      code: "someEl.addEventListener('pointerdown', h, { capture: true });",
    },
    // Non-pointer event on window, capture true, is OK.
    {
      filename: OTHER_V3,
      code: "window.addEventListener('click', h, { capture: true });",
    },
    // window pointer listener WITHOUT capture flag is OK (DragController-style transient listener).
    {
      filename: OTHER_V3,
      code: "window.addEventListener('pointerup', h);",
    },
    // Path exception: any window pointerdown listener inside DragController.ts is allowed.
    {
      filename: DRAG_CTRL,
      code: "window.addEventListener('pointerdown', h, true);",
    },
    {
      filename: DRAG_CTRL,
      code: "document.addEventListener('mousedown', h, { capture: true });",
    },
    // capture: false is fine.
    {
      filename: OTHER_V3,
      code: "window.addEventListener('pointerdown', h, { capture: false });",
    },
  ],

  invalid: [
    {
      filename: OTHER_V3,
      code: "window.addEventListener('pointerdown', h, true);",
      errors: [{ messageId: 'noCapture' }],
    },
    {
      filename: OTHER_V3,
      code: "document.addEventListener('mousedown', h, { capture: true });",
      errors: [{ messageId: 'noCapture' }],
    },
    {
      filename: OTHER_V3,
      code: "window.addEventListener('pointerup', h, { capture: true, passive: false });",
      errors: [{ messageId: 'noCapture' }],
    },
    {
      filename: OTHER_V3,
      code: "document.addEventListener('mouseup', h, true);",
      errors: [{ messageId: 'noCapture' }],
    },
  ],
});

// RuleTester throws on failure; reaching this line means PASS.
console.log('no-global-pointer-capture: OK');
