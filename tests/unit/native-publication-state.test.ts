import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
  unlink,
  lstat,
  open,
} from 'node:fs/promises';
import { join, dirname } from 'node:path';
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

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

vi.mock('../../src/lifecycle/native-publication.js', async (original) => ({
  ...(await original<typeof import('../../src/lifecycle/native-publication.js')>()),
  usesNativePublication: () => true,
  renameNoReplace: vi.fn(),
}));
let root: string;
const lost = () => new PublicationError('execution', 'response lost', 'unknown');
beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(open).mockImplementation(actual.open);
  root = await mkdtemp(join(tmpdir(), 'arch-native-state-'));
  vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
    await rename(source, target);
  });
});

it.each(['identity', 'bytes'])(
  'rechecks held-source %s before invoking the native operation',
  async (kind) => {
    await writeFile(join(root, 'stage'), 'complete');
    vi.mocked(open).mockImplementation(async (...args) => {
      if ('identity' === kind) {
        await rename(join(root, 'stage'), join(root, 'original'));
      }
      await writeFile(join(root, 'stage'), 'identity' === kind ? 'complete' : 'partial');
      return actual.open(...args);
    });
    await expect(publishExclusive(root, 'stage', 'target', digest('complete'))).rejects.toThrow(
      'source identity changed',
    );
    expect(renameNoReplace).not.toHaveBeenCalled();
    expect(await readFile(join(root, 'stage'), 'utf8')).toBe(
      'identity' === kind ? 'complete' : 'partial',
    );
  },
);
it.each(['published', 'refused'])(
  'retains primary and handle-close evidence after %s operation',
  async (mode) => {
    await writeFile(join(root, 'stage'), 'complete');
    const cleanup = new Error('handle close failed');
    const primary = new PublicationError('permission', 'permission denied', 'not-published', 5);
    vi.mocked(open).mockImplementation(async (...args) => {
      const held = await actual.open(...args),
        close = held.close.bind(held);
      held.close = async () => {
        await close();
        throw cleanup;
      };
      return held;
    });
    if ('refused' === mode) {
      vi.mocked(renameNoReplace).mockRejectedValue(primary);
    }
    const error: unknown = await publishExclusive(
      root,
      'stage',
      'target',
      digest('complete'),
    ).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(PublicationError);
    if (!(error instanceof PublicationError)) {
      throw new Error('Expected close failure');
    }
    expect(error.outcome).toBe('unknown');
    if ('published' === mode) {
      expect(error.cause).toBe(cleanup);
      expect(await readFile(join(root, 'target'), 'utf8')).toBe('complete');
    } else {
      expect(error.cause).toBeInstanceOf(AggregateError);
      if (!(error.cause instanceof AggregateError)) {
        throw new Error('Expected both failures');
      }
      expect(error.cause.errors).toEqual([primary, cleanup]);
      expect(error.cause.cause).toBe(primary);
    }
  },
);
it('preserves an attributed target whose bytes changed instead of declaring completion', async () => {
  await writeFile(join(root, 'stage'), 'complete');
  vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
    await rename(source, target);
    await writeFile(target, 'modified');
    throw lost();
  });
  await expect(publishExclusive(root, 'stage', 'target', digest('complete'))).rejects.toMatchObject(
    { outcome: 'unknown' },
  );
  expect(await readFile(join(root, 'target'), 'utf8')).toBe('modified');
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
  'true',
  '42',
  '"text"',
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
  }).toThrow(
    expect.objectContaining({
      kind: 'sharing',
      outcome: 'not-published',
      win32: 32,
      message: 'Native exclusive publication failed (Win32 32)',
      cause: { error, stdout: '{"protocol":1,"win32":32}', stderr: '' },
    }),
  );
  expect(() => {
    verifyPublicationResponse(null, '{"protocol":1,"win32":32}', '');
  }).toThrow(expect.objectContaining({ outcome: 'unknown' }));
  expect(() => {
    verifyPublicationResponse(null, '{"protocol":1,"win32":0}', 'unexpected stderr');
  }).toThrow(expect.objectContaining({ outcome: 'unknown' }));
});
it.each([-1, 4294967296])(
  'rejects out-of-range OS code %s even when process exit agrees',
  (code) => {
    const error = Object.assign(new Error('helper refused'), { code: 1 });
    expect(() => {
      verifyPublicationResponse(error, JSON.stringify({ protocol: 1, win32: code }), '');
    }).toThrow(expect.objectContaining({ kind: 'execution', outcome: 'unknown' }));
  },
);
it('retains the maximum valid DWORD OS error without inventing success', () => {
  const error = Object.assign(new Error('helper refused'), { code: 1 });
  expect(() => {
    verifyPublicationResponse(error, '{"protocol":1,"win32":4294967295}', '');
  }).toThrow(
    expect.objectContaining({ kind: 'unknown', outcome: 'not-published', win32: 4294967295 }),
  );
});
it.each([{ killed: true }, { signal: 'SIGKILL' }, { code: 'ENOENT' }] as const)(
  'does not trust an OS refusal reply after process failure %j',
  (details) => {
    const error = Object.assign(new Error('process failed'), { code: 1 }, details);
    expect(() => {
      verifyPublicationResponse(error, '{"protocol":1,"win32":32}', '');
    }).toThrow(expect.objectContaining({ outcome: 'unknown', kind: 'execution' }));
  },
);

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
it('retains the original helper failure when filesystem attribution resolves publication', async () => {
  await writeFile(join(root, 'stage'), 'complete');
  const failure = lost(),
    warnings: Error[] = [];
  const observe = (warning: Error) => {
    if (warning.cause === failure) {
      warnings.push(warning);
    }
  };
  process.on('warning', observe);
  try {
    vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
      await rename(source, target);
      throw failure;
    });
    const result = await publishExclusive(root, 'stage', 'target', digest('complete'));
    expect('helperFailure' in result && result.helperFailure).toBe(failure);
    await new Promise<void>((done) => {
      setImmediate(done);
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      name: 'PublicationHelperWarning',
      code: 'ARCH_PUBLICATION_RESPONSE',
      cause: failure,
    });
    expect(warnings[0]?.message).toContain('Published target');
    expect(warnings[0]).toHaveProperty('detail', expect.stringContaining('response lost'));
  } finally {
    process.off('warning', observe);
  }
});
it.each(['fields', 'message'])(
  'bounds recovered diagnostic %s while retaining the original cause',
  async (mode) => {
    await writeFile(join(root, 'stage'), 'complete');
    const failure = new PublicationError(
      'execution',
      'message' === mode ? 'x'.repeat(20000) : 'helper failed',
      'unknown',
      undefined,
      { cause: { stdout: 'o'.repeat(20000), stderr: 's'.repeat(20000) } },
    );
    const emit = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    try {
      vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
        await rename(source, target);
        throw failure;
      });
      await publishExclusive(root, 'stage', 'target', digest('complete'));
      expect(emit).toHaveBeenCalledTimes(1);
      const warning = emit.mock.calls[0]?.[0];
      if (
        !(warning instanceof Error) ||
        !('detail' in warning) ||
        'string' !== typeof warning.detail
      ) {
        throw new Error('Expected structured diagnostic');
      }
      expect(warning.cause).toBe(failure);
      const suffix = '\n[bounded diagnostic excerpt; original cause retained]';
      expect(warning.detail.length).toBeLessThanOrEqual(8192 + suffix.length);
      expect(warning.detail.startsWith('PublicationError: ')).toBe(true);
      expect(warning.detail.endsWith(suffix)).toBe(true);
      if ('fields' === mode) {
        expect(warning.detail).toContain('stdout');
        expect(warning.detail).toContain('stderr');
      }
    } finally {
      emit.mockRestore();
    }
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
it('refuses success when an attributed complete target still has the source name', async () => {
  await writeFile(join(root, 'stage'), 'complete');
  vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
    await actual.link(source, target);
  });
  await expect(publishExclusive(root, 'stage', 'target', digest('complete'))).rejects.toMatchObject(
    { outcome: 'unknown' },
  );
  expect(await readFile(join(root, 'stage'), 'utf8')).toBe('complete');
  expect(await readFile(join(root, 'target'), 'utf8')).toBe('complete');
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
it('preserves committed setup and foreign private residue when actual directory cleanup fails', async () => {
  let residue: string | undefined;
  vi.mocked(renameNoReplace).mockImplementation(async (source, target) => {
    await rename(source, target);
    if (target.endsWith('bootstrap.json')) {
      residue = join(dirname(source), 'foreign.txt');
      await writeFile(residue, 'preserve foreign residue', { flag: 'wx' });
    }
  });
  const error: unknown = await setup(root, ['tool']).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(Error);
  if (!(error instanceof Error)) {
    throw new Error('Expected cleanup error');
  }
  expect(error.message).toContain('setup committed');
  expect(error.cause).toMatchObject({ code: 'ENOTEMPTY' });
  const manifest = await readFile(join(root, '.arch/bootstrap.json'));
  await checkFiles(root, stateFrom(manifest).files);
  if (undefined === residue) {
    throw new Error('Expected retained residue');
  }
  expect(await readFile(residue, 'utf8')).toBe('preserve foreign residue');
  await expect(setup(root, ['tool'])).rejects.toThrow('Unresolved setup claim');
  expect(await readFile(join(root, '.arch/bootstrap.json'))).toEqual(manifest);
});
