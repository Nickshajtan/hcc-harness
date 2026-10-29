import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const pilots = {
  config: { report: 'reports/mutation/mutation.json', files: ['src/config.ts'] },
  core: {
    report: 'reports/mutation-core/mutation.json',
    files: ['src/core.ts', 'src/middleware.ts', 'src/events.ts'],
  },
};

export function mutationEvidence(report) {
  if (!report?.files || 'object' !== typeof report.files) {
    throw new Error('Missing mutation files');
  }
  const scopes = [];
  for (const [file, result] of Object.entries(report.files)) {
    if (!Array.isArray(result.mutants) || !result.mutants.length) {
      throw new Error(`No mutants reported for ${file}`);
    }
    const counts = {
      Killed: 0,
      Survived: 0,
      NoCoverage: 0,
      Timeout: 0,
      CompileError: 0,
      RuntimeError: 0,
      Ignored: 0,
    };
    for (const mutant of result.mutants) {
      if (!Object.hasOwn(counts, mutant.status)) {
        throw new Error(`Unknown mutation status: ${String(mutant.status)}`);
      }
      counts[mutant.status]++;
    }
    const total = result.mutants.length;
    if (counts.CompileError || counts.RuntimeError || counts.Ignored) {
      throw new Error(`Mutation errors or exclusions require review: ${file}`);
    }
    scopes.push({
      file,
      total,
      counts,
      score: (100 * (counts.Killed + counts.Timeout)) / total,
      assertionScore: (100 * counts.Killed) / total,
    });
  }
  if (!scopes.length) {
    throw new Error('Empty mutation report');
  }
  return scopes;
}

export function enforceMutation(scopes, expectedFiles = []) {
  for (const file of expectedFiles) {
    if (!scopes.some((scope) => scope.file.replaceAll('\\', '/') === file)) {
      throw new Error(`Missing mutation scope: ${file}`);
    }
  }
  // Reviewed scopes have reached these targets. Core remains a measured gap.
  const minimum = { 'src/config.ts': 90, 'src/events.ts': 95, 'src/middleware.ts': 85 };
  for (const scope of scopes) {
    const target = minimum[scope.file.replaceAll('\\', '/')];
    if (undefined !== target && scope.assertionScore < target) {
      throw new Error(
        `${scope.file}: assertion kills ${scope.assertionScore.toFixed(2)}% below ${String(target)}%`,
      );
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const reports = process.argv.slice(2);
  if (!reports.length) {
    throw new Error('Specify at least one mutation JSON report');
  }
  for (const name of reports) {
    const pilot = pilots[name];
    if (!pilot) {
      throw new Error(`Unknown mutation pilot: ${name}`);
    }
    const scopes = mutationEvidence(JSON.parse(await readFile(pilot.report, 'utf8')));
    enforceMutation(scopes, pilot.files);
    console.log(JSON.stringify(scopes));
  }
}
