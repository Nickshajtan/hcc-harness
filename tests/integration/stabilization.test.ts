import { stateFrom } from '../../src/lifecycle/manifest.js';
import { checkFiles } from '../../src/lifecycle/ownership.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  rmdir,
  copyFile,
  chmod,
  realpath,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, delimiter } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cli, run, events } from '../support.js';
import { setup, uninstall } from '../../src/setup.js';
import { inspectInstallation } from '../../src/lifecycle.js';
import { configText, legacyConfigText } from '../../src/lifecycle/manifest.js';

let root: string;
const demo = 'schema=1\n[[middleware]]\nid="demo"\nenabled=true\n';
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'arch-stabilization-'));
  await mkdir(join(root, '.arch'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
function environment() {
  return {
    ...process.env,
    PATH: [root, dirname(process.execPath)].join(delimiter),
    ARCH_TRACE: '1',
  };
}

async function prepareMacPty(): Promise<void> {
  if ('darwin' !== process.platform) {
    return;
  }
  // Match check-wizard.mjs's documented preparation for npm's node-pty helper.
  // Repair only known package helper modes; every actual spawn failure still fails.
  const directory = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
  for (const relative of [
    'build/Release/spawn-helper',
    'build/Debug/spawn-helper',
    `prebuilds/darwin-${process.arch}/spawn-helper`,
  ]) {
    const helper = join(directory, relative);
    try {
      await access(helper);
    } catch (error) {
      if ('ENOENT' === (error as NodeJS.ErrnoException).code) {
        continue;
      }
      throw error;
    }
    try {
      await access(helper, constants.X_OK);
    } catch (error) {
      if ('EACCES' !== (error as NodeJS.ErrnoException).code) {
        throw error;
      }
      await chmod(helper, 0o755);
      console.info(`Restored execute permission: node-pty/${relative}`);
    }
  }
}

it.each([0, 17])(
  'runs three nested executions with independent middleware/events and exit %s',
  async (code) => {
    await writeFile(join(root, '.arch/harness.toml'), demo);
    const alias = join(root, 'win32' === process.platform ? 'provider-b.exe' : 'provider-b');
    await copyFile(process.execPath, alias);
    if ('win32' !== process.platform) {
      await chmod(alias, 0o755);
    }
    const command = basename(process.execPath);
    const leaf = `process.exit(${String(code)})`;
    const invoke = (provider: string, script: string) =>
      `const r=require('node:child_process').spawnSync(process.execPath,${JSON.stringify([cli, 'run', provider, '--', '-e', script])},{stdio:'inherit'});process.exit(r.status??1)`;
    const result = await run(
      process.execPath,
      [
        cli,
        'run',
        command,
        '--',
        '-e',
        invoke('provider-b', "console.log('B_NATIVE:'+process.execPath);" + invoke(command, leaf)),
      ],
      root,
      {
        ...environment(),
        ARCH_ACTIVE: 'spoofed',
        ARCH_PARENT_EXECUTION_ID: 'invalid-parent',
      },
    );
    expect(result.code, result.stderr).toBe(code);
    expect(result.stdout).toContain('B_NATIVE:' + (await realpath(alias)));
    const all = events(result) as (ReturnType<typeof events>[number] & {
      parentExecutionId?: string;
    })[];
    const started = all.filter((e) => 'execution.started' === e.type);
    const completed = all.filter((e) => 'execution.completed' === e.type);
    expect(started).toHaveLength(3);
    expect(new Set(started.map((e) => e.executionId)).size).toBe(3);
    expect(started[0]?.parentExecutionId).toBeUndefined();
    expect(started[1]?.parentExecutionId).toBe(started[0]?.executionId);
    expect(started[2]?.parentExecutionId).toBe(started[1]?.executionId);
    expect(started.map((e) => e.payload.command)).toEqual([command, 'provider-b', command]);
    expect(completed.map((e) => e.executionId)).toEqual(
      started.map((e) => e.executionId).reverse(),
    );
    for (const execution of started) {
      expect(
        all
          .filter(
            (e) => e.executionId === execution.executionId && 'middleware.completed' === e.type,
          )
          .map((e) => e.payload.phase),
      ).toEqual(['preflight', 'prepareLaunch', 'finalize']);
      expect(completed.find((e) => e.executionId === execution.executionId)?.payload.exitCode).toBe(
        code,
      );
    }
    expect(result.stderr.match(/\[arch:demo\] cleanup/g)).toHaveLength(3);
  },
);

it('routes with an empty starter despite demo denial and preserves direct-native bypass', async () => {
  await setup(root, ['provider']);
  expect(await readFile(join(root, '.arch/harness.toml'), 'utf8')).toBe(configText);
  const result = await run(
    process.execPath,
    [
      cli,
      'run',
      basename(process.execPath),
      '--',
      '-e',
      'process.exit(process.env.ARCH_DEMO ? 9 : 0)',
    ],
    root,
    { ...environment(), ARCH_DEMO: '', ARCH_DEMO_DENY: '1' },
  );
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).not.toContain('[arch:demo]');
  const native = await run(process.execPath, ['-e', 'process.exit(0)'], root, environment());
  expect(native.code).toBe(0);
  expect(events(native)).toEqual([]);
});

it.each([configText, legacyConfigText])(
  'removes only an unchanged owned starter %j',
  async (text) => {
    await setup(root, ['provider']);
    await writeFile(join(root, '.arch/harness.toml'), text);
    await uninstall(root);
    await expect(readFile(join(root, '.arch/harness.toml'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await setup(root, ['provider']);
    await writeFile(join(root, '.arch/harness.toml'), text + '# customized\n');
    await uninstall(root);
    expect(await readFile(join(root, '.arch/harness.toml'), 'utf8')).toBe(text + '# customized\n');
  },
);

it('reports unresolved setup entries read-only and blocks mutation until verified committed retention', async () => {
  await setup(root, ['provider']);
  const manifest = await readFile(join(root, '.arch/bootstrap.json'));
  await mkdir(join(root, '.arch/setup-claim'));
  await mkdir(join(root, '.arch/.setup-evidence'));
  const status = await inspectInstallation(root, {});
  expect(status.state).toBe('invalid_state');
  expect(status.setup).toEqual({
    claimPresent: true,
    bootstrapPresent: true,
    stagingPaths: ['.arch/.setup-evidence'],
    manualRecoveryRequired: true,
    documentation: 'docs/usage.md#recovering-an-interrupted-init',
  });
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(manifest);
  const cliStatus = await run(process.execPath, [cli, 'status', '--json'], root, environment());
  expect(cliStatus.code).toBe(1);
  const json: unknown = JSON.parse(cliStatus.stdout);
  expect(json).toMatchObject({ schema: 1, state: 'invalid_state', setup: status.setup });
  const textStatus = await run(process.execPath, [cli, 'status'], root, environment());
  expect(textStatus.code).toBe(1);
  expect(textStatus.stdout).toContain('Setup claim: present');
  expect(textStatus.stdout).toContain('Bootstrap manifest: present');
  expect(textStatus.stdout).toContain('Setup stages: .arch/.setup-evidence');
  expect(textStatus.stdout).toContain('Manual setup recovery: true');
  expect(textStatus.stdout).toContain(
    'Setup recovery documentation: docs/usage.md#recovering-an-interrupted-init',
  );
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(manifest);
  await expect(uninstall(root)).rejects.toThrow('Unresolved setup claim');
  expect((await inspectInstallation(root, {})).setup).toEqual(status.setup);
  // Independent provenance: setup completed before this test created the claim/stage.
  await checkFiles(root, stateFrom(manifest).files);
  await rmdir(join(root, '.arch/.setup-evidence'));
  await rmdir(join(root, '.arch/setup-claim'));
  expect((await inspectInstallation(root, {})).state).toBe('initialized');
  await uninstall(root);
  await setup(root, ['provider']);
  expect((await inspectInstallation(root, {})).state).toBe('initialized');
});

it.skipIf('win32' === process.platform).each([0, 130])(
  'preserves process-group SIGINT without forwarding/escalation and propagates %s',
  async (code) => {
    await writeFile(join(root, '.arch/harness.toml'), demo);
    let script = `let count=0;process.on('SIGINT',()=>{count++;console.log('INT:'+count)});process.stdin.on('data',()=>{console.log('COUNT:'+count);process.exit(${String(code)})});console.log('READY')`;
    const nested = 130 === code;
    if (nested) {
      script = `process.on('SIGINT',()=>console.log('OUTER_INT'));const c=require('node:child_process').spawn(process.execPath,${JSON.stringify([cli, 'run', basename(process.execPath), '--', '-e', script])},{stdio:'inherit'});c.on('close',code=>process.exit(code??1))`;
    }
    const child = spawn(
      process.execPath,
      [cli, 'run', basename(process.execPath), '--', '-e', script],
      { cwd: root, env: environment(), detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => {
      stdout += b.toString();
    });
    child.stderr.on('data', (b: Buffer) => {
      stderr += b.toString();
    });
    const settled = once(child, 'close');
    async function until(text: string) {
      const deadline = Date.now() + 10000;
      while (!stdout.includes(text)) {
        if (Date.now() > deadline || null !== child.exitCode || null !== child.signalCode) {
          throw new Error(`Missing ${text}: ${stdout} ${stderr}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    try {
      await until('READY');
      if (!child.pid) {
        throw new Error('Missing child PID');
      }
      process.kill(-child.pid, 'SIGINT');
      await until('INT:1');
      await new Promise((resolve) => setTimeout(resolve, 3300));
      expect(child.exitCode).toBeNull();
      process.kill(-child.pid, 'SIGINT');
      await until('INT:2');
      child.stdin.write('exit\n');
      expect(await settled).toEqual([code, null]);
      expect(stdout).toContain('COUNT:2');
      if (nested) {
        expect(stdout.match(/OUTER_INT/g)).toHaveLength(2);
      }
      expect(stderr.match(/\[arch:demo\] finalize/g)).toHaveLength(nested ? 2 : 1);
      expect(stderr.match(/\[arch:demo\] cleanup/g)).toHaveLength(nested ? 2 : 1);
    } finally {
      if (null === child.exitCode && null === child.signalCode && child.pid) {
        process.kill(-child.pid, 'SIGKILL');
      }
      await settled;
    }
  },
);

it.skipIf('win32' === process.platform)(
  'preserves native SIGINT termination and cleanup',
  async () => {
    await writeFile(join(root, '.arch/harness.toml'), demo);
    const child = spawn(
      process.execPath,
      [
        cli,
        'run',
        basename(process.execPath),
        '--',
        '-e',
        "console.log('READY');setInterval(()=>{},1000)",
      ],
      { cwd: root, env: environment(), detached: true },
    );
    const closed = once(child, 'close');
    let stderr = '';
    child.stderr?.on('data', (b: Buffer) => {
      stderr += b.toString();
    });
    try {
      if (!child.stdout || !child.pid) {
        throw new Error('Missing child output/PID');
      }
      await once(child.stdout, 'data');
      process.kill(-child.pid, 'SIGINT');
      expect(await closed).toEqual([null, 'SIGINT']);
      expect(stderr.match(/\[arch:demo\] cleanup/g)).toHaveLength(1);
    } finally {
      if (null === child.exitCode && null === child.signalCode && child.pid) {
        process.kill(-child.pid, 'SIGKILL');
      }
      await closed;
    }
  },
);

it.skipIf('win32' === process.platform)(
  'handles terminal Ctrl+C in an actual foreground PTY',
  async () => {
    await prepareMacPty();
    const { spawn: spawnPty } = await import('node-pty');
    await writeFile(join(root, '.arch/harness.toml'), demo);
    const script =
      "let n=0;process.on('SIGINT',()=>console.log('INT:'+ ++n));process.stdin.on('data',()=>process.exit(n===1?0:9));console.log('READY')";
    const terminal = spawnPty(
      process.execPath,
      [cli, 'run', basename(process.execPath), '--', '-e', script],
      { cwd: root, env: environment(), name: 'xterm', cols: 80, rows: 24 },
    );
    let output = '';
    let exited = false;
    const data = terminal.onData((text) => {
      output += text;
    });
    const closed = new Promise<number>((resolve) => {
      terminal.onExit(({ exitCode }) => {
        exited = true;
        resolve(exitCode);
      });
    });
    async function until(text: string) {
      const deadline = Date.now() + 10000;
      while (!output.includes(text)) {
        if (exited || Date.now() > deadline) {
          throw new Error(`PTY missing ${text}: ${output}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    try {
      await until('READY');
      terminal.write('\x03');
      await until('INT:1');
      await new Promise((resolve) => setTimeout(resolve, 3300));
      expect(exited).toBe(false);
      terminal.write('exit\r');
      expect(await closed).toBe(0);
      expect(output).not.toContain('INT:2');
      expect(output.match(/\[arch:demo\] cleanup/g)).toHaveLength(1);
    } finally {
      if (!exited) {
        terminal.kill('SIGKILL');
      }
      await closed;
      data.dispose();
    }
  },
);

it('treats a forged valid parent as correlation and still applies explicit middleware denial', async () => {
  await writeFile(join(root, '.arch/harness.toml'), demo);
  const parent = '11111111-1111-4111-8111-111111111111';
  const result = await run(
    process.execPath,
    [cli, 'run', basename(process.execPath), '--', '-e', "console.log('BYPASSED')"],
    root,
    {
      ...environment(),
      ARCH_ACTIVE: 'forged',
      ARCH_PARENT_EXECUTION_ID: parent,
      ARCH_DEMO_DENY: '1',
    },
  );
  expect(result.code).toBe(1);
  expect(result.stdout).not.toContain('BYPASSED');
  const all = events(result);
  expect(all[0]?.parentExecutionId).toBe(parent);
  expect(all.at(-1)?.type).toBe('execution.failed');
  expect(result.stderr.match(/\[arch:demo\] cleanup/g)).toHaveLength(1);
});
