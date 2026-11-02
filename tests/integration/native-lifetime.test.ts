import { expect, it } from 'vitest';
import { copyFile, mkdir, unlink, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { start, world } from '../support.js';

// Distinguishes raw native lifetime from Arch removal. Each executable is reused
// only after direct-child close, with no deletion retries or Arch initialization.
it('creates, executes, closes, deletes and recreates independent native executables', async () => {
  const fixture = await world();
  const extension = 'win32' === process.platform ? '.exe' : '';
  const evidence: unknown[] = [];
  const record = {
    commit: process.env.GITHUB_SHA ?? 'local-uncommitted',
    platform: process.platform,
    node: process.version,
    started: new Date().toISOString(),
    ended: '',
    failed: false,
    cleanup: 'pending',
    evidence,
  };
  try {
    for (const lanes of [1, 3]) {
      const outcomes = await Promise.allSettled(
        Array.from({ length: lanes }, async (_, lane) => {
          const directory = join(fixture.root, `raw-${String(lanes)}-${String(lane)}`);
          await mkdir(directory);
          const target = join(directory, `native${extension}`);
          for (let iteration = 0; 4 > iteration; iteration++) {
            let stage = 'copy';
            try {
              await copyFile(join(fixture.native, `claude${extension}`), target);
              if ('win32' !== process.platform) {
                await chmod(target, 0o755);
              }
              stage = 'execute-close';
              const invocation = start(target, [], directory, fixture.env);
              invocation.child.stdin.end();
              try {
                const result = await invocation.result;
                evidence.push({
                  lanes,
                  lane,
                  iteration,
                  stage,
                  target,
                  pid: invocation.child.pid,
                  events: invocation.observations(),
                  ...result,
                });
                expect(result, result.stderr).toMatchObject({ code: 0, signal: null });
              } finally {
                await invocation.dispose();
              }
              stage = 'unlink';
              await unlink(target);
              evidence.push({ lanes, lane, iteration, stage, target, result: 'PASS' });
            } catch (error) {
              evidence.push({
                lanes,
                lane,
                iteration,
                stage,
                target,
                error: String(error),
                code: error instanceof Error && 'code' in error ? error.code : null,
              });
              throw error;
            }
          }
        }),
      );
      const failures = outcomes.filter((outcome) => 'rejected' === outcome.status);
      expect(failures, JSON.stringify(evidence)).toEqual([]);
    }
  } catch (error) {
    record.failed = true;
    throw error;
  } finally {
    record.ended = new Date().toISOString();
    const directory = 'reports/native-lifetime';
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${randomUUID()}.json`);
    record.cleanup = record.failed ? `retained: ${fixture.root}` : 'pending';
    await writeFile(path, JSON.stringify(record, null, 2));
    if (!record.failed) {
      try {
        await fixture.dispose();
        record.cleanup = 'completed';
      } catch (error) {
        record.failed = true;
        record.cleanup = `failed: ${String(error)}`;
        throw error;
      } finally {
        await writeFile(path, JSON.stringify(record, null, 2));
      }
    }
  }
});
