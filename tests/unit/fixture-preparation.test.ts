import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, rm, mkdtemp, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { world } from '../support.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, mkdir: vi.fn(actual.mkdir), rm: vi.fn(actual.rm) };
});
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const roots: string[] = [];
afterEach(async () => {
  vi.mocked(mkdir).mockImplementation(actual.mkdir);
  vi.mocked(rm).mockImplementation(actual.rm);
  await Promise.all(
    roots.splice(0).map((root) => actual.rm(root, { recursive: true, force: true })),
  );
});

it('awaits all sibling preparations before removing a failed fixture and preserves the primary error', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'arch-fixture-preparation-'));
  roots.push(parent);
  const failure = new Error('home preparation denied');
  let release: (() => void) | undefined;
  let reached: (() => void) | undefined;
  const ready = new Promise<void>((done) => {
    reached = done;
  });
  const barrier = new Promise<void>((done) => {
    release = done;
  });
  let fixtureRoot: string | undefined;
  vi.mocked(mkdir).mockImplementation(async (path, options) => {
    if ('string' === typeof path && 'home' === basename(path)) {
      throw failure;
    }
    if ('string' === typeof path && 'data' === basename(path)) {
      fixtureRoot = join(path, '..');
      reached?.();
      await barrier;
    }
    return actual.mkdir(path, options);
  });
  const preparation = world(parent);
  // Observe rejection immediately; the barrier keeps the owned sibling pending.
  const outcome = preparation.catch((error: unknown) => error);
  await ready;
  expect(rm).not.toHaveBeenCalled();
  release?.();
  expect(await outcome).toBe(failure);
  if (!fixtureRoot) {
    throw new Error('Fixture never reached the controlled preparation');
  }
  await expect(lstat(fixtureRoot)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('retains primary and secondary errors if failed fixture preparation cannot be cleaned', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'arch-fixture-cleanup-'));
  roots.push(parent);
  const primary = new Error('preparation denied');
  const secondary = new Error('cleanup denied');
  vi.mocked(mkdir).mockImplementation(async (path, options) => {
    if ('string' === typeof path && 'home' === basename(path)) {
      throw primary;
    }
    return actual.mkdir(path, options);
  });
  vi.mocked(rm).mockRejectedValue(secondary);
  const result: unknown = await world(parent).catch((error: unknown) => error);
  expect(result).toBeInstanceOf(AggregateError);
  if (!(result instanceof AggregateError)) {
    throw new Error('Missing cleanup aggregation');
  }
  expect(result.errors).toEqual([primary, secondary]);
  expect(result.cause).toBe(primary);
});
