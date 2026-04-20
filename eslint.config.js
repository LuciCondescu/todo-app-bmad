import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.playwright/**',
      '_bmad-output/**',
      '_bmad/**',
      'coverage/**',
      'apps/**/coverage/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Project-wide rule tweaks
  {
    rules: {
      // Honour the `_` prefix convention for intentionally-unused params / vars / catches.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },

  // Node scope (API + config files)
  {
    files: ['apps/api/**/*.{ts,tsx}', '*.config.{js,ts,mjs,cjs}', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Browser scope (web)
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // jsx-a11y's recommended ships `control-has-associated-label` off (severity 0).
      // Enabling it enforces "interactive controls must have an accessible name" per AC1.
      'jsx-a11y/control-has-associated-label': 'error',
    },
    settings: { react: { version: 'detect' } },
  },

  // Test files: ergonomic relaxations (unused args in test doubles, require-yield in interface impls)
  {
    files: ['**/*.test.{ts,tsx}', 'apps/web/e2e/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Prettier LAST — disables any rule that conflicts with Prettier's formatting
  prettier,
);
