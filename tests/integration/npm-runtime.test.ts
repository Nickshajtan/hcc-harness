import { afterAll, beforeAll, expect, it } from 'vitest';
import { copyFile, mkdir, realpath, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { world, run, cli } from '../support.js';
import { requiredEnvironment } from '../support.js';

const windows = 'win32' === process.platform;
let fixture: Awaited<ReturnType<typeof world>>;
let pathNode: string, adjacentNode: string;
beforeAll(async () => {
  if (!windows) {
    return;
  }
  fixture = await world(await realpath(tmpdir()));
  const pathDir = join(fixture.root, 'project Node');
  await mkdir(pathDir);
  pathNode = join(pathDir, 'node.exe');
  adjacentNode = join(fixture.native, 'node.exe');
  await copyFile(process.execPath, pathNode);
  const script = join(fixture.native, 'tool.cjs');
  await writeFile(
    script,
    '#!/usr/bin/env node\nconsole.log(JSON.stringify({node:process.execPath,args:process.argv.slice(2),path:process.env.PATH,override:process.env.ARCH_NODE}));\n',
  );
  // Exercise the real cmd-shim implementation bundled with the npm invoking tests.
  const require = createRequire(requiredEnvironment('npm_execpath'));
  const binLinks = createRequire(require.resolve('bin-links'));
  const cmdShim = binLinks('cmd-shim') as (from: string, to: string) => Promise<void>;
  await cmdShim(script, join(fixture.native, 'standard'));
  await writeFile(join(fixture.native, 'simple.cmd'), '@echo off\r\nnode "%~dp0\\tool.cjs" %*\r\n');
});
afterAll(async () => {
  await fixture?.dispose();
});

function env() {
  return {
    ...fixture.env,
    PATH: [resolve(pathNode, '..'), fixture.native].join(delimiter),
    ARCH_NODE: 'Z:\\removed-arch-runtime\\node.exe',
  };
}
it.skipIf(!windows)('uses native PATH Node for simple npm shims and never ARCH_NODE', async () => {
  const environment = env();
  const result = await run(
    process.execPath,
    [cli, 'run', 'simple', '--', '', 'a"b', '%PATH% & | < > ^ !', '尾\\'],
    fixture.C,
    environment,
  );
  expect(result, result.stderr).toMatchObject({ code: 0 });
  expect(JSON.parse(result.stdout.trim())).toEqual({
    node: pathNode,
    args: ['', 'a"b', '%PATH% & | < > ^ !', '尾\\'],
    path: environment.PATH,
    override: environment.ARCH_NODE,
  });
});
it.skipIf(!windows)('uses PATH when a real standard npm shim has no adjacent Node', async () => {
  expect(await readFile(join(fixture.native, 'standard.cmd'), 'utf8')).toMatch(
    /IF EXIST.*node\.exe/i,
  );
  const result = await run(process.execPath, [cli, 'run', 'standard', '--'], fixture.C, env());
  expect(result, result.stderr).toMatchObject({ code: 0 });
  const output: unknown = JSON.parse(result.stdout.trim());
  expect(output).toMatchObject({ node: pathNode });
});
it.skipIf(!windows)('honors a real npm shim adjacent Node without changing PATH', async () => {
  await copyFile(process.execPath, adjacentNode);
  try {
    const environment = env();
    const result = await run(
      process.execPath,
      [cli, 'run', 'standard', '--'],
      fixture.C,
      environment,
    );
    expect(result, result.stderr).toMatchObject({ code: 0 });
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      node: adjacentNode,
      path: environment.PATH,
    });
    // A simple shim is not permitted to invent the adjacent-Node preference.
    const simple = await run(
      process.execPath,
      [cli, 'run', 'simple', '--'],
      fixture.C,
      environment,
    );
    expect(simple.code).toBe(0);
    const output: unknown = JSON.parse(simple.stdout.trim());
    expect(output).toMatchObject({ node: pathNode });
  } finally {
    const { unlink } = await import('node:fs/promises');
    await unlink(adjacentNode);
  }
});
it.skipIf(!windows)(
  'fails clearly with missing native Node instead of falling back to Arch Node',
  async () => {
    const result = await run(process.execPath, [cli, 'run', 'simple', '--'], fixture.C, {
      ...fixture.env,
      PATH: fixture.native,
      ARCH_NODE: process.execPath,
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Native npm CLI requires node.exe');
  },
);
