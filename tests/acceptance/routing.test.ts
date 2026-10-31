import { afterAll, beforeAll, expect, it } from 'vitest';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { world, events, records, run, cli } from '../support.js';

let fixture: Awaited<ReturnType<typeof world>>;
beforeAll(async () => {
  fixture = await world();
});
afterAll(async () => {
  await fixture?.dispose();
});

it('accepts the complete A/B/C workflow through normal CLI names, including denial and concurrency', async () => {
  const { A, B, C, env, root } = fixture;
  const logA = join(root, 'a.jsonl'),
    logB = join(root, 'b.jsonl'),
    logC = join(root, 'c.jsonl');
  expect(await fixture.init(A)).toMatchObject({ code: 0 });
  expect(await fixture.init(B)).toMatchObject({ code: 0 });
  await writeFile(
    join(B, '.arch/harness.toml'),
    'schema=1\n[[middleware]]\nid="demo"\nenabled=false\n',
  );
  const args = [
    '--flag',
    'two words',
    '',
    'a"b',
    '&|<>^%!',
    'trailing\\',
    'київ 🧪',
    '\tline\nnext',
  ];
  const first = await fixture.invoke(A, 'claude', args, { FAKE_LOG: logA });
  expect(first, first.stderr).toMatchObject({ code: 0 });
  expect(first.stderr).toContain('[arch:demo] preflight');
  expect(first.stderr).toContain('[arch:demo] finalize');
  expect(first.stderr).toContain('[arch:demo] cleanup');
  expect(events(first).map((e) => e.type)).toEqual([
    'execution.started',
    'middleware.completed',
    'middleware.completed',
    'middleware.completed',
    'execution.completed',
  ]);
  expect(await records(logA)).toMatchObject([{ args, cwd: A, demo: '1' }]);

  const second = await fixture.invoke(B, 'codex', ['b'], { FAKE_LOG: logB });
  expect(second, second.stderr).toMatchObject({ code: 0 });
  expect(second.stderr).not.toContain('[arch:demo]');
  expect(events(second).map((e) => e.type)).toEqual(['execution.started', 'execution.completed']);
  expect(events(second)[0]?.payload.projectRoot).toBe(B);
  expect(await records(logB)).toMatchObject([{ args: ['b'], cwd: B, demo: '' }]);

  const third = await fixture.invoke(C, 'claude', ['c'], { FAKE_LOG: logC });
  expect(third, third.stderr).toMatchObject({ code: 0 });
  expect(third.stderr).not.toContain('[arch:');
  expect(await records(logC)).toMatchObject([{ args: ['c'], cwd: C, demo: '' }]);
  const outside = await fixture.invoke(root, 'claude');
  expect(outside).toMatchObject({ code: 0 });
  expect(events(outside)).toEqual([]);

  const denied = await fixture.invoke(A, 'claude', [], { ARCH_DEMO_DENY: '1', FAKE_LOG: logA });
  expect(denied.code).toBe(1);
  expect(await records(logA)).toHaveLength(1);
  expect(events(denied).map((e) => e.type)).toEqual([
    'execution.started',
    'middleware.completed',
    'execution.failed',
  ]);
  expect(denied.stderr).toContain('[arch:demo] cleanup');

  const concurrent = await Promise.all([
    fixture.invoke(A, 'claude', ['parallel-a'], { FAKE_LOG: logA }),
    fixture.invoke(B, 'codex', ['parallel-b'], { FAKE_LOG: logB }),
    fixture.invoke(C, 'claude', ['parallel-c'], { FAKE_LOG: logC }),
    fixture.invoke(A, 'codex', ['parallel-denied'], { FAKE_LOG: logA, ARCH_DEMO_DENY: '1' }),
  ]);
  expect(concurrent.map((r) => r.code)).toEqual([0, 0, 0, 1]);
  expect(await records(logA)).toHaveLength(2);
  expect(await records(logB)).toHaveLength(2);
  expect(await records(logC)).toHaveLength(2);
  expect(events(concurrent[2])).toEqual([]);
  const executionIds = concurrent
    .filter((_, index) => 2 !== index)
    .map((result) => {
      const observed = events(result);
      expect(new Set(observed.map((e) => e.executionId)).size).toBe(1);
      for (const e of observed) {
        expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(e.executionId).toMatch(/^[0-9a-f-]{36}$/);
        expect(e.schemaVersion).toBe(1);
        expect(Number.isNaN(Date.parse(e.timestamp))).toBe(false);
      }
      const first = observed[0];
      if (!first) {
        throw new Error('Expected an observed execution');
      }
      return first.executionId;
    });
  expect(new Set(executionIds).size).toBe(3);
  expect(concurrent[3].stderr).toContain('[arch:demo] cleanup');

  const sub = join(A, 'sub');
  await mkdir(sub);
  const nested = await fixture.invoke(sub);
  expect(nested).toMatchObject({ code: 0 });
  expect(events(nested)[0]?.payload.projectRoot).toBe(A);
  const again = await fixture.invoke(A);
  expect(again.stderr).toContain('[arch:demo] preflight');
  // Uninstall A without disturbing B; persistent mise wrappers fall back in A.
  const nativeBefore = await readFile(
    join(fixture.native, 'win32' === process.platform ? 'claude.exe' : 'claude'),
  );
  expect(await run(process.execPath, [cli, 'uninstall'], A, env)).toMatchObject({ code: 0 });
  const removed = await fixture.invoke(A);
  expect(removed).toMatchObject({ code: 0 });
  expect(events(removed)).toEqual([]);
  expect(events(await fixture.invoke(B, 'codex'))).toHaveLength(2);
  expect(
    await readFile(join(fixture.native, 'win32' === process.platform ? 'claude.exe' : 'claude')),
  ).toEqual(nativeBefore);
});
