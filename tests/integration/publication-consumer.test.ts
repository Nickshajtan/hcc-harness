import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile, rename, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { installStable } from '../../src/installation/stable-install.js';
import {
  world,
  records,
  mise,
  requiredEnvironment,
  events,
  start,
  recordBeforeDisposal,
  diagnosticStreams,
  type Result,
} from '../support.js';

// Preserve the stalled operation's streams before terminating its owned child.
// A whole-suite timeout alone cannot distinguish publication from CLI lifetime.
async function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const invocation = start(command, args, cwd, env);
  invocation.child.stdin.end();
  let result: Result | undefined;
  await recordBeforeDisposal({
    record: async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        result = await Promise.race([
          invocation.result,
          new Promise<never>((_done, fail) => {
            timer = setTimeout(() => {
              fail(new Error('Consumer command deadline exceeded'));
            }, 60000);
          }),
        ]);
      } catch (cause) {
        throw new Error(
          JSON.stringify({
            command,
            args,
            cwd,
            pid: invocation.child.pid,
            ...diagnosticStreams(invocation.output()),
            events: invocation.observations(),
          }),
          { cause },
        );
      } finally {
        clearTimeout(timer);
      }
    },
    dispose: () => invocation.dispose(),
  });
  if (!result) {
    throw new Error('Consumer command produced no result');
  }
  return result;
}

describe.skipIf('win32' !== process.platform || 'x64' !== process.arch)(
  'independent native publication consumer',
  () => {
    let f: Awaited<ReturnType<typeof world>>;
    let consumer: string, stable: string, entry: string, env: NodeJS.ProcessEnv;
    let failed = false;
    beforeAll(async () => {
      f = await world(tmpdir());
      consumer = await mkdtemp(
        join(await realpath(process.env.ARCH_PUBLICATION_TEST_ROOT ?? tmpdir()), 'arch-consumer-'),
      );
      stable = join(f.root, 'independent-install');
      await installStable({
        source: resolve('.'),
        destination: stable,
        npm: requiredEnvironment('npm_execpath'),
      });
      entry = join(stable, 'arch.exe');
      env = {
        ...f.env,
        ARCH_NODE: process.execPath,
        MISE_TRUSTED_CONFIG_PATHS: consumer,
        MISE_CEILING_PATHS: dirname(consumer),
      };
    });
    afterEach((context) => {
      failed = failed || 'fail' === context.task.result?.state;
    });
    afterAll(async () => {
      if (failed) {
        console.error(
          `Retained failed consumer and independent installation: ${consumer}; ${f.root}`,
        );
        return;
      }
      if (consumer) {
        await rm(consumer, { recursive: true, force: true });
      }
      await f?.dispose();
    });

    it('initializes, activates, recovers, collides and removes without source-relative routes', async () => {
      await mkdir(join(consumer, '.arch'));
      const harness = 'schema=1\nmiddleware=[]\n# preserved consumer configuration\n';
      await writeFile(join(consumer, '.arch/harness.toml'), harness);
      await writeFile(join(consumer, 'unrelated.txt'), 'preserved');
      for (const args of [
        ['init', 'claude'],
        ['init', 'claude'],
      ]) {
        const result = await run(entry, args, consumer, env);
        expect(result.code, result.stderr).toBe(0);
      }
      const status = await run(entry, ['status', '--json'], consumer, env);
      expect(JSON.parse(status.stdout)).toMatchObject({ state: 'initialized', integrity: 'valid' });
      const shim = await readFile(join(consumer, '.arch/bin/claude.shim'), 'utf8');
      expect(shim).toContain(stable);
      expect(shim).not.toContain(resolve('.'));
      const log = join(f.root, 'consumer-native.jsonl');
      const routed = { ...env, FAKE_LOG: log, FAKE_EXIT: '7' };
      const args = ['--version', 'space value', '--literal=quoted"value'];
      const result = await run(mise, ['exec', '--', 'claude', ...args], consumer, routed);
      expect(result.code, result.stderr).toBe(7);
      const started = events(result).filter((event) => 'execution.started' === event.type);
      expect(started).toHaveLength(1);
      expect(started[0]?.payload).toMatchObject({ command: 'claude', projectRoot: consumer });
      expect(await records(log)).toMatchObject([{ args, cwd: consumer }]);

      // Import only the independently installed lifecycle; interrupt after a real
      // native publication and recover via the independently installed entrypoint.
      const source = `const {reconcileRoutes}=await import(${JSON.stringify(pathToFileURL(join(stable, 'application/dist/lifecycle.js')).href)});
      await reconcileRoutes(${JSON.stringify(consumer)},['claude','codex'],{checkpoint:async phase=>{
        if(phase==='published:.arch/bin/codex.exe'){process.send('ready');await new Promise(done=>process.once('message',done));}
      }});`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
        cwd: consumer,
        env,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      const closed = new Promise<void>((done, fail) => {
        child.once('error', fail);
        child.once('close', () => {
          done();
        });
      });
      let checkpointTimer: ReturnType<typeof setTimeout> | undefined;
      let childStderr = '';
      child.stderr?.on('data', (bytes: Buffer) => {
        childStderr = (childStderr + bytes.toString()).slice(-65536);
      });
      try {
        await new Promise<void>((done, fail) => {
          checkpointTimer = setTimeout(() => {
            fail(
              new Error(
                `Installed recovery child did not reach publication checkpoint: ${childStderr}`,
              ),
            );
          }, 30000);
          child.once('message', (message) => {
            if ('ready' === message) {
              done();
            } else {
              fail(new Error('Unexpected recovery checkpoint', { cause: message }));
            }
          });
          child.once('exit', () => {
            fail(new Error(`Recovery child exited before checkpoint: ${childStderr}`));
          });
        });
      } finally {
        clearTimeout(checkpointTimer);
        child.kill('SIGKILL');
        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            closed,
            new Promise<never>((_done, fail) => {
              closeTimer = setTimeout(() => {
                fail(new Error('Installed recovery child did not close'));
              }, 3000);
            }),
          ]);
        } finally {
          clearTimeout(closeTimer);
        }
      }
      const pending = await run(entry, ['status', '--json'], consumer, env);
      expect(JSON.parse(pending.stdout)).toMatchObject({
        state: 'recovery_pending',
        recoveryPending: true,
      });
      const resumed = await run(entry, ['configure', 'claude', 'codex'], consumer, env);
      expect(resumed.code, resumed.stderr).toBe(0);
      const removed = await run(entry, ['route', 'remove', 'codex'], consumer, env);
      expect(removed.code, removed.stderr).toBe(0);
      await writeFile(join(consumer, '.arch/bin/foreign.exe'), 'foreign');
      const collision = await run(entry, ['route', 'add', 'foreign'], consumer, env);
      expect(collision.code).not.toBe(0);
      expect(await readFile(join(consumer, '.arch/bin/foreign.exe'), 'utf8')).toBe('foreign');
      const deinit = await run(entry, ['deinit', '--yes'], consumer, env);
      expect(deinit.code, deinit.stderr).toBe(0);
      expect(await readFile(join(consumer, '.arch/harness.toml'), 'utf8')).toBe(harness);
      expect(await readFile(join(consumer, 'unrelated.txt'), 'utf8')).toBe('preserved');
      expect(await readFile(join(consumer, '.arch/bin/foreign.exe'), 'utf8')).toBe('foreign');
    });

    it.skipIf(!process.env.ARCH_SMOKE_NATIVE)(
      'runs the real native version through mise and the installed route',
      async () => {
        const native = requiredEnvironment('ARCH_SMOKE_NATIVE');
        const initialized = await run(entry, ['init', 'claude'], consumer, env);
        expect(initialized.code, initialized.stderr).toBe(0);
        const actualEnv = { ...env, PATH: [dirname(native), env.PATH].join(delimiter) };
        const direct = await run(native, ['--version'], consumer, actualEnv);
        const routed = await run(mise, ['exec', '--', 'claude', '--version'], consumer, actualEnv);
        expect(routed.code, routed.stderr).toBe(direct.code);
        expect(routed.stdout).toBe(direct.stdout);
        expect(routed.stdout.trim()).not.toBe('');
        expect(events(direct)).toEqual([]);
        const started = events(routed).filter((event) => 'execution.started' === event.type);
        expect(started).toHaveLength(1);
        expect(started[0]?.payload).toMatchObject({ command: 'claude', projectRoot: consumer });
        const removed = await run(entry, ['deinit', '--yes'], consumer, env);
        expect(removed.code, removed.stderr).toBe(0);
      },
    );

    it('refuses missing and corrupted packaged helper before publishing setup targets', async () => {
      const helper = join(stable, 'application/vendor/arch-publication-v1.exe');
      const original = await readFile(helper);
      const fresh = join(consumer, 'integrity');
      await mkdir(fresh);
      const operational = join(consumer, 'operational');
      await mkdir(operational);
      const initialized = await run(entry, ['init', 'claude'], operational, env);
      expect(initialized.code, initialized.stderr).toBe(0);
      try {
        await rename(helper, helper + '.saved');
        const native = await run(
          join(operational, '.arch/bin/claude.exe'),
          ['--version'],
          operational,
          env,
        );
        expect(native.code, native.stderr).toBe(0);
        expect(native.stdout).toContain('--version');
        const missing = await run(entry, ['init', 'claude'], fresh, env);
        expect(missing.code).not.toBe(0);
        expect(missing.stderr).toContain('helper');
        await writeFile(helper, 'corrupted');
        const corrupt = await run(entry, ['init', 'claude'], fresh, env);
        expect(corrupt.code).not.toBe(0);
        expect(corrupt.stderr).toContain('helper');
        await expect(readFile(join(fresh, '.arch/bootstrap.json'))).rejects.toMatchObject({
          code: 'ENOENT',
        });
        expect(await readFile(helper, 'utf8')).toBe('corrupted');
      } finally {
        await writeFile(helper, original);
        await rm(helper + '.saved');
      }
    });
  },
);
