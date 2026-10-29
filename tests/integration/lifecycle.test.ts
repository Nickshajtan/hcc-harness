import { afterAll, beforeAll, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { world, run, cli, records } from '../support.js';

let fixture: Awaited<ReturnType<typeof world>>;
beforeAll(async () => {
  fixture = await world(join(tmpdir(), 'arch-m2-fixtures'));
  const extension = 'win32' === process.platform ? '.exe' : '';
  await copyFile(
    join(fixture.native, 'claude' + extension),
    join(fixture.native, 'gemini' + extension),
  );
});
afterAll(async () => {
  await fixture?.dispose();
});
let sequence = 0;
async function project() {
  const root = join(fixture.root, `project-${sequence++}`);
  await mkdir(root);
  expect((await fixture.init(root)).code).toBe(0);
  return root;
}

const executable = (name: string) =>
  `.arch/bin/${name}${'win32' === process.platform ? '.exe' : ''}`;
const checkpoints = [
  'journal',
  `staged:${executable('gemini')}`,
  `published:${executable('gemini')}`,
  ...('win32' === process.platform ? ['published:.arch/bin/gemini.shim'] : []),
  `removed:${executable('codex')}`,
  'before-manifest',
  'manifest',
  'cleanup',
];

it.each(checkpoints)(
  'recovers after real subprocess termination at %s',
  async (checkpoint) => {
    const root = await project();
    const nativeBefore = await readFile(
      join(fixture.native, 'claude' + ('win32' === process.platform ? '.exe' : '')),
    );
    const child = spawn(
      process.execPath,
      [
        resolve('tests/fixtures/routing-worker.mjs'),
        pathToFileURL(resolve('dist/lifecycle.js')).href,
        root,
        JSON.stringify(['claude', 'gemini']),
        checkpoint,
      ],
      { cwd: root, env: fixture.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    );
    let stderr = '';
    child.stderr!.on('data', (data) => {
      stderr += data;
    });
    const closed = new Promise<void>((done) =>
      child.once('close', () => {
        done();
      }),
    );
    try {
      await new Promise<void>((done, reject) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`Checkpoint timeout: ${checkpoint}: ${stderr}`));
        }, 15000);
        child.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once('exit', (code) => {
          clearTimeout(timeout);
          reject(new Error(`Worker exited before checkpoint (${code}): ${stderr}`));
        });
        child.once('message', (message) => {
          clearTimeout(timeout);
          expect(message).toEqual({ checkpoint });
          done();
        });
      });
      // At a publication checkpoint both names refer to the same complete bytes.
      if (checkpoint === `published:${executable('gemini')}`) {
        const journal = JSON.parse(await readFile(join(root, '.arch/routing.json'), 'utf8'));
        expect((await stat(join(root, executable('gemini')))).nlink).toBeGreaterThanOrEqual(2);
        expect(await readFile(join(root, executable('gemini')))).toEqual(
          Buffer.from(journal.additions[executable('gemini')], 'base64'),
        );
      }
      child.kill('SIGKILL');
      await closed;
      const env = {
        ...fixture.env,
        PATH: [join(root, '.arch/bin'), fixture.env.PATH].join(delimiter),
      };
      const status = await run(process.execPath, [cli, 'status', '--json'], root, env);
      expect(JSON.parse(status.stdout)).toMatchObject({
        state: 'recovery_pending',
        pendingOperation: 'routing',
      });
      const retained = await run('claude', ['still-routed'], root, env);
      expect(retained.code).toBe(0);
      expect(retained.stderr).toContain('[arch:demo] preflight');
      expect(
        (await run(process.execPath, [cli, 'configure', 'claude', 'gemini'], root, env)).code,
      ).toBe(0);
      const finalStatus = JSON.parse(
        (await run(process.execPath, [cli, 'status', '--json'], root, env)).stdout,
      );
      expect(finalStatus).toMatchObject({
        state: 'initialized',
        routes: ['claude', 'gemini'],
        integrity: 'valid',
        recoveryPending: false,
      });
      const record = join(root, 'calls.jsonl');
      const added = await run('gemini', ['new-route'], root, { ...env, FAKE_LOG: record });
      expect(added.code).toBe(0);
      expect(added.stderr).toContain('[arch:demo] preflight');
      expect(await records(record)).toHaveLength(1);
      expect(
        await readFile(
          join(fixture.native, 'claude' + ('win32' === process.platform ? '.exe' : '')),
        ),
      ).toEqual(nativeBefore);
      expect(
        (await readdir(join(root, '.arch'))).filter((name) => name.includes('routing')),
      ).toEqual([]);
    } finally {
      if (null === child.exitCode && null === child.signalCode) {
        child.kill('SIGKILL');
        await closed;
      }
    }
  },
  30000,
);

it('implements non-interactive lifecycle, legacy uninstall and confirmation-based deinit', async () => {
  const root = await project();
  expect((await run(process.execPath, [cli, 'init'], root, fixture.env)).code).toBe(2);
  expect((await run(process.execPath, [cli, 'configure'], root, fixture.env)).code).toBe(2);
  const before = await readFile(join(root, '.arch/bootstrap.json'));
  expect((await run(process.execPath, [cli, 'deinit'], root, fixture.env)).code).toBe(2);
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(before);
  const added = await run(process.execPath, [cli, 'route', 'add', 'gemini'], root, fixture.env);
  expect(added.code).toBe(0);
  expect(
    (await run(process.execPath, [cli, 'route', 'remove', 'codex'], root, fixture.env)).code,
  ).toBe(0);
  expect(
    (await run(process.execPath, [cli, 'route', 'list'], root, fixture.env)).stdout
      .trim()
      .split(/\r?\n/),
  ).toEqual(['claude', 'gemini']);
  expect((await run(process.execPath, [cli, 'deinit', '--yes'], root, fixture.env)).code).toBe(0);
  expect((await fixture.init(root)).code).toBe(0);
  const legacy = await run(process.execPath, [cli, 'uninstall'], root, fixture.env);
  expect(legacy.code).toBe(0);
  expect(legacy.stderr).toContain('deprecated');
  expect((await run(process.execPath, [cli, 'uninstall'], root, fixture.env)).code).toBe(0);
});

it('deinit resumes a pending routing journal and preserves edited configuration', async () => {
  const root = await project();
  await writeFile(join(root, '.arch/harness.toml'), 'schema=1\n# keep this\nmiddleware=[]\n');
  const child = spawn(
    process.execPath,
    [
      resolve('tests/fixtures/routing-worker.mjs'),
      pathToFileURL(resolve('dist/lifecycle.js')).href,
      root,
      JSON.stringify(['claude', 'gemini']),
      'journal',
    ],
    { cwd: root, env: fixture.env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  const closed = new Promise<void>((done) =>
    child.once('close', () => {
      done();
    }),
  );
  try {
    await new Promise<void>((done, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker checkpoint timeout'));
      }, 15000);
      child.once('message', () => {
        clearTimeout(timeout);
        done();
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Worker exited early: ${code}`));
      });
    });
    child.kill('SIGKILL');
    await closed;
    expect((await run(process.execPath, [cli, 'deinit', '--yes'], root, fixture.env)).code).toBe(0);
    expect(
      JSON.parse((await run(process.execPath, [cli, 'status', '--json'], root, fixture.env)).stdout)
        .state,
    ).toBe('uninitialized');
    expect(await readFile(join(root, '.arch/harness.toml'), 'utf8')).toContain('# keep this');
  } finally {
    if (null === child.exitCode && null === child.signalCode) {
      child.kill('SIGKILL');
      await closed;
    }
  }
}, 30000);

it('installs without mise or activation and distinguishes both from installation health', async () => {
  const root = join(fixture.root, `inactive-${sequence++}`);
  await mkdir(root);
  const env = { ...fixture.env, PATH: '' };
  const initialized = await run(process.execPath, [cli, 'init', 'custom'], root, env);
  expect(initialized.code).toBe(0);
  expect(initialized.stdout).toContain('Shell activation has not been verified');
  const status = JSON.parse(
    (await run(process.execPath, [cli, 'status', '--json'], root, env)).stdout,
  );
  expect(status).toMatchObject({
    state: 'initialized',
    activation: { miseAvailable: false, projectBinOnPath: false, shellActivation: 'unknown' },
  });
  expect((await run(process.execPath, [cli, '--help'], root, env)).code).toBe(0);
  expect((await run(process.execPath, [cli, 'route', 'add'], root, env)).code).toBe(2);
  expect((await run(process.execPath, [cli, 'status', '--bad'], root, env)).code).toBe(2);
});
