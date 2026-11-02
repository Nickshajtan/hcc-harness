import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compatibleRuntime } from '../../src/runtime-version.js';
import { installationDestination, installStable } from '../../src/installation/stable-install.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'arch-install-policy-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

it.each(['24.15.0', '24.19.0', '24.99.1', '24.19.99'])(
  'accepts supported release %s',
  (version) => {
    expect(compatibleRuntime(version)).toBe(true);
  },
);
it('keeps the bootstrap policy pinned to the declared package engine', async () => {
  const manifest: unknown = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
  expect(manifest).toMatchObject({ engines: { node: '>=24.15.0 <25' } });
});
it.each(['20.19.0', '22.12.0', '24.14.9', '25.0.0', '24.15.0-rc.1', 'v24.15.0', ''])(
  'rejects incompatible or malformed runtime %s',
  (version) => {
    expect(compatibleRuntime(version)).toBe(false);
  },
);
it.each(
  [
    [],
    ['--destination'],
    ['--destination', 'relative'],
    ['--other', '/absolute'],
    ['--destination', resolve('app'), '--extra'],
  ].map((args) => ({
    args,
  })),
)('requires explicit absolute destination $args', ({ args }) => {
  expect(() => installationDestination(args)).toThrow('Usage:');
});
it('rejects filesystem root and preserves literal destination characters', () => {
  expect(() => installationDestination(['--destination', resolve('/')])).toThrow('filesystem root');
  expect(installationDestination(['--destination', resolve("space & ü's")])).toBe(
    resolve("space & ü's"),
  );
});
it('respects platform-specific absolute roots without inferring a Windows drive', () => {
  if ('win32' === process.platform) {
    expect(() => installationDestination(['--destination', '\\root-relative'])).toThrow('Usage:');
  } else {
    expect(installationDestination(['--destination', '/root-relative'])).toBe('/root-relative');
  }
});
it.each(['directory', 'file', 'symlink'])('does not overwrite an occupied %s', async (kind) => {
  const root = await fixture();
  const destination = join(root, 'occupied');
  if ('directory' === kind) {
    await mkdir(destination);
    await writeFile(join(destination, 'user.txt'), 'keep');
  } else if ('file' === kind) {
    await writeFile(destination, 'keep');
  } else {
    await mkdir(join(root, 'target'));
    await symlink(
      join(root, 'target'),
      destination,
      'win32' === process.platform ? 'junction' : 'dir',
    );
  }
  await expect(installStable({ source: root, destination, npm: 'unused' })).rejects.toMatchObject({
    code: 'EEXIST',
  });
  if ('directory' === kind) {
    expect(await readFile(join(destination, 'user.txt'), 'utf8')).toBe('keep');
  }
});
it('refuses symlink ancestors without writing through them', async () => {
  const root = await fixture();
  await mkdir(join(root, 'target'));
  await mkdir(join(root, 'target', 'child'));
  await symlink(
    join(root, 'target'),
    join(root, 'alias'),
    'win32' === process.platform ? 'junction' : 'dir',
  );
  await expect(
    installStable({
      source: root,
      destination: join(root, 'alias', 'child', 'app'),
      npm: 'unused',
    }),
  ).rejects.toThrow('not a symlink');
  expect(await readdir(join(root, 'target', 'child'))).toEqual([]);
});
it('refuses non-directory ancestors with a specific parent diagnostic', async () => {
  const root = await fixture();
  await writeFile(join(root, 'file'), 'keep');
  await expect(
    installStable({ source: root, destination: join(root, 'file', 'app'), npm: 'unused' }),
  ).rejects.toThrow('real directory');
  expect(await readFile(join(root, 'file'), 'utf8')).toBe('keep');
});
it('reserves exclusively under concurrent attempts and retains ambiguous failed state', async () => {
  const root = await fixture();
  const destination = join(root, 'app');
  const failure = new Error('controlled interruption boundary');
  const options = {
    source: root,
    destination,
    npm: 'unused',
    checkpoint: async () => {
      await writeFile(join(destination, 'user-added.txt'), 'keep');
      throw failure;
    },
  };
  const results = await Promise.allSettled([installStable(options), installStable(options)]);
  expect(results.every((result) => 'rejected' === result.status)).toBe(true);
  const errors: unknown[] = results
    .filter((result) => 'rejected' === result.status)
    .map((result): unknown => result.reason);
  expect(errors.some((error) => error instanceof Error && error.cause === failure)).toBe(true);
  expect(await readFile(join(destination, 'user-added.txt'), 'utf8')).toBe('keep');
  await expect(readFile(join(destination, 'installation.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
