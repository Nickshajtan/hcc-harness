import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  invokePublicationHelper,
  PublicationError,
} from '../../src/lifecycle/native-publication.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'arch-publication-process-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function driver(source: string) {
  const path = join(root, 'helper driver ユニコード & spaces.cjs');
  await writeFile(path, source);
  return path;
}
it('passes absolute paths and literal arguments without a shell', async () => {
  const target = join(root, 'literal & | % ! " value');
  const source = await driver(
    `if(process.argv[2]!==${JSON.stringify(target)})throw new Error('Argument changed');console.log('{"protocol":1,"win32":0}');`,
  );
  await invokePublicationHelper(process.execPath, source, target);
});
it('refuses PATH lookup for the helper', async () => {
  await expect(
    invokePublicationHelper('node', join(root, 'stage'), join(root, 'target')),
  ).rejects.toMatchObject({
    kind: 'invalid-input',
    outcome: 'not-published',
    message: 'Publication helper path must be absolute',
  });
});
it.each([
  ['malformed', `console.log('invalid output');`, 'protocol'],
  ['incompatible', `console.log('{"protocol":2,"win32":0}');`, 'protocol'],
  [
    'stderr',
    `console.log('{"protocol":1,"win32":0}');console.error('unexpected stderr');`,
    'protocol',
  ],
  ['exit mismatch', `console.log('{"protocol":1,"win32":0}');process.exitCode=2;`, 'execution'],
  ['output lost', `process.exitCode=3;`, 'execution'],
  ['oversized', `process.stdout.write('x'.repeat(8192));`, 'execution'],
] as const)('reports unknown completion for real helper %s', async (_name, program, kind) => {
  const source = await driver(program);
  const failure: unknown = await invokePublicationHelper(
    process.execPath,
    source,
    join(root, 'target'),
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(PublicationError);
  if (!(failure instanceof PublicationError)) {
    throw new Error('Expected protocol/transport error');
  }
  expect(failure).toMatchObject({ kind, outcome: 'unknown' });
  expect(failure.cause).toHaveProperty('stdout');
});
it('retains a definite OS refusal only when the helper reply and exit agree', async () => {
  const source = await driver(`console.log('{"protocol":1,"win32":183}');process.exitCode=1;`);
  await expect(
    invokePublicationHelper(process.execPath, source, join(root, 'target')),
  ).rejects.toMatchObject({ kind: 'collision', outcome: 'not-published', win32: 183 });
});
it('retains helper launch failure as unknown without inventing an OS publication error', async () => {
  await mkdir(join(root, 'not-executable'));
  await expect(
    invokePublicationHelper(
      join(root, 'not-executable'),
      join(root, 'stage'),
      join(root, 'target'),
    ),
  ).rejects.toMatchObject({ kind: 'execution', outcome: 'unknown' });
});
it('terminates and reports unknown outcome for an actual nonresponding helper', async () => {
  // The process is intentionally live until the adapter's deadline. Its own
  // 20-second guard also bounds a timeout-removal mutant; no timing proves success.
  const source = await driver(`setInterval(()=>{},1000);setTimeout(()=>process.exit(2),20000);`);
  const failure: unknown = await invokePublicationHelper(
    process.execPath,
    source,
    join(root, 'target'),
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(PublicationError);
  if (
    !(failure instanceof PublicationError) ||
    !failure.cause ||
    'object' !== typeof failure.cause
  ) {
    throw new Error('Expected timeout evidence');
  }
  expect(failure).toMatchObject({
    kind: 'execution',
    outcome: 'unknown',
    cause: { error: { killed: true, signal: 'SIGKILL' } },
  });
}, 30000);
