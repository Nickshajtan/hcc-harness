import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined);
const reports = [
  [
    'Stable installation and source relocation',
    '.test-state/m22-stable-contract.json',
    'STABLE_OUTCOME',
  ],
  ['Shared runtime contract', '.test-state/m22-runtime-contract.json', 'SHARED_OUTCOME'],
  ...('win32' === process.platform
    ? [['Windows bootstrap executable', '.test-state/m22-b1-executable.json', 'WINDOWS_OUTCOME']]
    : []),
];
const areas = reports.map(([area, file, outcome]) => {
  const report = read(file);
  let status = 'NOT TESTED';
  if (report) {
    const assertions = report.testResults?.flatMap((result) => result.assertionResults ?? []);
    const stableFiles = [
      'tests/unit/stable-install.test.ts',
      'tests/integration/stable-runtime.test.ts',
      'tests/integration/stable-interruption.test.ts',
    ];
    const completeStable =
      'Stable installation and source relocation' !== area ||
      stableFiles.every((expected) =>
        report.testResults?.some((result) => result.name?.replaceAll('\\', '/').endsWith(expected)),
      );
    const passed =
      'success' === process.env[outcome] &&
      true === report.success &&
      0 < report.numPassedTests &&
      0 === report.numFailedTests &&
      0 === report.numPendingTests &&
      report.numTotalTests === assertions?.length &&
      report.numPassedTests === assertions.filter((test) => 'passed' === test.status).length &&
      completeStable;
    status = passed ? 'PASS' : 'FAIL';
  }
  return {
    area,
    status,
    passed: report?.numPassedTests,
    failed: report?.numFailedTests,
    skipped: report?.numPendingTests,
    file,
  };
});
const tty = read('.test-state/m22-runtime-tty.json');
areas.push({
  area: 'Real terminal / keyboard / native Node 22',
  status: tty?.status ?? 'NOT TESTED',
});
const result = {
  platform: process.platform,
  archNode: process.version,
  commit: process.env.GITHUB_SHA,
  areas,
  limitations: {
    nvm: 'NOT TESTED',
    fnm: 'NOT TESTED',
    windowsArm64: 'NOT TESTED',
  },
};
mkdirSync('.test-state', { recursive: true });
writeFileSync('.test-state/m22-runtime-summary.json', JSON.stringify(result, null, 2));
const summary =
  `## M2.2 runtime portability — ${process.platform}\n\nArch runner: ${process.version}; commit: ${process.env.GITHUB_SHA ?? 'local'}\n\n| Area | Result |\n| --- | --- |\n` +
  areas
    .map(
      (row) =>
        `| ${row.area} | ${row.status} (${row.passed ?? '—'} passed; ${row.skipped ?? '—'} skipped) |`,
    )
    .join('\n') +
  '\n\nShared contract includes real offline mise link/exec switching; PATH-switch simulation is separate. Stable installation evidence uses controlled fixtures, never AI providers. nvm/fnm and Windows ARM64 execution remain **NOT TESTED**.\n';
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
if (areas.some((row) => 'PASS' !== row.status)) {
  process.exitCode = 1;
}
