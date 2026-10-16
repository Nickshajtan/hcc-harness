import { beforeAll, afterAll, expect, it } from 'vitest';
import { writeFile, readFile, mkdir, unlink, copyFile, rename, chmod } from 'node:fs/promises';
import { join, dirname, delimiter } from 'node:path';
import { world, events, records, run, start, cli, mise } from '../support.js';

let fixture: Awaited<ReturnType<typeof world>>;
beforeAll(async () => { fixture = await world(); expect(await fixture.init(fixture.A)).toMatchObject({ code: 0 }); });
afterAll(async () => { await fixture?.dispose(); });

it('bootstrap is idempotent, preserves existing user files, and supports arbitrary executable names', async () => {
  const routes = join(fixture.A, '.config/mise/conf.d/arch.toml');
  const initial = await readFile(routes, 'utf8');
  expect(await fixture.init(fixture.A)).toMatchObject({ code: 0 });
  expect(await readFile(routes, 'utf8')).toBe(initial);
  await writeFile(join(fixture.B, 'mise.toml'), '# user settings\n[env]\nUSER_SETTING = "kept"\n');
  await mkdir(join(fixture.B, '.arch'));
  const customHarness = 'schema=1\nmiddleware=[]\n';
  await writeFile(join(fixture.B, '.arch/harness.toml'), customHarness);
  const extension = process.platform === 'win32' ? '.exe' : '';
  await copyFile(join(fixture.native, 'codex' + extension), join(fixture.native, 'arbitrary' + extension));
  expect(await fixture.init(fixture.B, ['arbitrary'])).toMatchObject({ code: 0 });
  expect((await fixture.invoke(fixture.B, 'arbitrary')).code).toBe(0);
  expect(await readFile(join(fixture.B, 'mise.toml'), 'utf8')).toContain('# user settings');
  expect(await run(process.execPath, [cli, 'uninstall'], fixture.B, fixture.env)).toMatchObject({ code: 0 });
  expect(await readFile(join(fixture.B, '.arch/harness.toml'), 'utf8')).toBe(customHarness);
  expect(await fixture.init(fixture.B, ['node'])).toMatchObject({ code: 1 });
});

it('refuses modified managed files before uninstall and preserves edited harness configuration', async () => {
  const project = join(fixture.root, 'owned-files'); await mkdir(project);
  expect(await fixture.init(project)).toMatchObject({ code: 0 });
  const route = join(project, '.config/mise/conf.d/arch.toml');
  const original = await readFile(route, 'utf8');
  await writeFile(route, original + '# user edit\n');
  const refused = await run(process.execPath, [cli, 'uninstall'], project, fixture.env);
  expect(refused.code).toBe(1);
  expect(await readFile(join(project, '.arch/bootstrap.json'), 'utf8')).toContain('files');
  expect(await readFile(route, 'utf8')).toContain('# user edit');
  await writeFile(route, original);
  await writeFile(join(project, '.arch/harness.toml'), 'schema=1\nmiddleware=[]\n');
  expect(await run(process.execPath, [cli, 'uninstall'], project, fixture.env)).toMatchObject({ code: 0 });
  expect(await readFile(join(project, '.arch/harness.toml'), 'utf8')).toContain('middleware=[]');
  expect(await run(process.execPath, [cli, 'uninstall'], project, fixture.env)).toMatchObject({ code: 0 });
  expect(await fixture.init(project)).toMatchObject({ code: 0 });
});

it('resumes interrupted uninstall through the CLI and restores native command routing', async () => {
  const project = join(fixture.root, 'recovery-project'); await mkdir(project);
  expect(await fixture.init(project)).toMatchObject({ code: 0 });
  const env = { ...fixture.env, PATH: [join(project, '.arch/bin'), fixture.native, dirname(process.execPath)].join(delimiter) };
  expect((await run('claude', [], project, env)).stderr).toContain('[arch:demo] preflight');
  // Checkpoint and one completed deletion simulate process interruption at that exact boundary.
  await rename(join(project, '.arch/bootstrap.json'), join(project, '.arch/uninstall.json'));
  await unlink(join(project, '.config/mise/conf.d/arch.toml'));
  expect(await run(process.execPath, [cli, 'uninstall'], project, env)).toMatchObject({ code: 0 });
  const native = await run('claude', ['after-uninstall'], project, env);
  expect(native, native.stderr).toMatchObject({ code: 0 }); expect(events(native)).toEqual([]);
  expect(JSON.parse(native.stdout.trim()).args).toEqual(['after-uninstall']);
  expect(await run(process.execPath, [cli, 'uninstall'], project, env)).toMatchObject({ code: 0 });
});

it.skipIf(process.platform === 'win32')('kills a real child that acknowledges and ignores graceful termination', async () => {
  const invocation = start(process.execPath, [cli, 'run', 'claude', '--'], fixture.A,
    { ...fixture.env, FAKE_WAIT: '1', FAKE_IGNORE_TERM: '1' });
  invocation.child.stdin.end();
  try {
    await waitForOutput(invocation, 'native ready');
    const native = JSON.parse(invocation.output().stdout.split(/\r?\n/)[0]!);
    invocation.child.kill('SIGTERM');
    const result = await invocation.result;
    expect(result.stderr).toContain('ignored SIGTERM');
    expect(result.stderr).toContain('[arch:demo] cleanup');
    expect(result.code).toBe(143);
    expect(() => process.kill(native.pid, 0)).toThrow();
  } finally { invocation.child.kill('SIGKILL'); }
});

it('preserves cwd, stdio, stdin and native nonzero exit codes', async () => {
  const sub = join(fixture.A, 'space directory'); await mkdir(sub);
  const result = await fixture.invoke(sub, 'claude', ['--flag'], { FAKE_STDIN: '1', FAKE_EXIT: '23' }, 'input with spaces\nand another line\n');
  expect(result, result.stderr).toMatchObject({ code: 23 });
  expect(JSON.parse(result.stdout.split(/\r?\n/)[0]!)).toMatchObject({ cwd: sub, args: ['--flag'] });
  expect(result.stdout).toContain('input with spaces\nand another line\n');
  expect(result.stderr).toContain('native stderr');
  expect(events(result).at(-1)?.payload.exitCode).toBe(23);
});

it('invalid configuration fails explicitly and never launches native', async () => {
  const config = join(fixture.A, '.arch/harness.toml');
  const original = await readFile(config, 'utf8');
  const log = join(fixture.root, 'invalid.jsonl');
  try {
    await writeFile(config, 'schema=99');
    const result = await fixture.invoke(fixture.A, 'claude', [], { FAKE_LOG: log });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Invalid Arch configuration');
    expect(await records(log)).toEqual([]);
  } finally { await writeFile(config, original); }
});

it('a missing harness config passes through, while missing native binaries fail with cleanup', async () => {
  const config = join(fixture.A, '.arch/harness.toml');
  const original = await readFile(config, 'utf8');
  try {
    await unlink(config);
    const result = await fixture.invoke(fixture.A);
    expect(result).toMatchObject({ code: 0 }); expect(events(result)).toEqual([]);
  } finally { await writeFile(config, original); }
  const result = await run(process.execPath, [cli, 'run', 'nonexistent-arch-fixture', '--'], fixture.A, fixture.env);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('Native executable not found');
  expect(result.stderr).toContain('[arch:demo] cleanup');
  expect(events(result).at(-1)?.type).toBe('execution.failed');
});

it('nearest nested configuration overrides middleware without leaking to its parent', async () => {
  const nested = join(fixture.A, 'nested'); await mkdir(join(nested, '.arch'), { recursive: true });
  await writeFile(join(nested, '.arch/harness.toml'), 'schema=1\nmiddleware=[]');
  const result = await fixture.invoke(nested);
  expect(result.code).toBe(0);
  expect(events(result)[0]?.payload.projectRoot).toBe(nested);
  expect(result.stderr).not.toContain('[arch:demo]');
  expect((await fixture.invoke(fixture.A)).stderr).toContain('[arch:demo] preflight');
});

it('rejects recursion and wrapper-only resolution', async () => {
  const recursive = await fixture.invoke(fixture.A, 'claude', [], { ARCH_ACTIVE: 'already-running' });
  expect(recursive.code).toBe(1);
  expect(recursive.stderr).toContain('Recursive Arch invocation');
  const path = [join(fixture.A, '.arch/bin'), dirname(process.execPath)].join(delimiter);
  const unresolved = await run(process.execPath, [cli, 'run', 'claude', '--'], fixture.A, { ...fixture.env, PATH: path });
  expect(unresolved.code).toBe(1);
  expect(unresolved.stderr).toContain('Native executable not found');
});

it('prevents external wrappers from re-entering Arch in passthrough and configured projects', async () => {
  const script = join(fixture.native, 'reenter.cjs');
  await writeFile(script, '#!/usr/bin/env node\n' +
    `if (Number(process.env.FAKE_DEPTH || 0) >= 2) process.exit(77);\n` +
    `const result = require('node:child_process').spawnSync(process.execPath, [${JSON.stringify(cli)}, 'run', 'reenter', '--'], {stdio:'inherit', env:{...process.env, FAKE_DEPTH:String(Number(process.env.FAKE_DEPTH || 0)+1)}});\nprocess.exit(result.status ?? 1);\n`);
  if (process.platform === 'win32') {
    await writeFile(join(fixture.native, 'reenter.cmd'), '@echo off\r\nnode "%~dp0\\reenter.cjs" %*\r\n');
  } else {
    await copyFile(script, join(fixture.native, 'reenter'));
    await chmod(join(fixture.native, 'reenter'), 0o755);
  }
  for (const project of [fixture.C, fixture.A]) {
    const result = await run(process.execPath, [cli, 'run', 'reenter', '--'], project, fixture.env);
    expect(result, result.stderr).toMatchObject({ code: 1 });
    expect(result.stderr).toContain('Recursive Arch invocation');
  }
});

it('does not reject unrelated native directories merely named shims', async () => {
  const directory = join(fixture.root, 'third-party/shims'); await mkdir(directory, { recursive: true });
  const name = process.platform === 'win32' ? 'claude.exe' : 'claude';
  await copyFile(join(fixture.native, name), join(directory, name));
  const result = await run(process.execPath, [cli, 'run', 'claude', '--'], fixture.A,
    { ...fixture.env, PATH: [directory, dirname(process.execPath)].join(delimiter) });
  expect(result, result.stderr).toMatchObject({ code: 0 });
});

it('runs the extensionless POSIX fixture as CommonJS inside this ESM repository', async () => {
  const file = join(fixture.native, 'extensionless-fixture');
  await copyFile('tests/fixtures/native.cjs', file);
  const result = await run(process.execPath, [file, 'fixture-argument'], fixture.A, fixture.env);
  expect(result, result.stderr).toMatchObject({ code: 0 });
  expect(JSON.parse(result.stdout.trim()).args).toEqual(['fixture-argument']);
});

it('mise activates the project-local launchers and leaves unconfigured projects native', async () => {
  const env = { ...fixture.env, PATH: [fixture.native, dirname(process.execPath), ...(mise !== 'mise' ? [dirname(mise)] : []), process.env.PATH || ''].join(delimiter) };
  const active = await run(mise, ['exec', '--', 'claude', 'via-mise'], fixture.A, env);
  expect(active, active.stderr).toMatchObject({ code: 0 });
  expect(active.stderr).toContain('[arch:demo] preflight');
  const inactive = await run(mise, ['exec', '--', 'claude'], fixture.C, env);
  expect(inactive, inactive.stderr).toMatchObject({ code: 0 });
  expect(events(inactive)).toEqual([]);
});

it.skipIf(process.platform !== 'win32')('resolves npm .cmd shims without cmd.exe and rejects arbitrary batch scripts', async () => {
  const script = join(fixture.native, 'npm-tool.cjs');
  await writeFile(script, '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n');
  await writeFile(join(fixture.native, 'npm-tool.cmd'), '@echo off\r\nnode "%~dp0\\npm-tool.cjs" %*\r\n');
  await writeFile(join(fixture.native, 'npm-tool'), '#!/bin/sh\n# npm also installs this POSIX launcher; Windows must select PATHEXT instead.\nexit 99\n');
  const args = ['', 'a"b', '%PATH% & | < > ^ !', 'trailing\\'];
  const result = await run(process.execPath, [cli, 'run', 'npm-tool', '--', ...args], fixture.A, fixture.env);
  expect(result, result.stderr).toMatchObject({ code: 0 });
  expect(JSON.parse(result.stdout.trim())).toEqual(args);
  await writeFile(join(fixture.native, 'batch.cmd'), '@echo off\r\necho should not run\r\n');
  const batch = await run(process.execPath, [cli, 'run', 'batch', '--'], fixture.A, fixture.env);
  expect(batch.code).toBe(1);
  expect(batch.stdout).toBe('');
});

it.skipIf(process.platform === 'win32')('forwards SIGINT and SIGTERM and runs cleanup (POSIX process signals)', async () => {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const invocation = start(process.execPath, [cli, 'run', 'claude', '--'], fixture.A, { ...fixture.env, FAKE_WAIT: '1' });
    try {
      await waitFor(() => invocation.output().stdout.includes('"pid":'));
      invocation.child.kill(signal);
      const result = await invocation.result;
      expect(result.code).toBe(signal === 'SIGINT' ? 130 : 143);
      expect(result.stderr).toContain('[arch:demo] cleanup');
    } finally { invocation.child.kill('SIGKILL'); }
  }
});

it.skipIf(process.platform !== 'win32')('handles real Windows Ctrl+C and Ctrl+Break with cleanup and no surviving native child', async () => {
  for (const [type, code] of [['0', 130], ['1', 149]] as const) {
    const log = join(fixture.root, `console-${type}.jsonl`);
    const result = await run(join(fixture.root, 'console-driver.exe'), [join(fixture.A, '.arch/bin/claude.exe'), '-', type], fixture.A,
      { ...fixture.env, FAKE_LOG: log, FAKE_WAIT: '1' });
    expect([code, 0xC000013A], result.stdout + result.stderr).toContain(result.code);
    expect(result.stderr).toContain('[arch:demo] cleanup');
    const native = await records(log);
    expect(native).toHaveLength(1);
    expect(() => process.kill(native[0]!.pid, 0)).toThrow();
  }
});

async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for native startup');
    await new Promise(done => setTimeout(done, 20));
  }
}

async function waitForOutput(invocation: ReturnType<typeof start>, text: string) {
  if (invocation.output().stderr.includes(text)) return;
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${text}`)); }, 10_000);
    const check = () => { if (invocation.output().stderr.includes(text)) { cleanup(); done(); } };
    const closed = () => { cleanup(); reject(new Error(`Child closed before ${text}`)); };
    const cleanup = () => { clearTimeout(timer); invocation.child.stderr.off('data', check); invocation.child.off('close', closed); };
    invocation.child.stderr.on('data', check); invocation.child.once('close', closed);
    check();
  });
}
