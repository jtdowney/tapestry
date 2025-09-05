import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import importPlugin from 'eslint-plugin-import';

// Common configuration to reduce duplication
const commonGlobals = {
  chrome: 'readonly',
  browser: 'readonly',
  console: 'readonly',
  document: 'readonly',
  window: 'readonly',
  process: 'readonly',
};

const commonPlugins = {
  '@typescript-eslint': typescript,
  import: importPlugin,
};

const commonRules = {
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-unused-vars': 'off',
  'import/order': [
    'warn', // Relaxed from 'error' to reduce noisy diffs
    {
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
      'newlines-between': 'always',
    },
  ],
  'import/no-duplicates': 'error',
  'import/no-unresolved': 'off',
  // Removed 'import/no-cycle' - unnecessary for small codebase
};

const commonParserOptions = {
  ecmaVersion: 'latest',
  sourceType: 'module',
};

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: commonParserOptions,
      globals: {
        ...commonGlobals,
        ImageData: 'readonly',
        Document: 'readonly',
        Element: 'readonly',
        TextEncoder: 'readonly',
        globalThis: 'readonly',
        crypto: 'readonly',
      },
    },
    plugins: commonPlugins,
    rules: commonRules,
  },
  {
    files: [
      '*.config.js',
      '*.config.ts',
      'vite.*.config.ts',
      'vitest.config.ts',
      'eslint.config.js',
      'svelte.config.js',
      '../*.config.js',
      '../*.config.ts',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: commonParserOptions,
      globals: {
        ...commonGlobals,
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: commonPlugins,
    rules: commonRules,
  },
  {
    files: ['**/*.test.ts', '**/*.test.js', '**/test/**/*.ts', '**/test/**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: commonParserOptions,
      globals: {
        ...commonGlobals,
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        HTMLElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLInputElement: 'readonly',
        Event: 'readonly',
        vi: 'readonly',
        expect: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    plugins: commonPlugins,
    rules: {
      ...commonRules,
      'no-undef': 'error',
    },
  },
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
      },
      globals: {
        ...commonGlobals,
        setTimeout: 'readonly',
      },
    },
    plugins: commonPlugins,
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      'import/order': [
        'warn', // Relaxed from 'error' to reduce noisy diffs
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
        },
      ],
      'import/no-duplicates': 'error',
    },
  },
];
