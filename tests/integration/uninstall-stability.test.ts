import { expect, it } from 'vitest';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cli, run, start, world } from '../support.js';

// Bounded concurrent pressure, not a retry policy: every operation must pass on
// its first attempt. Each lane owns a different project and awaits child close.
it('preserves user configuration through concurrent immediate run/uninstall sequences', async () => {
  const fixture = await world();
  const custom = 'schema=1\nmiddleware=[]\n';
  const evidence: unknown[] = [];
  let failed = false;
  try {
    const extension = 'win32' === process.platform ? '.exe' : '';
    await copyFile(
      join(fixture.native, `codex${extension}`),
      join(fixture.native, `arbitrary${extension}`),
    );
    const outcomes = await Promise.allSettled(
      Array.from({ length: 3 }, async (_, lane) => {
        const project = join(fixture.root, `lane-${String(lane)}`);
        await mkdir(join(project, '.arch'), { recursive: true });
        await writeFile(join(project, '.arch/harness.toml'), custom);
        for (let iteration = 0; 4 > iteration; iteration++) {
          for (const [stage, command, args] of [
            ['initialize', process.execPath, [cli, 'init', 'arbitrary']],
            ['native', 'arbitrary', []],
            ['uninstall', process.execPath, [cli, 'uninstall']],
          ] as const) {
            const result = await run(command, [...args], project, fixture.env);
            const record = { lane, iteration, stage, project, ...result };
            evidence.push(record);
            if (0 !== result.code || null !== result.signal) {
              failed = true;
              const resources = await readdir(join(project, '.arch'));
              throw new Error(JSON.stringify({ ...record, resources }));
            }
          }
          expect(await readFile(join(project, '.arch/harness.toml'), 'utf8')).toBe(custom);
        }
      }),
    );
    const failures = outcomes.filter((outcome) => 'rejected' === outcome.status);
    failed ||= 0 !== failures.length;
    expect(failures, JSON.stringify(evidence)).toEqual([]);
  } finally {
    // A failed fixture is retained for inspection rather than destroying the
    // manifest/journal evidence. No environment values or credentials are saved.
    await writeFile(
      join(fixture.root, 'uninstall-evidence.json'),
      JSON.stringify({ failed, evidence, cleanup: failed ? 'retained' : 'requested' }, null, 2),
    );
    if (!failed) {
      await fixture.dispose();
    }
  }
});

it.skipIf('win32' !== process.platform)(
  'reports a real Windows sharing refusal and leaves the ownership checkpoint recoverable',
  async () => {
    const fixture = await world();
    const project = fixture.C;
    const target = join(project, '.arch/bin/tool.exe');
    const initialized = await fixture.init(project, ['tool']);
    expect(initialized, initialized.stderr).toMatchObject({ code: 0 });
    // FileShare.ReadWrite deliberately withholds Delete. The readiness line is
    // emitted only after the handle is held; stdin releases it deterministically.
    const holder = start(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$h=[IO.File]::Open($env:ARCH_TEST_LOCK,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite); try { [Console]::WriteLine("LOCKED"); [Console]::Out.Flush(); [Console]::ReadLine() | Out-Null } finally { $h.Dispose() }',
      ],
      project,
      { ...process.env, ARCH_TEST_LOCK: target },
    );
    try {
      await new Promise<void>((done, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          holder.child.stdout.off('data', ready);
          holder.child.off('close', closed);
        };
        const ready = () => {
          if (holder.output().stdout.includes('LOCKED')) {
            cleanup();
            done();
          }
        };
        const closed = () => {
          cleanup();
          reject(new Error(`Lock holder closed: ${holder.output().stderr}`));
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Lock holder did not reach the ready barrier'));
        }, 10_000);
        holder.child.stdout.on('data', ready);
        holder.child.once('close', closed);
        ready();
      });
      const removed = await run(process.execPath, [cli, 'uninstall'], project, fixture.env);
      expect(removed, removed.stderr).toMatchObject({ code: 1, signal: null, stdout: '' });
      expect(removed.stderr).toContain(`Unable to remove managed file: ${target}`);
      expect(removed.stderr).toMatch(/EPERM|EACCES|EBUSY/);
      expect(await readFile(join(project, '.arch/uninstall.json'), 'utf8')).toContain('files');
      expect(await readFile(target)).not.toHaveLength(0);
    } finally {
      holder.child.stdin.end('\n');
      const released = await holder.result;
      expect(released, released.stderr).toMatchObject({ code: 0 });
    }
    // An explicit recovery request after release, never an automatic retry.
    const recovered = await run(process.execPath, [cli, 'uninstall'], project, fixture.env);
    expect(recovered, recovered.stderr).toMatchObject({ code: 0 });
    await fixture.dispose();
  },
);
