import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/', 'dist/', 'release/', 'coverage/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main/**', 'src/preload/**', 'tests/**', '*.config.*'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/**'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Invariant: shared code runs in every process and in tests, so it can't depend on any of them.
    files: ['src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'node:*', 'react', 'react-dom'],
              message: 'src/shared must stay free of Electron, Node and DOM dependencies.',
            },
            {
              group: ['**/main/**', '**/preload/**', '**/renderer/**'],
              message: 'src/shared must not import from process-specific code.',
            },
          ],
        },
      ],
    },
  },
  {
    // Invariant: the renderer reaches the filesystem and Electron only through the preload API.
    files: ['src/renderer/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'node:*', 'fs', 'path'],
              message: 'The renderer must use window.regionbool, not Electron or Node APIs.',
            },
            {
              group: ['**/main/**', '**/preload/index*'],
              message: 'The renderer must not import main or preload implementation code.',
            },
          ],
        },
      ],
    },
  },
);
