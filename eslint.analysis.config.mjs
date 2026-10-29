import base from './eslint.config.mjs';
// Diagnostic targets; never raise limits simply to obtain a green build.
export default [
  ...base,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.{js,mjs}'],
    rules: {
      complexity: ['warn', 12],
      'max-depth': ['warn', 3],
      'max-params': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
];
