import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rename, rm, unlink, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publishExclusive } from '../../src/lifecycle/routing-files.js';
import {
  PublicationError,
  renameNoReplace,
  win32Failure,
  verifyPublicationResponse,
} from '../../src/lifecycle/native-publication.js';
import { setup } from '../../src/installation/setup.js';
import { digest, stateFrom } from '../../src/lifecycle/manifest.js';
import { checkFiles } from '../../src/lifecycle/ownership.js';

vi.mock('../../src/lifecycle/native-publication.js', async (original) => ({
  ...(await original<typeof import('../../src/lifecycle/native-publication.js')>()),
  nativePublication: true,
  renameNoReplace: vi.fn(),
}));
let root: string;
const lost = () => new PublicationError('execution', 'response lost', 'unknown');
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'arch-native-state-'));
  vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
    await rename(source, target);
  });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('accepts only agreeing process and syscall success', () => {
  expect(() => {
    verifyPublicationResponse(null, '{"protocol":1,"win32":0}\r\n', '');
  }).not.toThrow();
});
it.each([
  '',
  'garbage',
  'null',
  '[]',
  '{}',
  '{"protocol":2,"win32":0}',
  '{"protocol":1}',
  '{"protocol":1,"win32":"0"}',
  '{"protocol":1,"win32":-1}',
  '{"protocol":1,"win32":0.5}',
  '{"protocol":1,"win32":4294967296}',
])('preserves unknown completion for malformed response %s', (stdout) => {
  expect(() => {
    verifyPublicationResponse(null, stdout, '');
  }).toThrow(expect.objectContaining({ kind: 'protocol', outcome: 'unknown' }));
});
it.each([
  { code: 0 },
  { code: 1 },
  { code: 'ENOENT' },
  { code: 1, killed: true },
  { code: 1, signal: 'SIGKILL' },
] as const)('never equates helper execution failure with syscall failure: %j', (details) => {
  const error = Object.assign(new Error('helper failure'), details);
  expect(() => {
    verifyPublicationResponse(error, '{"protocol":1,"win32":0}', '');
  }).toThrow(
    expect.objectContaining({
      outcome: 'unknown',
      cause: { error, stdout: '{"protocol":1,"win32":0}', stderr: '' },
    }),
  );
});
it('requires OS failure and exit 1 to agree, preserving original OS evidence', () => {
  const error = Object.assign(new Error('OS failure'), { code: 1 });
  expect(() => {
    verifyPublicationResponse(error, '{"protocol":1,"win32":32}', '');
  }).toThrow(expect.objectContaining({ kind: 'sharing', outcome: 'not-published', win32: 32 }));
  expect(() => {
    verifyPublicationResponse(null, '{"protocol":1,"win32":32}', '');
  }).toThrow(expect.objectContaining({ outcome: 'unknown' }));
  expect(() => {
    verifyPublicationResponse(null, '{"protocol":1,"win32":0}', 'unexpected stderr');
  }).toThrow(expect.objectContaining({ outcome: 'unknown' }));
});

it.each([
  [183, 'collision'],
  [80, 'collision'],
  [2, 'missing-source'],
  [3, 'missing-source'],
  [5, 'permission'],
  [32, 'sharing'],
  [33, 'sharing'],
  [17, 'cross-volume'],
  [1, 'unsupported'],
  [50, 'unsupported'],
  [120, 'unsupported'],
  [87, 'invalid-input'],
  [123, 'invalid-input'],
  [206, 'invalid-input'],
  [999, 'unknown'],
] as const)('retains distinct Win32 %s classification', (code, kind) => {
  expect(win32Failure(code)).toBe(kind);
});
it.each(['normal', 'lost'])(
  'verifies consumed source identity and bytes after %s response',
  async (mode) => {
    await writeFile(join(root, 'stage'), 'complete');
    const original = await lstat(join(root, 'stage'), { bigint: true });
    if ('lost' === mode) {
      vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
        await rename(source, target);
        throw lost();
      });
    }
    await publishExclusive(root, 'stage', 'target', digest('complete'));
    expect(await readFile(join(root, 'target'), 'utf8')).toBe('complete');
    expect((await lstat(join(root, 'target'), { bigint: true })).ino).toBe(original.ino);
    await expect(lstat(join(root, 'stage'))).rejects.toMatchObject({ code: 'ENOENT' });
  },
);
it.each(['missing', 'partial', 'directory'])(
  'rejects mandatory %s stage before invocation',
  async (mode) => {
    if ('partial' === mode) {
      await writeFile(join(root, 'stage'), 'partial');
    }
    if ('directory' === mode) {
      await mkdir(join(root, 'stage'));
    }
    await expect(publishExclusive(root, 'stage', 'target', digest('complete'))).rejects.toThrow();
    expect(renameNoReplace).not.toHaveBeenCalled();
    await expect(lstat(join(root, 'target'))).rejects.toMatchObject({ code: 'ENOENT' });
  },
);
it.each(['../escape', '/absolute', 'a/../escape', 'a\\escape', 'a:stream', 'a//b', './stage'])(
  'rejects unsafe publication path %s',
  async (path) => {
    await expect(publishExclusive(root, path, 'target', digest('complete'))).rejects.toThrow(
      'Invalid publication path',
    );
    expect(renameNoReplace).not.toHaveBeenCalled();
  },
);
it('rejects identical source and destination', async () => {
  await expect(publishExclusive(root, 'stage', 'stage', digest('complete'))).rejects.toThrow(
    'must differ',
  );
});
it.each(['reply', 'lost'])(
  'does not adopt a same-byte foreign target after %s response',
  async (mode) => {
    await writeFile(join(root, 'stage'), 'complete');
    vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
      await writeFile(target, 'complete', { flag: 'wx' });
      await unlink(source);
      if ('lost' === mode) {
        throw lost();
      }
    });
    await expect(
      publishExclusive(root, 'stage', 'target', digest('complete')),
    ).rejects.toMatchObject({ outcome: 'unknown' });
    expect(await readFile(join(root, 'target'), 'utf8')).toBe('complete');
  },
);
it('does not treat an unconsumed stage as publication success', async () => {
  await writeFile(join(root, 'stage'), 'complete');
  vi.mocked(renameNoReplace).mockResolvedValue();
  await expect(publishExclusive(root, 'stage', 'target', digest('complete'))).rejects.toMatchObject(
    { outcome: 'unknown' },
  );
  expect(await readFile(join(root, 'stage'), 'utf8')).toBe('complete');
});
it('keeps a definite collision distinct and never adopts matching bytes', async () => {
  await writeFile(join(root, 'stage'), 'complete');
  await writeFile(join(root, 'target'), 'complete');
  const collision = new PublicationError('collision', 'collision', 'not-published', 183);
  vi.mocked(renameNoReplace).mockRejectedValue(collision);
  await expect(publishExclusive(root, 'stage', 'target', digest('complete'))).rejects.toBe(
    collision,
  );
  expect(await readFile(join(root, 'stage'), 'utf8')).toBe('complete');
});
it.each(['first', 'bootstrap'])(
  'preserves setup evidence for indeterminate %s publication',
  async (boundary) => {
    vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
      if ('first' === boundary || target.endsWith('bootstrap.json')) {
        await writeFile(target, await readFile(source), { flag: 'wx' });
        await unlink(source);
        throw lost();
      }
      await rename(source, target);
    });
    await expect(setup(root, ['tool'])).rejects.toThrow('indeterminate');
    expect(await readFile(join(root, '.config/mise/conf.d/arch.toml'), 'utf8')).toContain('Arch');
    if ('bootstrap' === boundary) {
      const manifest = stateFrom(await readFile(join(root, '.arch/bootstrap.json')));
      await checkFiles(root, manifest.files);
    }
  },
);
it('preserves attributable committed setup when bootstrap response is lost', async () => {
  vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
    await rename(source, target);
    if (target.endsWith('bootstrap.json')) {
      throw lost();
    }
  });
  await setup(root, ['tool']);
  const manifest = await readFile(join(root, '.arch/bootstrap.json'));
  await checkFiles(root, stateFrom(manifest).files);
  await setup(root, ['tool']);
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(manifest);
});
