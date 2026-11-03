import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
  unlink,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, toNamespacedPath } from 'node:path';
import { promisify } from 'node:util';
import { installationKind } from './stable-layout.js';

const execute = promisify(execFile);
export type InstallCheckpoint = 'reserved' | 'materialized' | 'verified' | 'published';

export function installationDestination(args: readonly string[]): string {
  if (
    2 !== args.length ||
    '--destination' !== args[0] ||
    !args[1] ||
    !isAbsolute(args[1]) ||
    ('win32' === process.platform && 1 === parse(args[1]).root.length)
  ) {
    throw new Error('Usage: npm run install:stable -- --destination <absolute-directory>');
  }
  const destination = resolve(args[1]);
  if (dirname(destination) === destination) {
    throw new Error('An installation destination cannot be a filesystem root');
  }
  return destination;
}

async function safeAncestors(path: string): Promise<void> {
  const parent = dirname(path);
  if (parent !== path) {
    await safeAncestors(parent);
  }
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`Installation parent must be a real directory, not a symlink: ${path}`);
  }
}

async function filesIn(root: string, directory = root): Promise<string[]> {
  const result: string[] = [];
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      throw new Error(`Stable snapshot cannot contain symlinks: ${path}`);
    }
    if (info.isDirectory()) {
      result.push(...(await filesIn(root, path)));
    } else if (info.isFile()) {
      result.push(relative(root, path));
    } else {
      throw new Error(`Stable snapshot contains a non-file resource: ${path}`);
    }
  }
  return result.sort();
}

async function copyResources(source: string, destination: string, javascriptOnly = false) {
  await mkdir(destination);
  for (const file of await filesIn(source)) {
    if (javascriptOnly && !file.endsWith('.js')) {
      continue;
    }
    const target = join(destination, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, file), target, constants.COPYFILE_EXCL);
  }
}

async function materialize(source: string, destination: string, npm: string) {
  const app = join(destination, 'application');
  await mkdir(app);
  await copyResources(join(source, 'dist'), join(app, 'dist'), true);
  await copyResources(join(source, 'vendor'), join(app, 'vendor'));
  if ('win32' === process.platform) {
    await copyFile(
      join(source, '.tools/publication/arch-publication-v1.exe'),
      join(app, 'vendor/arch-publication-v1.exe'),
      constants.COPYFILE_EXCL,
    );
    await copyFile(
      join(source, '.tools/publication/provenance.json'),
      join(app, 'vendor/publication-provenance.json'),
      constants.COPYFILE_EXCL,
    );
  }
  for (const file of ['package.json', 'package-lock.json', 'LICENSE']) {
    await copyFile(join(source, file), join(app, file), constants.COPYFILE_EXCL);
  }
  // npm owns dependency closure; scripts and dev packages never run/install here.
  // Per-command prefix only: no global prefix, PATH or shell configuration writes.
  await execute(
    process.execPath,
    [npm, 'ci', '--prefix', app, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: app, timeout: 90_000, maxBuffer: 1024 * 1024, windowsHide: true },
  );
  const manifest: unknown = JSON.parse(await readFile(join(app, 'package.json'), 'utf8'));
  if (!manifest || 'object' !== typeof manifest) {
    throw new Error('Invalid application package metadata');
  }
  const runtimePackage = {
    ...Object.fromEntries(
      Object.entries(manifest).filter(
        ([key]) => !['scripts', 'devDependencies', 'allowScripts'].includes(key),
      ),
    ),
    archStableSnapshot: installationKind,
  };
  await writeFile(join(app, 'package.json'), JSON.stringify(runtimePackage, null, 2) + '\n');
  const entry = join(destination, 'win32' === process.platform ? 'arch.exe' : 'arch');
  const template =
    'win32' === process.platform
      ? join(source, '.tools/stable-bootstrap/arch-bootstrap.exe')
      : join(source, 'runtime/arch');
  await copyFile(template, entry, constants.COPYFILE_EXCL);
  if ('win32' !== process.platform) {
    await chmod(entry, 0o755);
  }
  return app;
}

async function verifySnapshot(source: string, destination: string, app: string) {
  if ('win32' === process.platform) {
    const helper = join(app, 'vendor/arch-publication-v1.exe');
    const provenance: unknown = JSON.parse(
      await readFile(join(app, 'vendor/publication-provenance.json'), 'utf8'),
    );
    if (
      !provenance ||
      'object' !== typeof provenance ||
      !('protocol' in provenance) ||
      1 !== provenance.protocol ||
      !('sha256' in provenance) ||
      provenance.sha256 !==
        createHash('sha256')
          .update(await readFile(helper))
          .digest('hex')
    ) {
      throw new Error('Publication helper build integrity failure');
    }
    const stage = join(destination, '.publication-probe.stage');
    const target = join(destination, '.publication-probe.target');
    await writeFile(stage, 'arch-publication-v1\n', { flag: 'wx' });
    const result = await execute(helper, [toNamespacedPath(stage), toNamespacedPath(target)], {
      timeout: 10_000,
      maxBuffer: 4096,
      windowsHide: true,
    });
    if (
      '{"protocol":1,"win32":0}' !== result.stdout.trim() ||
      result.stderr ||
      'arch-publication-v1\n' !== (await readFile(target, 'utf8'))
    ) {
      throw new Error('Publication helper protocol verification failed');
    }
    await unlink(target);
  }
  for (const file of ['dist/cli.js', 'vendor/shim-x64.exe', 'vendor/shim-arm64.exe']) {
    if (!(await lstat(join(app, file))).isFile()) {
      throw new Error(`Missing installation resource: ${file}`);
    }
  }
  await execute(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { readFileSync } from 'node:fs';
       import { fileURLToPath } from 'node:url';
       import { sep, relative, isAbsolute } from 'node:path';
       const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
       for (const name of Object.keys(pkg.dependencies)) {
         const path = relative(process.cwd(), fileURLToPath(import.meta.resolve(name)));
         if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) {
           throw new Error('Dependency resolves outside stable snapshot: ' + name);
         }
         await import(name);
       }`,
    ],
    { cwd: app, timeout: 10_000, maxBuffer: 128 * 1024, windowsHide: true },
  );
  // A real import/dispatch verifies the installed dependency closure before readiness.
  await execute(process.execPath, [join(app, 'dist/cli.js'), '--help'], {
    cwd: app,
    timeout: 10_000,
    maxBuffer: 128 * 1024,
    windowsHide: true,
  });
  const hashes: Record<string, string> = {};
  for (const file of await filesIn(destination)) {
    const bytes = await readFile(join(destination, file));
    if (bytes.includes(Buffer.from(source))) {
      throw new Error(`Installation resource retains the source checkout path: ${file}`);
    }
    hashes[file.replaceAll('\\', '/')] = createHash('sha256').update(bytes).digest('hex');
  }
  return hashes;
}

export async function installStable(options: {
  source: string;
  destination: string;
  npm: string;
  checkpoint?: (stage: InstallCheckpoint) => Promise<void>;
}): Promise<void> {
  const { source, npm } = options;
  if ('win32' === process.platform && 'x64' !== process.arch) {
    throw new Error(
      'Stable Windows bootstrap currently requires x64; ARM64 execution is not verified',
    );
  }
  const destination = installationDestination(['--destination', options.destination]);
  await safeAncestors(dirname(destination));
  // mkdir is the no-clobber reservation, not a check-then-rename. Never recursively
  // remove this tree after failure: third-party additions cannot be proved owned.
  await mkdir(destination, { mode: 0o700 });
  let stage: InstallCheckpoint = 'reserved';
  try {
    await options.checkpoint?.(stage);
    const app = await materialize(source, destination, npm);
    stage = 'materialized';
    await options.checkpoint?.(stage);
    const files = await verifySnapshot(source, destination, app);
    stage = 'verified';
    await options.checkpoint?.(stage);
    // Write metadata completely, then publish readiness with exclusive mkdir.
    // Entrypoints refuse to run before that directory exists. No directory rename
    // can accidentally replace a late-arriving empty destination on POSIX.
    // This is process-interruption safety, not power-loss/fsync durability.
    await writeFile(
      join(destination, 'installation.json'),
      JSON.stringify({ kind: installationKind, platform: process.platform, files }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    await mkdir(join(destination, '.arch-ready'));
    stage = 'published';
    await execute(
      join(destination, 'win32' === process.platform ? 'arch.exe' : 'arch'),
      ['--help'],
      {
        cwd: destination,
        env: { ...process.env, ARCH_NODE: process.execPath },
        timeout: 10_000,
        maxBuffer: 128 * 1024,
        windowsHide: true,
      },
    );
    await options.checkpoint?.(stage);
  } catch (error) {
    throw new Error(
      `Stable installation failed at ${stage}; retained ${destination}. Inspect it and use a new destination.`,
      { cause: error },
    );
  }
}
