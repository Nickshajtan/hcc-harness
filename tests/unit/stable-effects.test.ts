import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { installStable, type InstallCheckpoint } from '../../src/installation/stable-install.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    copyFile: vi.fn(actual.copyFile),
    mkdir: vi.fn(actual.mkdir),
    writeFile: vi.fn(actual.writeFile),
  };
});
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
let root: string, source: string, destination: string, npm: string;
beforeEach(async () => {
  vi.mocked(copyFile).mockImplementation(actual.copyFile);
  vi.mocked(mkdir).mockImplementation(actual.mkdir);
  vi.mocked(writeFile).mockImplementation(actual.writeFile);
  root = await mkdtemp(join(await realpath(tmpdir()), 'arch-stable-effects-'));
  source = join(root, 'source');
  destination = join(root, 'app');
  npm = join(root, 'controlled-npm.cjs');
  await writeFile(
    npm,
    `const expected = ['ci','--prefix',process.cwd(),'--omit=dev','--ignore-scripts','--no-audit','--no-fund'];
    if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(expected)) process.exitCode = 9;
  `,
  );
  await mkdir(source);
  await mkdir(join(source, 'dist'));
  await mkdir(join(source, 'vendor'));
  await mkdir(join(source, 'runtime'));
  await mkdir(join(source, '.tools/stable-bootstrap'), { recursive: true });
  await writeFile(join(source, 'dist/cli.js'), 'console.log("fixture help");');
  await writeFile(join(source, 'dist/cli.d.ts'), '// not needed at runtime');
  for (const name of ['shim-x64.exe', 'shim-arm64.exe']) {
    await writeFile(join(source, 'vendor', name), 'controlled vendor fixture');
  }
  await writeFile(join(source, 'runtime/arch'), '#!/bin/sh\nexit 0\n');
  if ('win32' === process.platform) {
    await mkdir(join(source, '.tools/publication'), { recursive: true });
    for (const file of ['arch-publication-v1.exe', 'provenance.json']) {
      await copyFile(resolve('.tools/publication', file), join(source, '.tools/publication', file));
    }
    await copyFile(
      resolve('.tools/stable-bootstrap/arch-bootstrap.exe'),
      join(source, '.tools/stable-bootstrap/arch-bootstrap.exe'),
    );
  }
  await writeFile(
    join(source, 'package.json'),
    '{"type":"module","dependencies":{},"scripts":{"dev":"not shipped"},"devDependencies":{},"allowScripts":{}}',
  );
  await writeFile(join(source, 'package-lock.json'), '{}');
  await writeFile(join(source, 'LICENSE'), 'Controlled fixture license');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
function install(checkpoint?: (stage: InstallCheckpoint) => Promise<void>) {
  return installStable({ source, destination, npm, ...(checkpoint ? { checkpoint } : {}) });
}
it.skipIf('win32' !== process.platform)(
  'refuses an incompatible helper build protocol before readiness',
  async () => {
    const path = join(source, '.tools/publication/provenance.json');
    const metadata: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!metadata || 'object' !== typeof metadata) {
      throw new Error('Expected build provenance');
    }
    await writeFile(path, JSON.stringify({ ...metadata, protocol: 2 }));
    await expect(install()).rejects.toMatchObject({
      cause: { message: 'Publication helper build integrity failure' },
    });
    await expect(readdir(join(destination, '.arch-ready'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  },
);
it('publishes readiness only after verification and records exact installed bytes', async () => {
  const stages: string[] = [];
  await install(async (stage) => {
    stages.push(stage);
    if ('published' !== stage) {
      await expect(readdir(join(destination, '.arch-ready'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  });
  expect(stages).toEqual(['reserved', 'materialized', 'verified', 'published']);
  const metadata: unknown = JSON.parse(
    await readFile(join(destination, 'installation.json'), 'utf8'),
  );
  if (
    !metadata ||
    'object' !== typeof metadata ||
    !('files' in metadata) ||
    !metadata.files ||
    'object' !== typeof metadata.files
  ) {
    throw new Error('Missing installed hashes');
  }
  for (const [file, hash] of Object.entries(metadata.files)) {
    expect(
      createHash('sha256')
        .update(await readFile(join(destination, file)))
        .digest('hex'),
    ).toBe(hash);
  }
  expect(Object.keys(metadata.files)).toContain('application/dist/cli.js');
  const entry = 'win32' === process.platform ? 'arch.exe' : 'arch';
  expect(Object.keys(metadata.files)).toContain(entry);
  expect(await readFile(join(destination, entry))).toEqual(
    await readFile(
      join(
        source,
        'win32' === process.platform
          ? '.tools/stable-bootstrap/arch-bootstrap.exe'
          : 'runtime/arch',
      ),
    ),
  );
  expect(Object.keys(metadata.files)).not.toContain('application/dist/cli.d.ts');
  const pkg = await readFile(join(destination, 'application/package.json'), 'utf8');
  expect(pkg).not.toMatch(/scripts|devDependencies|allowScripts/);
});
it('preserves late unowned entrypoint collisions and the original filesystem cause', async () => {
  const entry = join(destination, 'win32' === process.platform ? 'arch.exe' : 'arch');
  vi.mocked(copyFile).mockImplementation(async (from, to, flags) => {
    if (to === entry) {
      await actual.writeFile(entry, 'user file');
    }
    await actual.copyFile(from, to, flags);
  });
  await expect(install()).rejects.toMatchObject({ cause: { code: 'EEXIST' } });
  expect(await readFile(entry, 'utf8')).toBe('user file');
  await expect(readdir(join(destination, '.arch-ready'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('retains metadata write failure identity and refuses to publish readiness', async () => {
  const failure = Object.assign(new Error('metadata permission denied'), { code: 'EACCES' });
  vi.mocked(writeFile).mockImplementation(async (...args) => {
    if (args[0] === join(destination, 'installation.json')) {
      throw failure;
    }
    await actual.writeFile(...args);
  });
  const error: unknown = await install().catch((failure: unknown) => failure);
  expect(error).toMatchObject({ cause: failure });
  if (!(error instanceof Error)) {
    throw new Error('Expected installation failure');
  }
  expect(error.message).toContain('verified');
  await expect(readdir(join(destination, '.arch-ready'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('does not replace a late completion metadata collision', async () => {
  await expect(
    install(async (stage) => {
      if ('verified' === stage) {
        await writeFile(join(destination, 'installation.json'), 'user metadata');
      }
    }),
  ).rejects.toMatchObject({ cause: { code: 'EEXIST' } });
  expect(await readFile(join(destination, 'installation.json'), 'utf8')).toBe('user metadata');
  await expect(readdir(join(destination, '.arch-ready'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('retains verified data and metadata when readiness publication is denied', async () => {
  const failure = Object.assign(new Error('publish denied'), { code: 'EPERM' });
  vi.mocked(mkdir).mockImplementation(async (...args) => {
    if (args[0] === join(destination, '.arch-ready')) {
      throw failure;
    }
    return actual.mkdir(...args);
  });
  await expect(install()).rejects.toMatchObject({ cause: failure });
  expect(await readFile(join(destination, 'installation.json'), 'utf8')).toContain(
    'arch-stable-installation-v1',
  );
  await expect(readdir(join(destination, '.arch-ready'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('refuses unsupported Windows bootstrap architecture before reserving a destination', async () => {
  vi.stubGlobal('process', { ...process, platform: 'win32', arch: 'arm64' });
  try {
    await expect(install()).rejects.toThrow('requires x64');
    await expect(readdir(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    vi.unstubAllGlobals();
  }
});
it('reports exclusive reservation permission failure before any materialization', async () => {
  const failure = Object.assign(new Error('reservation denied'), { code: 'EPERM' });
  vi.mocked(mkdir).mockImplementation(async (...args) => {
    if (args[0] === destination) {
      throw failure;
    }
    return actual.mkdir(...args);
  });
  await expect(install()).rejects.toBe(failure);
  await expect(readdir(destination)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('does not publish if required vendor resources are missing', async () => {
  await rm(join(source, 'vendor/shim-arm64.exe'));
  await expect(install()).rejects.toThrow('materialized');
  await expect(readdir(join(destination, '.arch-ready'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('refuses a directory in place of a required vendor executable', async () => {
  await rm(join(source, 'vendor/shim-arm64.exe'));
  await mkdir(join(source, 'vendor/shim-arm64.exe'));
  await writeFile(join(source, 'vendor/shim-arm64.exe/payload.txt'), 'directory payload');
  await expect(install()).rejects.toMatchObject({
    cause: new Error('Missing installation resource: vendor/shim-arm64.exe'),
  });
});
it('refuses invalid package metadata before dependency verification', async () => {
  await writeFile(join(source, 'package.json'), 'null');
  await expect(install()).rejects.toMatchObject({
    cause: new Error('Invalid application package metadata'),
  });
});
it('does not publish if application import/dispatch verification fails', async () => {
  await writeFile(
    join(source, 'dist/cli.js'),
    'throw new Error("controlled application failure");',
  );
  const error: unknown = await install().catch((failure: unknown) => failure);
  expect(error).toMatchObject({ cause: { code: 1 } });
  if (!(error instanceof Error)) {
    throw new Error('Expected application verification failure');
  }
  expect(error.message).toContain('materialized');
});
it('does not report success when the installed bootstrap cannot execute', async () => {
  if ('win32' === process.platform) {
    await writeFile(
      join(source, '.tools/stable-bootstrap/arch-bootstrap.exe'),
      'not an executable',
    );
  } else {
    await writeFile(join(source, 'runtime/arch'), '#!/bin/sh\nexit 9\n');
  }
  await expect(install()).rejects.toThrow('published');
  expect(await readFile(join(destination, 'installation.json'), 'utf8')).toContain(
    'arch-stable-installation-v1',
  );
});
it('does not certify dependencies that resolve outside the snapshot or are missing', async () => {
  await writeFile(
    join(source, 'package.json'),
    '{"type":"module","dependencies":{"not-installed":"1"}}',
  );
  await expect(install()).rejects.toMatchObject({ cause: { code: 1 } });
});
it('refuses checkout references and symlinked resources without deleting them', async () => {
  await writeFile(join(source, 'dist/leak.js'), source);
  const error: unknown = await install().catch((failure: unknown) => failure);
  if (!(error instanceof Error) || !(error.cause instanceof Error)) {
    throw new Error('Expected source-reference refusal');
  }
  expect(error.cause.message).toContain('retains the source checkout path');
  expect(await readFile(join(destination, 'application/dist/leak.js'), 'utf8')).toBe(source);
});
it('refuses symlinked resources before executing application verification', async () => {
  await mkdir(join(root, 'foreign'));
  await symlink(
    join(root, 'foreign'),
    join(source, 'dist/foreign'),
    'win32' === process.platform ? 'junction' : 'dir',
  );
  const error: unknown = await install().catch((failure: unknown) => failure);
  if (!(error instanceof Error) || !(error.cause instanceof Error)) {
    throw new Error('Expected symlink refusal');
  }
  expect(error.cause.message).toContain('cannot contain symlinks');
});
it('retains an interrupted install and foreign additions without rollback deletion', async () => {
  const failure = new Error('stop before publish');
  await expect(
    install(async (stage) => {
      if ('verified' === stage) {
        await writeFile(join(destination, 'user.txt'), 'keep');
        throw failure;
      }
    }),
  ).rejects.toMatchObject({ cause: failure });
  expect(await readFile(join(destination, 'user.txt'), 'utf8')).toBe('keep');
  await expect(readdir(join(destination, '.arch-ready'))).rejects.toMatchObject({ code: 'ENOENT' });
});
