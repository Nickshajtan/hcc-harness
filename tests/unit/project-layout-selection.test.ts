import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { lstat, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigurationDirectory } from '../../src/config.js';
import {
  projectLayout,
  resolveProjectLayout,
  resolveProjectLayoutAt,
} from '../../src/project-layout.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, lstat: vi.fn(actual.lstat), readdir: vi.fn(actual.readdir) };
});
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
let root: string;
beforeEach(async () => {
  vi.mocked(lstat).mockImplementation(actual.lstat);
  vi.mocked(readdir).mockImplementation(actual.readdir);
  root = await mkdtemp(join(tmpdir(), 'hcc-selection-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

it('rejects unsupported runtime selectors even without any configuration', async () => {
  const invalid = '.other' as ConfigurationDirectory;
  expect(() => projectLayout(root, invalid)).toThrow('Invalid trusted');
  await expect(resolveProjectLayoutAt(root, invalid)).rejects.toThrow('Invalid trusted');
  await expect(resolveProjectLayout(root, invalid)).rejects.toThrow('Invalid trusted');
});

it('keeps explicit service roots separate while CLI discovery selects the nearest ancestor', async () => {
  await mkdir(join(root, '.ai/arch'), { recursive: true });
  await writeFile(join(root, '.ai/arch/harness.toml'), 'schema=1');
  const child = join(root, 'nested');
  await mkdir(child);
  expect(await resolveProjectLayout(child)).toEqual(projectLayout(root, '.ai/arch'));
  expect(await resolveProjectLayoutAt(child)).toEqual(projectLayout(child));
  await expect(resolveProjectLayout(child, '.hcc')).rejects.toThrow('no implicit migration');
  expect(await readdir(child)).toEqual([]);
});

it('detects orphan stages without adopting their bytes or hiding parent boundaries', async () => {
  await mkdir(join(root, '.hcc'), { recursive: true });
  await writeFile(join(root, '.hcc/.setup-unknown'), 'unknown evidence');
  expect(await resolveProjectLayoutAt(root)).toEqual(projectLayout(root, '.hcc'));
  await mkdir(join(root, '.arch'), { recursive: true });
  await writeFile(join(root, '.arch/.routing-unknown.stage'), 'unknown evidence');
  await expect(resolveProjectLayoutAt(root)).rejects.toThrow('Conflicting HCC');
});

it.each(['probe', 'directory'] as const)(
  'propagates %s permission errors without selecting another home',
  async (stage) => {
    const failure = Object.assign(new Error('denied'), { code: 'EACCES' });
    if ('probe' === stage) {
      vi.mocked(lstat).mockRejectedValue(failure);
    } else {
      vi.mocked(readdir).mockRejectedValue(failure);
    }
    await expect(resolveProjectLayoutAt(root)).rejects.toBe(failure);
    expect(await actual.readdir(root)).toEqual([]);
  },
);

it.each([
  'harness.toml',
  'bootstrap.json',
  'uninstall.json',
  'routing.json',
  'routing.stage',
  'setup-claim',
  '.routing-unattributed.stage',
])('keeps %s evidence discoverable without parsing or granting ownership', async (name) => {
  await mkdir(join(root, '.hcc'));
  await writeFile(join(root, '.hcc', name), 'untrusted evidence');
  const layout = await resolveProjectLayoutAt(root);
  expect(layout.directory).toBe('.hcc');
  expect(layout.configurationDirectory).toBe(join(root, '.hcc'));
  expect(layout.configurationPath).toBe('.hcc/harness.toml');
  expect(layout.internalDirectory).toBe('.hcc/.internal');
  expect(await actual.readdir(root)).toEqual(['.hcc']);
});
