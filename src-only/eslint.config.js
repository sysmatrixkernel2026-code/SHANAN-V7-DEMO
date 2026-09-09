import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// A13-3: ESLint configuration for the SHANAN platform.
// Uses @typescript-eslint/parser for TypeScript/TSX source files.
// Note: The TS parser is computationally intensive. For large codebases,
// consider running lint on changed files only in CI.
export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly',
        fetch: 'readonly', localStorage: 'readonly', URL: 'readonly',
        FormData: 'readonly', File: 'readonly', alert: 'readonly',
        confirm: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        crypto: 'readonly', process: 'readonly', Buffer: 'readonly',
        React: 'readonly', import: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-undef': 'off',
      'no-empty': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'storage/**', '*.config.js', 'api/**', 'db/**'],
  },
];
