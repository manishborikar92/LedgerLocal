// Flat ESLint config. Besides style, it ENFORCES the architecture (docs/DESIGN.md §2) and the privacy rules:
//   core   -> pure TypeScript (no React/DOM/Next, no other layers)
//   ports  -> may import core only
//   adapters -> may import core, ports, config (never ui)
//   ui     -> may import core, ports, config, composition (never adapters directly)
//   everywhere in src/: no network APIs, no eval / new Function.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Request', 'importScripts'].map((name) => ({ name, message: 'LedgerLocal never makes network requests (connect-src none). See docs/DECISIONS.md.' }));
const DOM_GLOBALS = ['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location', 'HTMLElement', 'Worker', 'self'].map((name) => ({ name, message: 'core must stay free of DOM/browser APIs so it can run in Node or move to a shared package.' }));
const ban = (patterns, message) => ({ 'no-restricted-imports': ['error', { patterns: patterns.map((group) => ({ group: [group], message })) }] });

export default tseslint.config(
  { ignores: ['out/**', '.next/**', 'node_modules/**', 'public/**', '.generated/**', 'e2e-artifacts/**', 'test-results/**', 'playwright-report/**', 'scripts/**', 'examples/**', 'next-env.d.ts', '**/*.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-eval': 'error', 'no-new-func': 'error', 'no-implied-eval': 'error',
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS],
      'no-restricted-properties': ['error', { object: 'navigator', property: 'sendBeacon', message: 'No beacons: nothing leaves the device.' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS, ...DOM_GLOBALS],
      ...ban(['react', 'react-dom', 'react/*', 'next', 'next/*', '@/*', 'idb', 'pdfjs-dist', 'pdfjs-dist/*', '../ports/*', '../adapters/*', '../ui/*', '../config/*', '../composition'], 'core is pure: no React/DOM/Next, and no imports from other layers.'),
    },
  },
  { files: ['src/ports/**/*.ts'], rules: ban(['react', 'next', 'next/*', 'idb', 'pdfjs-dist', '@/adapters/*', '@/ui/*', '@/composition'], 'ports may depend on core only.') },
  { files: ['src/adapters/**/*.{ts,tsx}'], rules: ban(['react', 'react-dom', 'next', 'next/*', '@/ui/*', '@/composition'], 'adapters must not depend on the UI or the composition root.') },
  { files: ['src/ui/**/*.{ts,tsx}'], rules: ban(['@/adapters/*', 'idb', 'pdfjs-dist', 'pdfjs-dist/*'], 'the UI reaches adapters only through @/composition.') },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: { ...jsxA11y.flatConfigs.recommended.rules, 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    // ARIA grid pattern: the container is not a tab stop (cells are, roving tabindex) and keys are handled on the container;
    // jsx-a11y cannot model that. Keyboard behaviour is covered by e2e/workflow.spec.ts and the axe checks.
    files: ['src/ui/workbench/Grid.tsx', 'src/ui/views/LedgerView.tsx'],
    rules: { 'jsx-a11y/interactive-supports-focus': 'off', 'jsx-a11y/click-events-have-key-events': 'off', 'jsx-a11y/no-static-element-interactions': 'off' },
  },
  {
    // Focus is moved on purpose into freshly opened modals and inline cell editors (a user-initiated action), never on page load.
    files: ['src/ui/workbench/Grid.tsx', 'src/ui/dialogs/*.tsx', 'src/ui/import/*.tsx', 'src/ui/views/Report.tsx'],
    rules: { 'jsx-a11y/no-autofocus': 'off' },
  },
  { files: ['tests/**/*.{ts,tsx}', 'e2e/**/*.ts', 'tools/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
