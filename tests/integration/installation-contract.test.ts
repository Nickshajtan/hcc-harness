import { afterEach, expect, it } from 'vitest';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cli, run } from '../support.js';
import { stateFrom, digest } from '../../src/lifecycle/manifest.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it('built installation anchors launchers to dist/cli.js and lifecycle trusts the recorded bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arch-built-contract-'));
  roots.push(root);
  const env = { ...process.env, ARCH_ACTIVE: '' };
  const initialized = await run(process.execPath, [cli, 'init', 'tool'], root, env);
  expect(initialized, initialized.stderr).toMatchObject({ code: 0 });
  const state = stateFrom(await readFile(join(root, '.arch/bootstrap.json')));
  for (const [path, hash] of Object.entries(state.files)) {
    expect(digest(await readFile(join(root, path)))).toBe(hash);
  }
  const launcher = await readFile(
    join(root, 'win32' === process.platform ? '.arch/bin/tool.shim' : '.arch/bin/tool'),
    'utf8',
  );
  expect(launcher).toContain(cli);
  expect(launcher).not.toContain(join('installation', 'cli.js'));
  if ('win32' === process.platform) {
    expect(await readFile(join(root, '.arch/bin/tool.exe'))).toEqual(
      await readFile(resolve(`vendor/shim-${process.arch}.exe`)),
    );
    expect(launcher).toBe(`path = ${process.execPath}\nargs = "${cli}" run tool --\n`);
  } else {
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
    expect(launcher).toBe(
      `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(cli)} run 'tool' -- "$@"\n`,
    );
  }
  const edited = 'schema=1\n# user middleware remains authoritative\nmiddleware=[]\n';
  await writeFile(join(root, '.arch/harness.toml'), edited);
  const configured = await run(process.execPath, [cli, 'configure', 'tool', 'added'], root, env);
  expect(configured, configured.stderr).toMatchObject({ code: 0 });
  expect(
    await readFile(
      join(root, 'win32' === process.platform ? '.arch/bin/tool.shim' : '.arch/bin/tool'),
      'utf8',
    ),
  ).toBe(launcher);
  expect((await run(process.execPath, [cli, 'deinit', '--yes'], root, env)).code).toBe(0);
  expect(await readFile(join(root, '.arch/harness.toml'), 'utf8')).toBe(edited);
  await expect(readFile(join(root, '.arch/bootstrap.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
