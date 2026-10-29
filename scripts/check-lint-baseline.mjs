import { ESLint } from 'eslint';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Source context, rather than line numbers or a total budget, identifies legacy debt.
// A multiset preserves repeated identical findings within a file.
export function fingerprints(results, root) {
  const entries = [];
  for (const result of results) {
    const lines = result.source?.split(/\r?\n/) ?? [];
    for (const message of result.messages) {
      if (1 !== message.severity) {
        continue;
      }
      const source = lines[message.line - 1];
      if (!message.ruleId || undefined === source) {
        throw new Error(`Cannot fingerprint warning in ${result.filePath}`);
      }
      entries.push(
        JSON.stringify({
          file: relative(root, result.filePath).replaceAll('\\', '/'),
          rule: message.ruleId,
          diagnostic: message.messageId ?? message.message,
          source: source.trim(),
        }),
      );
    }
  }
  return entries.sort();
}

export function compareWarnings(expected, actual) {
  const remaining = [...expected];
  const added = [];
  for (const finding of actual) {
    const index = remaining.indexOf(finding);
    if (-1 === index) {
      added.push(finding);
    } else {
      remaining.splice(index, 1);
    }
  }
  return { added, removed: remaining };
}

async function main() {
  const root = process.cwd();
  const baselinePath = 'eslint-warning-baseline.json';
  const expected = JSON.parse(await readFile(baselinePath, 'utf8'));
  if (!Array.isArray(expected) || !expected.every((value) => 'string' === typeof value)) {
    throw new Error('Invalid ESLint warning baseline');
  }
  const eslint = new ESLint();
  const results = await eslint.lintFiles(['.']);
  const actual = fingerprints(results, root);
  const delta = compareWarnings(expected, actual);
  const errors = results.reduce((total, result) => total + result.errorCount, 0);
  await mkdir('reports', { recursive: true });
  await writeFile(
    'reports/lint-warning-diff.json',
    JSON.stringify({ errors, warnings: actual.length, ...delta }, null, 2) + '\n',
  );
  if (errors || delta.added.length) {
    console.error(
      `Lint baseline FAIL: ${String(errors)} errors; ${String(delta.added.length)} new warnings`,
    );
    console.error(delta.added.join('\n'));
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--prune')) {
    await writeFile(baselinePath, JSON.stringify(actual, null, 2) + '\n');
  } else if (delta.removed.length) {
    console.error('Remove resolved debt with npm run lint:baseline:prune');
    process.exitCode = 1;
    return;
  }
  console.log(`Lint baseline PASS: ${String(actual.length)} known warnings; no new findings`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
