module.exports = {
  forbidden: [
    { name: 'no-circular-imports', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-presentation-in-execution-contracts',
      severity: 'error',
      from: {
        path: '^src/((config|core|events|middleware|process|setup|lifecycle|discovery)\\.ts$|core/)',
      },
      to: { path: '^src/(cli|commands|wizard)\\.ts$' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
  },
};
