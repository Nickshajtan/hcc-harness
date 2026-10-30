import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { launch, routerMarker } from '../../src/process.js';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));
const platform = Object.getOwnPropertyDescriptor(process, 'platform');
let root: string;
let native: string;
let shim: string;
beforeEach(async () => {
  await mkdir('.test-state', { recursive: true });
  root = await mkdtemp(resolve('.test-state/npm-shim-'));
  native = join(root, 'native');
  await mkdir(native);
  shim = join(root, 'tool.cmd');
  spawn.mockReset().mockImplementation(() => {
    const child = new EventEmitter();
    return Object.assign(child, { exitCode: 0, signalCode: null });
  });
  // Decision simulation exercises adapter branches on every host. Actual Windows
  // npm/console execution remains covered by integration and portability jobs.
  Object.defineProperty(process, 'platform', { value: 'win32' });
});
afterEach(async () => {
  if (platform) {
    Object.defineProperty(process, 'platform', platform);
  }
  await rm(root, { recursive: true, force: true });
});
async function script(shebang = '#!/usr/bin/env node') {
  await writeFile(join(root, 'tool.cjs'), shebang + '\n');
  await writeFile(shim, '@echo off\r\nnode "%~dp0\\tool.cjs" %*\r\n');
}
function run(env: NodeJS.ProcessEnv = { PATH: native }) {
  return launch(shim, ['', 'a"b', '%PATH% & |', 'tail\\'], root, env, new AbortController().signal);
}
it.each(['#!/usr/bin/env node', '#!/usr/bin/node', '#! node.exe', '#!C:\\runtime\\node.exe'])(
  'accepts supported Node shebang %s and uses native PATH',
  async (shebang) => {
    await script(shebang);
    const node = join(native, 'node.exe');
    await writeFile(node, 'native runtime');
    const env = { PATH: native, ARCH_NODE: 'removed-arch-runtime', EMPTY: '' };
    expect(await run(env)).toEqual({ exitCode: 0, signal: null });
    expect(spawn).toHaveBeenCalledExactlyOnceWith(
      await realpath(node),
      [join(root, 'tool.cjs'), '', 'a"b', '%PATH% & |', 'tail\\'],
      { cwd: root, env, stdio: 'inherit', shell: false },
    );
  },
);
it.each(['#!/bin/sh', '', '#!/usr/bin/env node --inspect', '#!/usr/bin/env nodejs'])(
  'rejects unsupported target shebang %s before spawning',
  async (shebang) => {
    await script(shebang);
    await expect(run()).rejects.toThrow(
      'npm shim target must be a Node script or native executable',
    );
    expect(spawn).not.toHaveBeenCalled();
  },
);
it('does not fall back to Arch runtime when native PATH has no Node', async () => {
  await script();
  try {
    await run({ PATH: native, ARCH_NODE: process.execPath });
    throw new Error('Expected native runtime refusal');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw error;
    }
    expect(error.message).toContain('Native npm CLI requires node.exe on its own PATH');
    expect(error.cause).toBeInstanceOf(Error);
  }
  expect(spawn).not.toHaveBeenCalled();
});
it('refuses a recursive router target', async () => {
  await script();
  await writeFile(join(root, '.arch-router'), routerMarker);
  await expect(run()).rejects.toThrow('Recursive npm shim target refused');
  expect(spawn).not.toHaveBeenCalled();
});
it('preserves native exe/com shim targets without selecting Node', async () => {
  for (const extension of ['exe', 'com']) {
    const target = join(root, `tool.${extension}`);
    await writeFile(target, 'native');
    await writeFile(shim, `@echo off\r\n"%~dp0\\tool.${extension}" %*\r\n`);
    await run();
    expect(spawn).toHaveBeenLastCalledWith(
      await realpath(target),
      ['', 'a"b', '%PATH% & |', 'tail\\'],
      { cwd: root, env: { PATH: native }, stdio: 'inherit', shell: false },
    );
  }
});
it('rejects arbitrary batch files before invoking a shell', async () => {
  await expect(
    launch(join(root, 'tool.bat'), [], root, {}, new AbortController().signal),
  ).rejects.toThrow('Arbitrary batch scripts require a shell and are unsupported');
  await writeFile(shim, '@echo off\r\necho not an npm shim\r\n');
  await expect(run()).rejects.toThrow();
  expect(spawn).not.toHaveBeenCalled();
});
it('checks cancellation again after asynchronous shim preparation', async () => {
  await script();
  await writeFile(join(native, 'node.exe'), 'native runtime');
  const controller = new AbortController();
  const result = launch(shim, [], root, { PATH: native }, controller.signal);
  const reason = new Error('cancelled during preparation');
  controller.abort(reason);
  await expect(result).rejects.toBe(reason);
  expect(spawn).not.toHaveBeenCalled();
});

async function standardShim() {
  await writeFile(join(native, 'tool.cjs'), '#!/usr/bin/env node\n');
  await writeFile(
    shim,
    '@echo off\r\nIF EXIST "%~dp0\\node.exe" (\r\n)\r\nnode "%~dp0\\native/tool.cjs" %*\r\n',
  );
}
it('prefers adjacent Node only for standard npm shims and falls back when absent', async () => {
  await standardShim();
  const pathNode = join(native, 'node.exe');
  const adjacent = join(root, 'node.exe');
  await writeFile(pathNode, 'PATH runtime');
  await run();
  expect(spawn.mock.calls.at(-1)?.[0]).toBe(await realpath(pathNode));
  await writeFile(adjacent, 'adjacent runtime');
  await run();
  expect(spawn.mock.calls.at(-1)?.[0]).toBe(await realpath(adjacent));
  await script();
  await run();
  expect(spawn.mock.calls.at(-1)?.[0]).toBe(await realpath(pathNode));
});
it('rejects adjacent directories and router-marked adjacent runtimes', async () => {
  await standardShim();
  const adjacent = join(root, 'node.exe');
  await mkdir(adjacent);
  await expect(run()).rejects.toThrow('Recursive or invalid adjacent npm Node runtime refused');
  await rm(adjacent, { recursive: true });
  await writeFile(adjacent, 'runtime');
  await writeFile(join(root, '.arch-router'), routerMarker);
  await expect(run()).rejects.toThrow('Recursive or invalid adjacent npm Node runtime refused');
  expect(spawn).not.toHaveBeenCalled();
});
