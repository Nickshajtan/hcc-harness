import ts from 'typescript-eslint';
export default ts.config({ ignores: ['tests/fixtures/*.cjs'] }, ...ts.configs.recommended, {
  files: ['**/*.{ts,mjs}'],
  rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
});
