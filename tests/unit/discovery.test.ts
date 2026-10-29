import { afterEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile, chmod, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { discoverClis, defaultSelection } from '../../src/discovery.js';
import { routerMarker } from '../../src/process.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
it('discovers native candidates without executing them and filters marked routers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arch-discovery-'));
  roots.push(root);
  const native = join(root, 'native'),
    router = join(root, 'router');
  await mkdir(native);
  await mkdir(router);
  await writeFile(join(router, '.arch-router'), routerMarker);
  const extension = process.platform === 'win32' ? '.exe' : '';
  // Invalid executable content would fail if discovery tried to execute it.
  for (const directory of [native, router]) {
    const file = join(directory, 'custom' + extension);
    await writeFile(file, 'presence only');
    await chmod(file, 0o755);
  }
  const candidates = await discoverClis(
    root,
    { PATH: [router, native].join(delimiter), PATHEXT: '.EXE;.CMD' },
    [
      { command: 'custom', label: 'Custom catalogue extension' },
      { command: 'missing', label: 'Missing' },
    ],
  );
  expect(candidates).toEqual([
    {
      command: 'custom',
      label: 'Custom catalogue extension',
      available: true,
      executablePath: await realpath(join(native, 'custom' + extension)),
    },
    { command: 'missing', label: 'Missing', available: false },
  ]);
  expect(
    (await discoverClis(root, { PATH: router }, [{ command: 'custom', label: 'Custom' }]))[0]!
      .available,
  ).toBe(false);
});
it('defaults to installed claude/codex and retains existing custom selections', () => {
  const candidates = [
    { command: 'claude', label: 'Claude', available: true },
    { command: 'codex', label: 'Codex', available: false },
    { command: 'gemini', label: 'Gemini', available: true },
  ];
  expect(defaultSelection(candidates)).toEqual(['claude']);
  expect(defaultSelection(candidates, ['mytool'])).toEqual(['mytool']);
  expect(defaultSelection([])).toEqual([]);
});
