import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { access, readFile, open, mkdtemp, mkdir, writeFile, rm, chmod } from 'node:fs/promises';
import { resolve, join, delimiter } from 'node:path';
import { launch, nativeEnvironment, resolveExecutable } from '../../src/process.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    access: vi.fn(actual.access),
    readFile: vi.fn(actual.readFile),
    open: vi.fn(actual.open),
  };
});
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    throw new Error('Unexpected spawn');
  }),
}));
const platform = Object.getOwnPropertyDescriptor(process, 'platform');
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
let root: string;
beforeEach(async () => {
  vi.mocked(access).mockReset().mockImplementation(actual.access);
  vi.mocked(readFile).mockReset().mockImplementation(actual.readFile);
  vi.mocked(open).mockReset().mockImplementation(actual.open);
  await mkdir('.test-state', { recursive: true });
  root = await mkdtemp(resolve('.test-state/process-failure-'));
});
afterEach(async () => {
  if (platform) {
    Object.defineProperty(process, 'platform', platform);
  }
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
it('preserves unexpected code-less marker failures by identity', async () => {
  const error = new Error('marker read failed without errno');
  vi.mocked(readFile).mockRejectedValueOnce(error);
  await expect(nativeEnvironment({ PATH: root }, root)).rejects.toBe(error);
});
it('preserves unexpected code-less executable access failures by identity', async () => {
  const error = new Error('executable access failed without errno');
  vi.mocked(access).mockRejectedValueOnce(error);
  await expect(resolveExecutable('tool', root, { PATH: root })).rejects.toBe(error);
});
it('retains a non-directory PATH entry when marker lookup returns ENOTDIR', async () => {
  vi.mocked(readFile).mockRejectedValueOnce(
    Object.assign(new Error('not a directory'), { code: 'ENOTDIR' }),
  );
  await expect(nativeEnvironment({ PATH: root }, root)).resolves.toEqual({ PATH: root });
});
it.each(['ENOENT', 'EACCES', 'ENOTDIR'])('continues ordered lookup for %s', async (code) => {
  const native = join(root, 'native');
  await mkdir(native);
  const target = join(native, 'win32' === process.platform ? 'tool.exe' : 'tool');
  await writeFile(target, 'native fixture');
  await chmod(target, 0o755);
  vi.mocked(access).mockRejectedValueOnce(Object.assign(new Error('lookup miss'), { code }));
  await expect(
    resolveExecutable('tool', root, { PATH: [root, native].join(delimiter) }),
  ).resolves.toBe(target);
});
it.each(['EIO', 'EPERM', 'EBUSY'])('does not treat %s as a lookup miss', async (code) => {
  const error = Object.assign(new Error('unexpected candidate failure'), { code });
  vi.mocked(access).mockRejectedValueOnce(error);
  await expect(resolveExecutable('tool', root, { PATH: root })).rejects.toBe(error);
});
it('closes the real shebang file handle exactly once before refusing a non-Node target', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  const script = join(root, 'tool.cjs');
  const shim = join(root, 'tool.cmd');
  await writeFile(script, '#!/bin/sh\n');
  await writeFile(shim, '@echo off\r\nnode "%~dp0\\tool.cjs" %*\r\n');
  const handle = await actual.open(script, 'r');
  const close = vi.spyOn(handle, 'close');
  vi.mocked(open).mockResolvedValueOnce(handle);
  try {
    await expect(launch(shim, [], root, {}, new AbortController().signal)).rejects.toThrow(
      'npm shim target must be a Node script or native executable',
    );
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    await handle.close();
  }
});
it.each([undefined, 'EACCES'])(
  'does not turn adjacent Node access failure %s into PATH fallback',
  async (code) => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const script = join(root, 'tool.cjs');
    const shim = join(root, 'tool.cmd');
    await writeFile(script, '#!/usr/bin/env node\n');
    await writeFile(
      shim,
      '@echo off\r\nIF EXIST "%~dp0\\node.exe" (\r\n)\r\nnode "%~dp0\\tool.cjs" %*\r\n',
    );
    const error = Object.assign(new Error('adjacent Node access failed'), { code });
    vi.mocked(access).mockRejectedValueOnce(error);
    await expect(launch(shim, [], root, { PATH: root }, new AbortController().signal)).rejects.toBe(
      error,
    );
  },
);
