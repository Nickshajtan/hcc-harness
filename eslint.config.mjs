import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
const typedFiles = ['src/**/*.ts', 'tests/**/*.ts', '*.ts'];
export default ts.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.tools/**',
      '.test-state/**',
      'coverage/**',
      'reports/**',
      '.stryker-tmp/**',
      'vendor/**',
      // Frozen historical renderer; independently executed by compatibility tests.
      'tests/fixtures/m1-setup.ts',
    ],
  },
  ...ts.configs.recommended.map((config) => ({ ...config, files: ['**/*.{js,mjs,cjs}'] })),
  ...ts.configs.strictTypeChecked.map((config) => ({ ...config, files: typedFiles })),
  ...ts.configs.stylisticTypeChecked.map((config) => ({ ...config, files: typedFiles })),
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // Existing lifecycle/platform invariants need characterization before rewriting
      // assertions and conditions. Visible debt, not blocking compliance; see baseline.
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-dynamic-delete': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-unnecessary-type-conversion': 'warn',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Legacy subprocess JSON and test doubles require real boundary validation,
      // not casts to manufacture safety. Retain findings for structural follow-up.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/require-await': 'error',
    },
  },
  prettier,
  {
    files: ['tests/fixtures/native.cjs'],
    rules: {
      // Native fixture deliberately executes as CommonJS, including require().
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: 'error',
      curly: ['error', 'all'],
      yoda: ['error', 'always', { exceptRange: true }],
      'no-nested-ternary': 'error',
    },
  },
);
