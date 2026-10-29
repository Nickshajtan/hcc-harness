import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined);
const reports = [
  ['Shared runtime contract', '.test-state/m22-runtime-contract.json'],
  ...(process.platform === 'win32'
    ? [['Windows bootstrap executable', '.test-state/m22-b1-executable.json']]
    : []),
];
const areas = reports.map(([area, file]) => {
  const report = read(file);
  const status = !report
    ? 'NOT TESTED'
    : report.success &&
        report.numPassedTests > 0 &&
        report.numFailedTests === 0 &&
        report.numPendingTests === 0
      ? 'PASS'
      : 'FAIL';
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
    stableInstallationB2: 'NOT TESTED',
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
  '\n\nShared contract includes real offline mise link/exec switching; PATH-switch simulation is a separate assertion. nvm/fnm, Windows ARM64 and B2 stable installation: **NOT TESTED**. Bootstrap entries are opt-in feasibility fixtures; production launchers remain unchanged.\n';
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (areas.some((row) => row.status !== 'PASS')) process.exitCode = 1;
