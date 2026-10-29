module.exports = {
  forbidden: [
    { name: 'no-circular-imports', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-presentation-in-execution-contracts',
      severity: 'error',
      from: {
        path: '^src/((config|core|events|middleware|process|setup|lifecycle|discovery)\\.ts$|core/|lifecycle/)',
      },
      to: { path: '^src/(cli|commands|wizard)\\.ts$' },
    },
    {
      name: 'no-lifecycle-coordinator-in-ownership',
      severity: 'error',
      from: { path: '^src/lifecycle/(manifest|ownership|routing-journal)\\.ts$' },
      to: {
        path: '^src/(setup|lifecycle)\\.ts$|^src/lifecycle/(index|inspection|recovery|routing-plan|removal)\\.ts$',
      },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
  },
};
