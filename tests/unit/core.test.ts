import { beforeEach, afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { execute } from '../../src/core.js';
import { createPipeline, type Registry, type ArchMiddleware, type ExecutionContext } from '../../src/middleware.js';
import { EventBus, type ArchEvent } from '../../src/events.js';

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'arch-core-')); await mkdir(join(root, '.arch')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const context = (): ExecutionContext => Object.freeze({ executionId: 'id', projectRoot: root, command: 'tool', originalArgs: Object.freeze(['arg']), cwd: root, signal: new AbortController().signal });
async function configure(ids: string[]) {
  await writeFile(join(root, '.arch/harness.toml'), 'schema=1\n' + ids.map(id => `[[middleware]]\nid="${id}"\nenabled=true\n`).join(''));
}
const launchOptions = () => ({ command: basename(process.execPath), args: ['-e', 'process.exit(7)'], cwd: root, env: { PATH: dirname(process.execPath), SystemRoot: process.env.SystemRoot ?? '' } });

it('uses configuration order, immutable identity, fresh middleware, lifecycle events and cleanup', async () => {
  await configure(['second', 'first']);
  const calls: string[] = [], received: ArchEvent[] = [], contexts: ExecutionContext[] = [];
  const registry: Registry = new Map(['first', 'second'].map(id => [id, (): ArchMiddleware => ({ id, register(api) {
    contexts.push(api.context);
    expect(Object.isFrozen(api.context)).toBe(true);
    expect(Object.isFrozen(api.context.originalArgs)).toBe(true);
    api.on('preflight', () => { calls.push(id + ':pre'); });
    api.on('prepareLaunch', () => { api.setEnv('CUSTOM', 'same'); calls.push(id + ':prepare'); });
    api.on('finalize', () => { calls.push(id + ':final'); });
    api.cleanup(() => { calls.push(id + ':cleanup'); });
  } })]));
  let bus: EventBus | undefined;
  const result = await execute({ ...launchOptions(), registry, observe(value) {
    bus = value;
    for (const type of ['execution.started', 'middleware.completed', 'execution.completed', 'execution.failed'] as const) value.subscribe(type, e => { received.push(e); });
  } });
  expect(result.exitCode).toBe(7);
  expect(calls).toEqual(['second:pre', 'first:pre', 'second:prepare', 'first:prepare', 'second:final', 'first:final', 'first:cleanup', 'second:cleanup']);
  expect(contexts[0]).toBe(contexts[1]);
  expect(new Set(received.map(e => e.executionId)).size).toBe(1);
  expect(received.map(e => e.type)).toEqual(['execution.started', ...Array(6).fill('middleware.completed'), 'execution.completed']);
  expect(bus?.listenerCount).toBe(0);
});

it('denial prevents launch and observer failures cannot reverse it; all finalizers and cleanup run', async () => {
  await configure(['deny', 'other']);
  const calls: string[] = [], received: string[] = [];
  const registry: Registry = new Map(['deny', 'other'].map(id => [id, () => ({ id, register(api) {
    api.on('preflight', () => { if (id === 'deny') throw new Error('denied'); });
    api.on('finalize', () => { calls.push(id); if (id === 'deny') throw new Error('finalizer failed'); });
    api.cleanup(() => { calls.push(id + ':cleanup'); if (id === 'other') throw new Error('cleanup failed'); });
  } })]));
  const file = join(root, 'launched');
  await expect(execute({ ...launchOptions(), args: ['-e', `require('fs').writeFileSync(${JSON.stringify(file)}, '')`], registry,
    reportObserverError: () => {}, observe(bus) {
      bus.subscribe('execution.started', () => { throw new Error('observer failed'); });
      bus.subscribe('execution.failed', e => { received.push(e.type); });
    }
  })).rejects.toThrow('preflight');
  await expect(readFile(file)).rejects.toThrow();
  expect(calls).toEqual(['deny', 'other', 'other:cleanup', 'deny:cleanup']);
  expect(received).toEqual(['execution.failed']);
});

it('cleans partially registered middleware and rejects unknown/mismatched module ids', async () => {
  await configure(['broken']);
  let cleaned = false;
  await expect(execute({ ...launchOptions(), registry: new Map([['broken', () => ({ id: 'broken', register(api) {
    api.cleanup(() => { cleaned = true; }); throw new Error('registration failed');
  } })]]) })).rejects.toThrow('registration');
  expect(cleaned).toBe(true);
  await expect(execute({ ...launchOptions(), registry: new Map() })).rejects.toThrow();
  await expect(execute({ ...launchOptions(), registry: new Map([['broken', () => ({ id: 'different', register() {} })]]) })).rejects.toThrow();
});

it('validates launch changes and conflicts without allowing late hook registration', async () => {
  const pipeline = createPipeline(context(), new EventBus());
  pipeline.register({ id: 'one', register(api) {
    expect(() => api.setEnv('FOO', 'bar')).toThrow();
    api.on('prepareLaunch', () => {
      expect(() => api.setEnv('PATH', 'override')).toThrow();
      expect(() => api.setEnv('BAD=KEY', 'value')).toThrow();
      expect(() => api.setEnv('VALUE', '\0')).toThrow();
      expect(() => api.on('preflight', () => {})).toThrow();
      api.setEnv('FOO', 'one');
    });
  } });
  pipeline.register({ id: 'two', register(api) { api.on('prepareLaunch', () => { api.setEnv('FOO', 'two'); }); } });
  await expect(pipeline.run('prepareLaunch')).rejects.toThrow('Conflicting');
  await pipeline.run('finalize'); await pipeline.dispose();
});

it('keeps concurrent contexts, mutable launch changes, events and cleanup isolated', async () => {
  await configure(['local']);
  const contexts: ExecutionContext[] = [], cleaned: string[] = [];
  const registry: Registry = new Map([['local', () => ({ id: 'local', register(api) {
    contexts.push(api.context);
    api.on('prepareLaunch', async () => { await Promise.resolve(); api.setEnv('ISOLATED_ID', api.context.executionId); });
    api.cleanup(() => { cleaned.push(api.context.executionId); });
  } })]]);
  const sets: ArchEvent[][] = [[], []];
  await Promise.all(sets.map(async (received, index) => {
    const file = join(root, `${index}.json`);
    await execute({ ...launchOptions(), registry, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(file)}, process.env.ISOLATED_ID)`],
      observe(bus) { bus.subscribe('execution.started', e => { received.push(e); }); } });
    expect(await readFile(file, 'utf8')).toBe(received[0]?.executionId);
  }));
  expect(new Set(contexts.map(c => c.executionId)).size).toBe(2);
  expect(new Set(cleaned)).toEqual(new Set(contexts.map(c => c.executionId)));
});

it('rejects recursive invocations and aborted launches', async () => {
  await configure([]);
  await expect(execute({ ...launchOptions(), env: { ARCH_ACTIVE: 'existing' } })).rejects.toThrow('Recursive');
  await expect(execute({ ...launchOptions(), signal: AbortSignal.abort('SIGTERM') })).rejects.toThrow();
});

it('reports observer initialization errors by identity and continues native execution', async () => {
  await configure([]);
  const error = new Error('observer setup failed'), received: unknown[] = [];
  const result = await execute({ ...launchOptions(), observe() { throw error; }, reportObserverError(value) { received.push(value); } });
  expect(result.exitCode).toBe(7); expect(received).toEqual([error]);
});

it('contains observer diagnostic errors while preserving middleware denial and listener disposal', async () => {
  await configure(['deny']);
  const error = new Error('observer setup failed'), received: unknown[] = [];
  let bus: EventBus | undefined;
  const registry: Registry = new Map([['deny', () => ({ id: 'deny', register(api) {
    api.on('preflight', () => { throw new Error('denied'); });
  } })]]);
  await expect(execute({ ...launchOptions(), registry, observe(value) {
    bus = value; value.subscribe('execution.started', () => {}); throw error;
  }, reportObserverError(value) { received.push(value); throw new Error('reporter failed'); } })).rejects.toThrow('preflight');
  expect(received).toEqual([error]); expect(bus?.listenerCount).toBe(0);
  await configure([]);
  expect((await execute({ ...launchOptions(), observe() { throw error; }, reportObserverError() { throw error; } })).exitCode).toBe(7);
});

it('contains rejected observer and reporter promises without unhandled rejections', async () => {
  await configure([]);
  const error = new Error('async observer error'), received: unknown[] = [];
  const result = await execute({ ...launchOptions(), async observe() { await Promise.resolve(); throw error; },
    async reportObserverError(value) { received.push(value); await Promise.resolve(); throw new Error('async reporter error'); } });
  expect(result.exitCode).toBe(7); expect(received).toEqual([error]);
});
