module.exports = {
  forbidden: [
    {
      name: 'no-installation-coordinator-in-rendering-or-planning',
      severity: 'error',
      from: { path: '^src/(installation/renderer|lifecycle/routing-plan)\\.ts$' },
      to: { path: '^src/(setup\\.ts$|installation/setup\\.ts$|lifecycle/index\\.ts$)' },
    },
    {
      name: 'no-application-effects-in-input-decisions',
      severity: 'error',
      from: { path: '^src/(cli/parsing|wizard/decisions)\\.ts$' },
      to: { path: '^src/(core|lifecycle|setup|process|wizard/workflow|cli/dispatch)(\\.ts$|/)' },
    },
    { name: 'no-circular-imports', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-presentation-in-execution-contracts',
      severity: 'error',
      from: {
        path: '^src/((config|core|events|middleware|process|setup|lifecycle|discovery)\\.ts$|core/|lifecycle/|process/|installation/)',
      },
      to: { path: '^src/(cli|commands|wizard)(\\.ts$|/)' },
    },
    {
      name: 'no-application-coordinators-in-process',
      severity: 'error',
      from: { path: '^src/process/' },
      to: { path: '^src/(core|lifecycle)(\\.ts$|/)|^src/setup\\.ts$' },
    },
    {
      name: 'no-windows-shim-in-core',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/process/windows-npm-shim\\.ts$' },
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
