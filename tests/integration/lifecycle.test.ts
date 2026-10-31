import { afterAll, beforeAll, expect, it } from 'vitest';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, stat, writeFile, unlink } from 'node:fs/promises';
import { world, run, cli, records } from '../support.js';
import { journalFrom } from '../../src/lifecycle/routing-journal.js';

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
  const root = join(fixture.root, `project-${String(sequence++)}`);
  await mkdir(root);
  expect((await fixture.init(root)).code).toBe(0);
  return root;
}

const executable = (name: string) =>
  `.arch/bin/${name}${'win32' === process.platform ? '.exe' : ''}`;
const checkpoints = [
  'fs:before-journal',
  'fs:partial-stage',
  'fs:before-removals',
  'fs:stage-cleanup',
  'fs:after-journal-removal',
  'journal',
  `staged:${executable('gemini')}`,
  `published:${executable('gemini')}`,
  ...('win32' === process.platform
    ? ['staged:.arch/bin/gemini.shim', 'published:.arch/bin/gemini.shim']
    : []),
  `removed:${executable('codex')}`,
  ...('win32' === process.platform ? ['removed:.arch/bin/codex.shim'] : []),
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
    assert(child.stderr, 'Worker stderr must be piped');
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf8');
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
          reject(new Error(`Worker exited before checkpoint (${String(code)}): ${stderr}`));
        });
        child.once('message', (message) => {
          clearTimeout(timeout);
          expect(message).toEqual({ checkpoint });
          done();
        });
      });
      // At a publication checkpoint both names refer to the same complete bytes.
      if (checkpoint === `published:${executable('gemini')}`) {
        const journal = journalFrom(await readFile(join(root, '.arch/routing.json')));
        const addition = journal.additions[executable('gemini')];
        assert('string' === typeof addition);
        expect((await stat(join(root, executable('gemini')))).nlink).toBeGreaterThanOrEqual(2);
        expect(await readFile(join(root, executable('gemini')))).toEqual(
          Buffer.from(addition, 'base64'),
        );
      }
      child.kill('SIGKILL');
      await closed;
      const env = {
        ...fixture.env,
        PATH: [join(root, '.arch/bin'), fixture.env.PATH].join(delimiter),
      };
      const status = await run(process.execPath, [cli, 'status', '--json'], root, env);
      const parsedStatus: unknown = JSON.parse(status.stdout);
      if (['fs:before-journal', 'fs:after-journal-removal'].includes(checkpoint)) {
        expect(parsedStatus).toMatchObject({ state: 'initialized', recoveryPending: false });
      } else if ('fs:partial-stage' === checkpoint) {
        expect(parsedStatus).toMatchObject({ state: 'invalid_state', recoveryPending: true });
      } else {
        expect(parsedStatus).toMatchObject({
          state: 'recovery_pending',
          pendingOperation: 'routing',
        });
      }
      if ('fs:before-journal' === checkpoint) {
        // This stage has no published ownership authority: require explicit fixture-owner removal.
        const stage = join(root, '.arch/routing.stage');
        const bytes = await readFile(stage);
        expect(
          (await run(process.execPath, [cli, 'configure', 'claude', 'gemini'], root, env)).code,
        ).toBe(1);
        expect(await readFile(stage)).toEqual(bytes);
        await unlink(stage);
      }
      if ('fs:partial-stage' === checkpoint) {
        const recorded = await readFile(join(root, '.arch/routing.json'), 'utf8');
        const journal = journalFrom(Buffer.from(recorded));
        const stage = join(root, `.arch/.routing-${journal.id}-0.stage`);
        expect(await readFile(stage)).toHaveLength(3);
        expect(
          (await run(process.execPath, [cli, 'configure', 'claude', 'gemini'], root, env)).code,
        ).toBe(1);
        expect(await readFile(stage)).toHaveLength(3);
        const payload = Object.values(journal.additions)[0];
        if (undefined === payload) {
          throw new Error('Missing fixture addition');
        }
        await writeFile(stage, Buffer.from(payload, 'base64'));
      }
      const retained = await run('claude', ['still-routed'], root, env);
      expect(retained.code).toBe(0);
      expect(retained.stderr).toContain('[arch:demo] preflight');
      expect(
        (await run(process.execPath, [cli, 'configure', 'claude', 'gemini'], root, env)).code,
      ).toBe(0);
      const finalStatus: unknown = JSON.parse(
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
        reject(new Error(`Worker exited early: ${String(code)}`));
      });
    });
    child.kill('SIGKILL');
    await closed;
    expect((await run(process.execPath, [cli, 'deinit', '--yes'], root, fixture.env)).code).toBe(0);
    const status: unknown = JSON.parse(
      (await run(process.execPath, [cli, 'status', '--json'], root, fixture.env)).stdout,
    );
    expect(status).toMatchObject({ state: 'uninitialized' });
    expect(await readFile(join(root, '.arch/harness.toml'), 'utf8')).toContain('# keep this');
  } finally {
    if (null === child.exitCode && null === child.signalCode) {
      child.kill('SIGKILL');
      await closed;
    }
  }
}, 30000);

it('installs without mise or activation and distinguishes both from installation health', async () => {
  const root = join(fixture.root, `inactive-${String(sequence++)}`);
  await mkdir(root);
  const env = { ...fixture.env, PATH: '' };
  const initialized = await run(process.execPath, [cli, 'init', 'custom'], root, env);
  expect(initialized.code).toBe(0);
  expect(initialized.stdout).toContain('Shell activation has not been verified');
  const status: unknown = JSON.parse(
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
