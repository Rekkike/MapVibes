import tseslint from 'typescript-eslint';

// Dev-only lint gate over the application and its tests, the same scope the
// typecheck covers (tsconfig includes src and tests). The build scripts and
// the Vite config are outside that scope and are not linted.
//
// Two tiers, by the owner's ruling on the measured volume (recorded in the
// specification's riders): src/ carries the full ruled set --
// recommended-type-checked with no-explicit-any and the no-unsafe-* family --
// and is fully clean. tests/ keeps curly, eqeqeq, no-unused-vars, and
// no-floating-promises as errors (a floating promise in a test is a test that
// may pass without testing); no-explicit-any and the no-unsafe-* rules are
// relaxed there only, where JSON.parse fixtures and typed test helpers
// trigger them.
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      eqeqeq: 'error',
      curly: 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
