import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { mutationEvidence, enforceMutation, verifyMutationSources } from './check-mutation.mjs';

// Separately budgeted effect pilot. Full-source Windows and hosted POSIX
// measurements established the per-file assertion-only gates; no branch is excluded.
const report = JSON.parse(await readFile('reports/mutation-effects/mutation.json', 'utf8'));
const scopes = mutationEvidence(report);
const files = [
  'src/installation/setup.ts',
  'src/lifecycle/routing-plan.ts',
  'src/lifecycle/routing-files.ts',
  'src/lifecycle/recovery.ts',
  'src/lifecycle/removal.ts',
];
await verifyMutationSources(report, files);
enforceMutation(scopes, files);
const evidence = {
  measurement: 'PASS',
  numericTargetsEnforced: true,
  scopes: scopes.map((scope) => ({ ...scope, target: 85, targetMet: 85 <= scope.assertionScore })),
};
await mkdir('reports', { recursive: true });
await writeFile('reports/effects-mutation-results.json', JSON.stringify(evidence, null, 2) + '\n');
const summary = [
  '## Effect mutation pilot',
  '',
  'Measurement PASS. Every effect module enforces 85% assertion-only kills. Timeouts earn no assertion credit.',
  '',
  ...evidence.scopes.map(
    (scope) =>
      `- ${scope.file}: ${JSON.stringify(scope.counts)}; assertion-only ${scope.assertionScore.toFixed(2)}%; 85% target ${scope.targetMet ? 'met' : 'NOT MET'}.`,
  ),
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}
