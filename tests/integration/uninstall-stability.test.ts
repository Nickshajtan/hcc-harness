import { expect, it } from 'vitest';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cli, run, world } from '../support.js';

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
        for (let iteration = 0; iteration < 4; iteration++) {
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
