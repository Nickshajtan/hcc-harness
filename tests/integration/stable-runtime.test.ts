import { afterAll, beforeAll, expect, it, onTestFinished } from 'vitest';
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  link,
  readFile,
  realpath,
  rename,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { installStable } from '../../src/installation/stable-install.js';
import {
  recordRemovalFailure,
  records,
  requiredEnvironment,
  run,
  start,
  world,
} from '../support.js';

let f: Awaited<ReturnType<typeof world>>;
let build: ReturnType<typeof start> | undefined;
let source: string, stable: string, entry: string, project: string, env: NodeJS.ProcessEnv;
const windows = 'win32' === process.platform;
beforeAll(async () => {
  if ('1' === process.env.ARCH_RUNTIME_CONTRACT) {
    requiredEnvironment('ARCH_B1_NODE22');
  }
  f = await world(await realpath(tmpdir()));
  source = join(f.root, "source ü's checkout");
  stable = join(f.root, "stable ü's & app");
  project = join(f.root, "project ü's & spaces");
  await mkdir(source);
  await mkdir(project);
  for (const file of [
    'package.json',
    'package-lock.json',
    'LICENSE',
    'tsconfig.json',
    'tsconfig.build.json',
  ]) {
    await copyFile(resolve(file), join(source, file));
  }
  for (const directory of ['src', 'vendor', 'runtime']) {
    await cp(resolve(directory), join(source, directory), { recursive: true });
  }
  await symlink(
    resolve('node_modules'),
    join(source, 'node_modules'),
    windows ? 'junction' : 'dir',
  );
  await mkdir(join(source, 'scripts/b1'), { recursive: true });
  for (const file of ['build-bootstrap.ps1', 'build-bootstrap.cmd', 'arch-bootstrap.cpp']) {
    await copyFile(resolve('scripts/b1', file), join(source, 'scripts/b1', file));
  }
  await copyFile(
    resolve('scripts/build-stable-bootstrap.mjs'),
    join(source, 'scripts/build-stable-bootstrap.mjs'),
  );
  for (const file of ['build-publication.mjs', 'build-publication.ps1', 'build-publication.cmd']) {
    await copyFile(resolve('scripts', file), join(source, 'scripts', file));
  }
  await cp(resolve('native'), join(source, 'native'), { recursive: true });
  build = start(
    process.execPath,
    [requiredEnvironment('npm_execpath'), 'run', 'install:stable', '--', '--destination', stable],
    source,
    process.env,
  );
  build.child.stdin.end();
  const installed = await build.result;
  await build.dispose();
  expect(installed.code, installed.stderr + installed.stdout).toBe(0);
  entry = join(stable, windows ? 'arch.exe' : 'arch');
  const runtime = join(f.root, 'historical-arch-runtime');
  await mkdir(runtime);
  const archNode = join(runtime, windows ? 'node.exe' : 'node');
  await copyFile(process.execPath, archNode);
  if (!windows) {
    await chmod(archNode, 0o755);
  }
  env = { ...f.env, ARCH_NODE: archNode };
  await writeFile(join(project, 'user.txt'), 'untouched');
});
afterAll(async () => {
  // A timed-out setup must settle its owned build process before fixture deletion.
  // A disposal failure retains the tree and fails teardown instead of hiding it.
  await build?.dispose();
  await f?.dispose();
});

it('builds, installs, routes a controlled fixture, relocates source and safely deinitializes', async () => {
  const initialized = await run(entry, ['init', 'claude'], project, env);
  expect(initialized.code, initialized.stderr).toBe(0);
  const reconciled = await run(entry, ['route', 'add', 'codex'], project, env);
  expect(reconciled.code, reconciled.stderr).toBe(0);
  const configuration = 'schema=1\nmiddleware=[]\n# user configuration\n';
  await writeFile(join(project, '.arch/harness.toml'), configuration);
  const manifestBefore = await readFile(join(project, '.arch/bootstrap.json'));
  const router = join(project, '.arch/bin', windows ? 'claude.exe' : 'claude');
  const log = join(f.root, 'native.jsonl');
  const args = ['', 'quoted"value', 'trailing\\', 'space & | % !', 'Україна 日本語'];
  const routedEnv: NodeJS.ProcessEnv = {
    ...env,
    PATH: [join(project, '.arch/bin'), env.PATH].join(delimiter),
    FAKE_LOG: log,
    FAKE_EXIT: '7',
    FAKE_STDIN: '1',
    ARCH_DEMO: 'isolated',
  };
  // The CLR fixture uses the host's native stdin decoder. Compare its direct
  // output rather than requiring Arch to change that runtime's encoding policy.
  const direct = await run(
    join(f.native, windows ? 'claude.exe' : 'claude'),
    args,
    project,
    { ...routedEnv, FAKE_LOG: undefined },
    'controlled stdin ü\n',
  );
  expect(direct.code, direct.stderr).toBe(7);
  const nativeEcho = direct.stdout.slice(direct.stdout.indexOf('\n') + 1);
  expect(nativeEcho.length).toBeGreaterThan(0);
  for (const relocated of [false, true]) {
    if (relocated) {
      await rename(source, source + '-relocated');
      const replacement = join(f.root, 'replacement-arch-runtime');
      await mkdir(replacement);
      const replacementNode = join(replacement, windows ? 'node.exe' : 'node');
      await copyFile(process.execPath, replacementNode);
      if (!windows) {
        await chmod(replacementNode, 0o755);
      }
      await unlink(requiredEnvironment('ARCH_NODE', env));
      env.ARCH_NODE = replacementNode;
      routedEnv.ARCH_NODE = replacementNode;
    }
    const result = await run(router, args, project, routedEnv, 'controlled stdin ü\n');
    expect(result.code, result.stderr).toBe(7);
    expect(result.stderr).toContain('native stderr');
    expect(result.stdout).toContain('isolated');
    expect(result.stdout.endsWith(nativeEcho)).toBe(true);
    const help = await run(entry, ['--help'], project, env);
    expect(help.code, help.stderr).toBe(0);
  }
  expect(await records(log)).toMatchObject([
    { args, cwd: project, demo: 'isolated' },
    { args, cwd: project, demo: 'isolated' },
  ]);
  expect(await readFile(join(project, '.arch/bootstrap.json'))).toEqual(manifestBefore);
  const status = await run(entry, ['status', '--json'], project, env);
  expect(status.code, status.stderr).toBe(0);
  expect(status.stdout).toContain('initialized');
  const deinit = await run(entry, ['deinit', '--yes'], project, env);
  if (0 !== deinit.code) {
    await recordRemovalFailure(project, deinit, { operation: 'deinit' });
  }
  expect(deinit.code, deinit.stderr).toBe(0);
  expect(await readFile(join(project, 'user.txt'), 'utf8')).toBe('untouched');
  expect(await readFile(join(project, '.arch/harness.toml'), 'utf8')).toBe(configuration);
});

it('rejects invalid explicit runtimes without silently falling back', async () => {
  for (const ARCH_NODE of ['', 'relative', join(f.root, 'missing-node')]) {
    const result = await run(entry, ['--help'], project, { ...env, ARCH_NODE });
    expect(result.code, result.stderr).not.toBe(0);
    expect(result.stderr).toMatch(/ARCH_NODE|Node|runtime/);
  }
  if (process.env.ARCH_B1_NODE22) {
    const result = await run(entry, ['--help'], project, {
      ...env,
      ARCH_NODE: process.env.ARCH_B1_NODE22,
    });
    expect(result.code, result.stderr).not.toBe(0);
    expect(result.stderr).toContain('>=24.15.0 <25');
  }
});

it('accepts a runtime file alias and refuses a bootstrap alias without recursion', async () => {
  const runtimeAlias = join(f.root, windows ? 'node-alias.exe' : 'node-alias');
  const bootstrapAlias = join(f.root, windows ? 'bootstrap-alias.exe' : 'bootstrap-alias');
  // These are independent identity checks. Reusing an executed image's path
  // adds a Windows deletion/sharing dependency unrelated to either contract.
  if (windows) {
    await link(requiredEnvironment('ARCH_NODE', env), runtimeAlias);
    await link(entry, bootstrapAlias);
  } else {
    await symlink(requiredEnvironment('ARCH_NODE', env), runtimeAlias);
    await symlink(entry, bootstrapAlias);
  }
  const valid = await run(entry, ['--help'], project, { ...env, ARCH_NODE: runtimeAlias });
  expect(valid.code, valid.stderr).toBe(0);
  const refused = await run(entry, ['--help'], project, { ...env, ARCH_NODE: bootstrapAlias });
  expect(refused.code, refused.stderr).toBe(1);
  expect(refused.stderr).toContain('Recursive Arch');
});

it('selects the first eligible PATH Node and never falls through an incompatible selection', async () => {
  const compatible = dirname(requiredEnvironment('ARCH_NODE', env));
  const literal = join(f.root, 'literal[ab]');
  const decoy = join(f.root, 'literala');
  await mkdir(literal);
  await mkdir(decoy);
  const nodeName = windows ? 'node.exe' : 'node';
  if (windows) {
    await link(requiredEnvironment('ARCH_NODE', env), join(literal, nodeName));
  } else {
    await symlink(requiredEnvironment('ARCH_NODE', env), join(literal, nodeName));
  }
  await writeFile(join(decoy, nodeName), '#!/bin/sh\nexit 9\n');
  if (!windows) {
    await chmod(join(decoy, nodeName), 0o755);
  }
  const literalResult = await run(entry, ['--help'], project, {
    ...env,
    ARCH_NODE: undefined,
    PATH: literal,
  });
  expect(literalResult.code, literalResult.stderr).toBe(0);
  const selected = await run(entry, ['--help'], project, {
    ...env,
    ARCH_NODE: undefined,
    PATH: compatible,
  });
  expect(selected.code, selected.stderr).toBe(0);
  const absent = await run(entry, ['--help'], project, { ...env, ARCH_NODE: undefined, PATH: '' });
  expect(absent.code, absent.stderr).toBe(1);
  expect(absent.stderr).toContain('ARCH_NODE');
  if (process.env.ARCH_B1_NODE22) {
    const rejected = await run(entry, ['--help'], project, {
      ...env,
      ARCH_NODE: undefined,
      PATH: [dirname(process.env.ARCH_B1_NODE22), compatible].join(delimiter),
    });
    expect(rejected.code, rejected.stderr).toBe(1);
    expect(rejected.stderr).toContain('>=24.15.0 <25');
    const direct = await run(
      process.env.ARCH_B1_NODE22,
      [join(stable, 'application/dist/cli.js'), '--help'],
      project,
      env,
    );
    expect(direct.code, direct.stderr).toBe(1);
    expect(direct.stderr).toContain('>=24.15.0 <25');
  }
});

it('preserves native npm Node selection with a separate Arch runtime', async () => {
  const native = join(f.root, 'npm-native');
  await mkdir(native);
  const projectNode = process.env.ARCH_B1_NODE22 ?? process.execPath;
  await copyFile(projectNode, join(native, windows ? 'node.exe' : 'node'));
  await writeFile(
    join(native, 'fixture.cjs'),
    '#!/usr/bin/env node\nconsole.log(JSON.stringify({node:process.version,args:process.argv.slice(2),cwd:process.cwd(),env:process.env.CONTRACT_VALUE}));\n',
  );
  if (windows) {
    await writeFile(
      join(native, 'fixture.cmd'),
      '@ECHO off\r\nIF EXIST "%~dp0\\node.exe" (\r\n  "%~dp0\\node.exe" "%~dp0\\fixture.cjs" %*\r\n) ELSE (\r\n  node "%~dp0\\fixture.cjs" %*\r\n)\r\n',
    );
  } else {
    await chmod(join(native, 'node'), 0o755);
    await copyFile(join(native, 'fixture.cjs'), join(native, 'fixture'));
    await chmod(join(native, 'fixture'), 0o755);
  }
  const result = await run(entry, ['run', 'fixture', '--', 'space value'], project, {
    ...env,
    PATH: [native, dirname(projectNode)].join(delimiter),
    CONTRACT_VALUE: 'preserved',
  });
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain(process.env.ARCH_B1_NODE22 ? 'v22.' : 'v24.');
  expect(result.stdout).toContain('space value');
  expect(result.stdout).toContain('preserved');
});

it('records exact installed resource hashes and refuses reuse without changing user contents', async () => {
  const bytes = await readFile(join(stable, 'installation.json'), 'utf8');
  const metadata: unknown = JSON.parse(bytes);
  if (
    !metadata ||
    'object' !== typeof metadata ||
    !('files' in metadata) ||
    !metadata.files ||
    'object' !== typeof metadata.files
  ) {
    throw new Error('Invalid stable installation evidence');
  }
  for (const [file, hash] of Object.entries(metadata.files)) {
    expect(
      createHash('sha256')
        .update(await readFile(join(stable, file)))
        .digest('hex'),
    ).toBe(hash);
  }
  await expect(
    installStable({ source, destination: stable, npm: requiredEnvironment('npm_execpath') }),
  ).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await readFile(join(stable, 'installation.json'), 'utf8')).toBe(bytes);
});

it('bounds owned bootstrap child teardown after cancellation', async () => {
  const invocation = start(entry, ['run', 'claude', '--'], project, { ...env, FAKE_WAIT: '1' });
  onTestFinished(() => invocation.dispose());
  invocation.child.stdin.end();
  try {
    await Promise.race([
      new Promise<void>((done, reject) => {
        invocation.child.stdout.once('data', () => {
          done();
        });
        invocation.child.once('error', reject);
        invocation.child.once('exit', () => {
          reject(new Error('Exited before native readiness'));
        });
      }),
      invocation.result.then((result) => {
        throw new Error(
          `Exited before native readiness (${String(result.code)}): ${result.stderr.slice(-4000)}`,
        );
      }),
    ]);
    invocation.child.kill('SIGTERM');
    const result = await invocation.result;
    expect(0 === result.code && null === result.signal).toBe(false);
  } finally {
    await invocation.dispose();
  }
});

it('preserves console signals and middleware cleanup through stable project routing', async () => {
  const initialized = await run(entry, ['init', 'claude'], f.B, env);
  expect(initialized.code, initialized.stderr).toBe(0);
  const route = join(f.B, '.arch/bin', windows ? 'claude.exe' : 'claude');
  for (const [signal, event, code] of [
    ['SIGINT', '0', 130],
    [windows ? 'SIGBREAK' : 'SIGTERM', '1', windows ? 149 : 143],
  ] as const) {
    const log = join(f.root, `stable-console-${signal}.jsonl`);
    const environment = { ...env, FAKE_WAIT: '1', FAKE_LOG: log };
    if (windows) {
      const result = await run(
        join(f.root, 'console-driver.exe'),
        [route, '-', event],
        f.B,
        environment,
      );
      expect([code, 0xc000013a], result.stdout + result.stderr).toContain(result.code);
      expect(result.stderr).toContain('[arch:demo] cleanup');
    } else {
      const invocation = start(route, [], f.B, environment);
      onTestFinished(() => invocation.dispose());
      invocation.child.stdin.end();
      try {
        await Promise.race([
          new Promise<void>((done, reject) => {
            invocation.child.stdout.once('data', () => {
              done();
            });
            invocation.child.once('error', reject);
            invocation.child.once('exit', () => {
              reject(new Error('Exited before signal barrier'));
            });
          }),
          invocation.result.then((result) => {
            throw new Error(
              `Exited before signal barrier (${String(result.code)}): ${result.stderr.slice(-4000)}`,
            );
          }),
        ]);
        invocation.child.kill(signal);
        const result = await invocation.result;
        expect(result.code, result.stderr).toBe(code);
        expect(result.stderr).toContain('[arch:demo] cleanup');
      } finally {
        await invocation.dispose();
      }
    }
    const native = (await records(log))[0];
    if (!native) {
      throw new Error('Missing controlled native child record');
    }
    expect(() => process.kill(native.pid, 0)).toThrow();
  }
  const removed = await run(entry, ['deinit', '--yes'], f.B, env);
  if (0 !== removed.code) {
    await recordRemovalFailure(f.B, removed, { operation: 'deinit' });
  }
  expect(removed.code, removed.stderr).toBe(0);
});
