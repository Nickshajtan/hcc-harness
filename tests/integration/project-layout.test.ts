import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { configurationDirectories } from '../../src/config.js';
import { cli, mise, run, world, records } from '../support.js';

let f: Awaited<ReturnType<typeof world>>;
beforeAll(async () => {
  f = await world();
});
afterAll(async () => {
  await f?.dispose();
});

it.each(configurationDirectories)(
  'executes native routes, explicit run and mise from %s',
  async (directory) => {
    const project = join(f.root, `layout-${String(configurationDirectories.indexOf(directory))}`);
    await mkdir(project);
    const initialized = await run(
      process.execPath,
      [cli, 'init', 'claude', '--config-dir', directory],
      project,
      f.env,
    );
    expect(initialized.code, initialized.stderr).toBe(0);
    const bin = join(project, directory, 'bin');
    const env = { ...f.env, PATH: [bin, f.env.PATH].join(delimiter) };
    const launcher = join(bin, 'win32' === process.platform ? 'claude.exe' : 'claude');
    const args = ['', 'space value', 'quoted"value', 'trailing\\'];
    const log = join(project, 'native.jsonl');
    const routed = await run(launcher, args, project, { ...env, FAKE_LOG: log, FAKE_EXIT: '7' });
    expect(routed.code, routed.stderr).toBe(7);
    expect(routed.stderr).toContain('native stderr');
    expect(await records(log)).toMatchObject([{ args, cwd: project }]);
    const explicit = await run(
      process.execPath,
      [cli, 'run', 'claude', '--', '--version'],
      project,
      env,
    );
    expect(explicit.code, explicit.stderr).toBe(0);
    const activated = await run(mise, ['exec', '--', 'claude', '--version'], project, f.env);
    expect(activated.code, activated.stderr).toBe(0);
    const nested = join(project, 'src');
    await mkdir(nested);
    const status = await run(process.execPath, [cli, 'status', '--json'], nested, env);
    expect(status.code, status.stderr).toBe(0);
    expect(status.stdout).toContain('"state": "initialized"');
    const changed = await run(process.execPath, [cli, 'route', 'add', 'codex'], nested, env);
    expect(changed.code, changed.stderr).toBe(0);
    await writeFile(
      join(project, directory, 'harness.toml'),
      'schema=1\nmiddleware=[]\n# user owned\n',
    );
    const removed = await run(process.execPath, [cli, 'deinit', '--yes'], nested, env);
    expect(removed.code, removed.stderr).toBe(0);
    expect(await readFile(join(project, directory, 'harness.toml'), 'utf8')).toContain(
      '# user owned',
    );
    if ('.arch' !== directory) {
      expect(await readdir(project)).not.toContain('.arch');
    }
  },
);

it('switches projects with stale alternate-home launchers and unactivated shells', async () => {
  const first = join(f.root, 'switch-first');
  const second = join(f.root, 'switch-second');
  await mkdir(first);
  await mkdir(second);
  for (const [project, directory] of [
    [first, '.hcc'],
    [second, '.ai/arch'],
  ]) {
    const initialized = await run(
      process.execPath,
      [cli, 'init', 'claude', '--config-dir', directory!],
      project!,
      f.env,
    );
    expect(initialized.code, initialized.stderr).toBe(0);
  }
  await writeFile(
    join(first, '.hcc/harness.toml'),
    'schema=1\n[[middleware]]\nid="demo"\nenabled=true\n',
  );
  const launcher = join(first, '.hcc/bin', 'win32' === process.platform ? 'claude.exe' : 'claude');
  const env = {
    ...f.env,
    PATH: [join(first, '.hcc/bin'), join(second, '.ai/arch/bin'), f.env.PATH].join(delimiter),
  };
  const log = join(f.root, 'switch-native.jsonl');
  const inFirst = await run(launcher, ['first'], first, { ...env, FAKE_LOG: log });
  expect(inFirst.code, inFirst.stderr).toBe(0);
  const inSecond = await run(launcher, ['second'], second, { ...env, FAKE_LOG: log });
  expect(inSecond.code, inSecond.stderr).toBe(0);
  const outside = await run(launcher, ['outside'], f.C, { ...env, FAKE_LOG: log });
  expect(outside.code, outside.stderr).toBe(0);
  expect(await records(log)).toMatchObject([
    { args: ['first'], cwd: first, demo: '1' },
    { args: ['second'], cwd: second, demo: '' },
    { args: ['outside'], cwd: f.C, demo: '' },
  ]);
});
