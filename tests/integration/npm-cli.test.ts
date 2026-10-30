import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdir, readFile, readdir, realpath, writeFile, access } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { cli, records, run, start, world, type Result } from '../support.js';

let fixture: Awaited<ReturnType<typeof world>>;
let prefix: string, executable: string, env: NodeJS.ProcessEnv;
const repository = process.cwd();
// Invoke npm's own JS entry to avoid shell quoting and host-global configuration.
const npm = process.env.npm_execpath!;
beforeAll(async () => {
  fixture = await world(tmpdir());
  prefix = join(fixture.root, 'npm-prefix');
  await mkdir(prefix);
  env = {
    ...fixture.env,
    npm_config_prefix: prefix,
    npm_config_cache: join(fixture.root, 'npm-cache'),
    npm_config_userconfig: join(fixture.root, 'npmrc'),
    npm_config_globalconfig: join(fixture.root, 'global-npmrc'),
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_offline: 'true',
    npm_config_ignore_scripts: 'true',
  };
  await writeFile(join(fixture.C, 'sentinel.txt'), 'unchanged');
  const linked = await run(process.execPath, [npm, 'link'], repository, env);
  expect(linked.code, linked.stderr).toBe(0);
  executable = join(prefix, 'win32' === process.platform ? 'arch.ps1' : 'bin/arch');
  env.PATH = ['win32' === process.platform ? prefix : join(prefix, 'bin'), env.PATH].join(
    delimiter,
  );
});
afterAll(async () => {
  await fixture?.dispose();
});

async function arch(
  args: string[],
  cwd = fixture.A,
  overrides: NodeJS.ProcessEnv = {},
  stdin = '',
) {
  if ('win32' !== process.platform) {
    return run(executable, args, cwd, { ...env, ...overrides }, stdin);
  }
  // These fixtures use cmd-safe values; literal metacharacter forwarding remains
  // covered by the direct-Node execution tests. Pass cmd's raw command line so
  // Node's normal Windows argv quoting cannot escape cmd's outer quote pair.
  const values = [join(prefix, 'arch.cmd'), ...args];
  for (const value of values) {
    expect(value).not.toMatch(/["%&|<>^!\r\n]/);
  }
  const command = `"${values.map((value) => `"${value}"`).join(' ')}"`;
  return new Promise<Result>((done, reject) => {
    const child = spawn(process.env.ComSpec!, ['/d', '/s', '/c', command], {
      cwd,
      env: { ...env, ...overrides },
      windowsVerbatimArguments: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf8');
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf8');
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      done({ code, signal, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}

it('links the existing CLI, dispatches help, and leaves the target project untouched', async () => {
  expect(await readFile(executable, 'utf8')).toContain(
    'win32' === process.platform ? 'cli.js' : '#!/usr/bin/env node',
  );
  if ('win32' !== process.platform) {
    expect(await realpath(executable)).toBe(await realpath(cli));
  }
  const linked = await arch(['--help'], fixture.C);
  const direct = await run(process.execPath, [cli, '--help'], fixture.C, env);
  expect(linked.code, linked.stderr).toBe(0);
  expect(linked.stdout).toBe(direct.stdout);
  if ('win32' === process.platform) {
    const powershell = await run(
      join(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        executable,
        '--help',
      ],
      fixture.C,
      env,
    );
    expect(powershell.code, powershell.stderr).toBe(0);
    expect(powershell.stdout).toBe(direct.stdout);
  }
  expect(await readdir(fixture.C)).toEqual(['sentinel.txt']);
});

it('keeps explicit initialization and reserves the arch executable name', async () => {
  expect((await arch(['init'])).code).toBe(2);
  expect((await arch(['init', 'arch'])).code).toBe(1);
  expect((await arch(['init', 'claude', 'codex'])).code).toBe(0);
});

it('dispatches deterministic reconciliation through the npm executable', async () => {
  expect((await arch(['configure', 'claude', 'codex'])).code).toBe(0);
  expect((await arch(['route', 'remove', 'codex'])).code).toBe(0);
  expect((await arch(['route', 'add', 'codex'])).code).toBe(0);
  expect((await arch(['route', 'list'])).stdout.trim().split(/\r?\n/)).toEqual(['claude', 'codex']);
});

it('retains non-interactive confirmation and prevents recursive route creation', async () => {
  expect(JSON.parse((await arch(['status', '--json'])).stdout).state).toBe('initialized');
  expect((await arch(['deinit'])).code).toBe(2);
  const before = await readFile(join(fixture.A, '.arch/bootstrap.json'));
  expect((await arch(['route', 'add', 'arch'])).code).toBe(1);
  expect(await readFile(join(fixture.A, '.arch/bootstrap.json'))).toEqual(before);
  expect(
    (await readdir(join(fixture.A, '.arch/bin'))).some((name) => /^arch(?:\.|$)/i.test(name)),
  ).toBe(false);
});

it('forwards native arguments, stdin and exit status identically and keeps project routing usable', async () => {
  const args = ['space value', 'unicode-λ', '--flag=value', 'semi;colon'];
  const log = join(fixture.A, 'calls.jsonl');
  const overrides = { FAKE_EXIT: '7', FAKE_STDIN: '1', FAKE_LOG: log };
  const linked = await arch(['run', 'claude', '--', ...args], fixture.A, overrides, 'input\n');
  const direct = await run(
    process.execPath,
    [cli, 'run', 'claude', '--', ...args],
    fixture.A,
    { ...env, ...overrides },
    'input\n',
  );
  expect(linked.code, linked.stderr).toBe(7);
  expect(direct.code).toBe(7);
  expect((await records(log)).map((record) => record.args)).toEqual([args, args]);
  expect(linked.stdout).toContain('input');
  expect(direct.stdout).toContain('input');
  const routed = await run('claude', ['project-route'], fixture.A, {
    ...env,
    PATH: [join(fixture.A, '.arch/bin'), env.PATH].join(delimiter),
  });
  expect(routed.code, routed.stderr).toBe(0);
  expect(routed.stderr).toContain('[arch:demo]');
  expect(
    (
      await arch(['--help'], fixture.A, {
        PATH: [join(fixture.A, '.arch/bin'), env.PATH].join(delimiter),
      })
    ).code,
  ).toBe(0);
});

it.skipIf('win32' === process.platform)(
  'forwards signals through the npm-linked executable',
  async () => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const invocation = start(executable, ['run', 'claude', '--'], fixture.A, {
        ...env,
        FAKE_WAIT: '1',
      });
      try {
        const deadline = Date.now() + 10000;
        while (!invocation.output().stdout.includes('"pid":')) {
          if (Date.now() > deadline) {
            throw new Error('Native startup timeout');
          }
          await new Promise((done) => setTimeout(done, 20));
        }
        invocation.child.kill(signal);
        const result = await invocation.result;
        expect(result.code).toBe('SIGINT' === signal ? 130 : 143);
        expect(result.stderr).toContain('[arch:demo] cleanup');
      } finally {
        invocation.child.kill('SIGKILL');
      }
    }
  },
);

it('deinitializes independently, retains legacy uninstall, and unlink preserves project configuration', async () => {
  expect((await arch(['deinit', '--yes'])).code).toBe(0);
  expect((await arch(['--help'])).code).toBe(0);
  expect((await arch(['init', 'claude'])).code).toBe(0);
  const legacy = await arch(['uninstall']);
  expect(legacy.code).toBe(0);
  expect(legacy.stderr).toContain('deprecated');
  expect((await arch(['init', 'claude'])).code).toBe(0);
  const files = ['.arch/bootstrap.json', '.arch/harness.toml', '.config/mise/conf.d/arch.toml'];
  const before = await Promise.all(files.map((file) => readFile(join(fixture.A, file))));
  const unlinked = await run(
    process.execPath,
    [npm, 'unlink', '--global', 'arch-harness'],
    fixture.C,
    env,
  );
  expect(unlinked.code, unlinked.stderr).toBe(0);
  await expect(access(executable)).rejects.toThrow();
  expect(await Promise.all(files.map((file) => readFile(join(fixture.A, file))))).toEqual(before);
  expect(await readFile(join(fixture.C, 'sentinel.txt'), 'utf8')).toBe('unchanged');
  expect(await readdir(fixture.C)).toEqual(['sentinel.txt']);
  expect((await run(process.execPath, [cli, '--help'], fixture.A, env)).code).toBe(0);
  const routed = await run('claude', [], fixture.A, {
    ...env,
    PATH: [join(fixture.A, '.arch/bin'), env.PATH].join(delimiter),
  });
  expect(routed.code, routed.stderr).toBe(0);
});
