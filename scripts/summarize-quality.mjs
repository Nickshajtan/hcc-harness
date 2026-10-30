import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { mutationEvidence, enforceMutation, pilots } from './check-mutation.mjs';

const results = {};
const details = [];
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
async function area(name, outcome, measure) {
  if ('skipped' === outcome) {
    results[name] = 'NOT TESTED';
    return;
  }
  if ('success' !== outcome) {
    results[name] = 'FAIL';
    return;
  }
  try {
    await measure();
    results[name] = 'PASS';
  } catch (error) {
    results[name] = 'FAIL';
    console.error(`${name}: ${String(error)}`);
    process.exitCode = 1;
  }
}
await area('lint', process.env.LINT_OUTCOME, async () => {
  const lint = await read('reports/lint.json');
  const delta = await read('reports/lint-warning-diff.json');
  if (!Array.isArray(lint) || !lint.length || 0 !== delta.errors || delta.added.length) {
    throw new Error('Missing or failing lint evidence');
  }
  details.push(`Lint: ${String(delta.warnings)} legacy warnings; no new fingerprints.`);
  const hotspots = lint.flatMap((file) =>
    file.messages.filter((message) =>
      ['complexity', 'max-depth', 'max-params', 'max-lines-per-function'].includes(message.ruleId),
    ),
  );
  details.push(`Complexity review findings: ${String(hotspots.length)} (see lint.json).`);
});
await area('dependencies', process.env.DEPENDENCY_OUTCOME, async () => {
  const graph = await read('reports/dependencies.json');
  if (!graph.modules?.length || graph.summary?.error) {
    throw new Error('Missing or failing dependency evidence');
  }
});
await area('coverage', process.env.COVERAGE_OUTCOME, async () => {
  const coverage = await read('coverage/coverage-summary.json');
  const tests = await read('coverage/tests.json');
  if (
    !tests.success ||
    tests.numFailedTests ||
    !tests.numPassedTests ||
    !coverage.total?.lines?.total
  ) {
    throw new Error('Missing or failing coverage/test evidence');
  }
  details.push(
    `Coverage: lines ${String(coverage.total.lines.pct)}%; branches ${String(coverage.total.branches.pct)}%. Tests: ${String(tests.numPassedTests)} passed / ${String(tests.numPendingTests)} skipped.`,
  );
});
await area('mutation', process.env.MUTATION_OUTCOME, async () => {
  for (const pilot of Object.values(pilots)) {
    const scopes = mutationEvidence(await read(pilot.report));
    enforceMutation(scopes, pilot.files);
    details.push(
      ...scopes.map(
        (scope) =>
          `${scope.file}: ${JSON.stringify(scope.counts)}; score ${scope.score.toFixed(2)}%; assertion-only ${scope.assertionScore.toFixed(2)}%.`,
      ),
    );
  }
});
await mkdir('reports', { recursive: true });
await writeFile(
  'reports/quality-results.json',
  JSON.stringify({ results, details }, null, 2) + '\n',
);
const lines = [
  '## Quality evidence',
  '',
  '| Area | Status |',
  '| --- | --- |',
  ...Object.entries(results).map(([name, status]) => `| ${name} | ${status} |`),
  '',
  ...details.map((detail) => `- ${detail}`),
  '',
  'Timeouts are not assertion kills. CLI subprocess contracts remain separate from in-process V8 coverage. Core, lifecycle decision and process scopes enforce assertion-only mutation gates; remaining global coverage targets are measured debt.',
];
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
console.log(lines.join('\n'));
if (Object.values(results).includes('FAIL')) {
  process.exitCode = 1;
}
