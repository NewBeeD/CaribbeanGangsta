/* eslint-env node */

/**
 * Determinism guard (see prompts/README.md "Non-negotiable engineering rules"):
 * the pure simulation in `src/engine/**` must be reproducible from a seed alone.
 * Any ambient source of nondeterminism (`Math.random`, `Date.now`, `new Date()`,
 * `performance.now`) is a lint ERROR inside the engine. All randomness must route
 * through `engine/rng.ts`; all time must be injected via `tick(state, dtHours)`.
 */
const NO_NONDETERMINISM_MESSAGE =
  'Nondeterminism is forbidden in src/engine/**. Route randomness through engine/rng.ts and inject time via tick(). See prompts/README.md.';

module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.cjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  overrides: [
    {
      // The determinism boundary: the pure engine only.
      files: ['src/engine/**/*.ts', 'src/engine/**/*.tsx'],
      rules: {
        'no-restricted-properties': [
          'error',
          { object: 'Math', property: 'random', message: NO_NONDETERMINISM_MESSAGE },
          { object: 'Date', property: 'now', message: NO_NONDETERMINISM_MESSAGE },
          { object: 'performance', property: 'now', message: NO_NONDETERMINISM_MESSAGE },
        ],
        'no-restricted-globals': [
          'error',
          { name: 'Date', message: NO_NONDETERMINISM_MESSAGE },
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector: "NewExpression[callee.name='Date']",
            message: NO_NONDETERMINISM_MESSAGE,
          },
        ],
      },
    },
    {
      files: ['tests/**/*.ts', 'tests/**/*.tsx'],
      env: { node: true },
    },
  ],
};
