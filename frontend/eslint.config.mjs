// ESLint flat config for CareerOps-Pro frontend.
//
// Scope: this config is intentionally minimal and only registers the v3 custom rules
// (T30) that enforce C7 (no global capture-phase pointer listeners) and C8 / § 2.6
// atomicity (no direct GroupsState.byId mutations). It does NOT enable a full lint
// preset for the project.
import { createRequire } from 'node:module';
import tsParser from '@typescript-eslint/parser';

const require = createRequire(import.meta.url);
const noGlobalPointerCapture = require('./eslint-rules/no-global-pointer-capture.js');
const noDirectGroupsMutation = require('./eslint-rules/no-direct-groups-mutation.js');

const v3Local = {
  rules: {
    'no-global-pointer-capture': noGlobalPointerCapture,
    'no-direct-groups-mutation': noDirectGroupsMutation,
  },
};

export default [
  // Ignore everything outside the v3 surface plus build artifacts.
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'playwright-report/**',
      'test-results/**',
      'public/**',
    ],
  },

  // C7: no global capture-phase pointer/mouse listeners. Apply broadly across the
  // frontend source so the invariant holds anywhere user code touches DOM events.
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { 'v3-local': v3Local },
    rules: {
      'v3-local/no-global-pointer-capture': 'error',
    },
  },

  // C8 / § 2.6 atomicity: no direct GroupsState mutations — scoped to v3 only to
  // avoid false positives on unrelated `*.byId.set/delete` calls elsewhere.
  {
    files: ['src/components/resume/v3/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { 'v3-local': v3Local },
    rules: {
      'v3-local/no-direct-groups-mutation': 'error',
    },
  },
];
