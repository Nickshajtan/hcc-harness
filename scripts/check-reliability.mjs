import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Fixed profiles prevent an empty or truncated run from declaring itself complete.
export function validateReliability(reports) {
  const expected = new Set(['false:1', 'true:1', 'false:3', 'true:3']);
  if (!Array.isArray(reports) || 4 !== reports.length) {
    throw new Error('Expected all four first-attempt reliability profiles');
  }
  for (const report of reports) {
    const profile = `${String(report.interrupted)}:${String(report.lanes)}`;
    if (
      'boolean' !== typeof report.interrupted ||
      !expected.delete(profile) ||
      4 !== report.iterations ||
      false !== report.failed ||
      'completed' !== report.cleanup ||
      !Array.isArray(report.evidence)
    ) {
      throw new Error(`Incomplete or failing reliability profile: ${profile}`);
    }
    const stages = new Set();
    for (const entry of report.evidence) {
      if (
        !Number.isInteger(entry.lane) ||
        0 > entry.lane ||
        report.lanes <= entry.lane ||
        !Number.isInteger(entry.iteration) ||
        0 > entry.iteration ||
        4 <= entry.iteration ||
        !['initialize', 'native', 'uninstall'].includes(entry.stage) ||
        0 !== entry.code ||
        null !== entry.signal ||
        entry.interrupted !== report.interrupted
      ) {
        throw new Error(`Invalid first-attempt result: ${profile}`);
      }
      const identity = `${entry.lane}:${entry.iteration}:${entry.stage}`;
      if (stages.has(identity)) {
        throw new Error(`Duplicate attempt: ${identity}`);
      }
      stages.add(identity);
    }
    if (report.lanes * 4 * 3 !== stages.size) {
      throw new Error(`Missing expected operation: ${profile}`);
    }
  }
  return { status: 'PASS', profiles: 4, sequences: 32, attempts: 96 };
}

async function main() {
  const { readdir } = await import('node:fs/promises');
  const directory =
    process.argv[2] ?? process.env.ARCH_RELIABILITY_DIRECTORY ?? 'reports/uninstall-stress';
  const paths = await readdir(directory);
  const reports = await Promise.all(
    paths
      .filter((path) => path.endsWith('.json'))
      .map(async (path) => JSON.parse(await readFile(resolve(directory, path), 'utf8'))),
  );
  const result = validateReliability(reports);
  const testsPath = process.env.ARCH_RELIABILITY_TEST_REPORT;
  if (testsPath) {
    const tests = JSON.parse(await readFile(testsPath, 'utf8'));
    const assertions = tests.testResults?.flatMap((file) => file.assertionResults ?? []);
    if (
      true !== tests.success ||
      0 !== tests.numFailedTests ||
      !tests.numPassedTests ||
      !assertions?.some(
        (test) =>
          test.fullName.includes('links the existing CLI, dispatches help') &&
          'passed' === test.status,
      )
    ) {
      throw new Error('Missing or failing native npm help/test evidence');
    }
  }
  await mkdir('reports', { recursive: true });
  await writeFile('reports/reliability-results.json', JSON.stringify(result, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## First-attempt reliability\n\nPASS: ${result.sequences} sequences / ${result.attempts} operations; cleanup completed. Historical incident classification is separate.\n`,
    );
  }
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    // Replace a previous successful report when a workspace is reused. A failed
    // report write still fails the process and preserves the original diagnostic.
    try {
      await mkdir('reports', { recursive: true });
      await writeFile(
        'reports/reliability-results.json',
        JSON.stringify(
          {
            status: 'FAIL',
            error: String(error).slice(0, 4000),
          },
          null,
          2,
        ) + '\n',
      );
    } catch (reportError) {
      console.error('Unable to persist reliability failure:', reportError);
    }
    throw error;
  }
}
