import { randomUUID } from 'node:crypto';
import { isBuiltin } from 'node:module';
import { link, lstat, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MiddlewareSource } from './middleware-contract.js';

const anchorName = '.arch-middleware-resolver-v1.mjs';
const anchorSource =
  'export const resolvePackage = (specifier) => import.meta.resolve(specifier);\n';

function assertContained(root: string, target: string): void {
  const path = relative(root, target);
  if ('..' === path || path.startsWith('..' + sep) || isAbsolute(path)) {
    throw new Error('Middleware entrypoint escapes the project root');
  }
}

async function assertExplicitEsm(file: string, root: string): Promise<void> {
  if ('.mjs' === extname(file)) {
    return;
  }
  if ('.js' !== extname(file)) {
    throw new Error('Middleware entrypoint must have an explicit .mjs or ESM .js extension');
  }
  let directory = dirname(file);
  for (;;) {
    let text: string | undefined;
    try {
      text = await readFile(join(directory, 'package.json'), 'utf8');
    } catch (error) {
      if ('ENOENT' !== (error as NodeJS.ErrnoException).code) {
        throw error;
      }
    }
    if (undefined !== text) {
      const metadata: unknown = JSON.parse(text);
      if (
        metadata &&
        'object' === typeof metadata &&
        'type' in metadata &&
        'module' === metadata.type
      ) {
        return;
      }
      throw new Error('Middleware .js entrypoint needs package.json type = module');
    }
    if (directory === root) {
      throw new Error('Middleware .js entrypoint needs package.json type = module');
    }
    directory = dirname(directory);
  }
}

async function resolveFile(source: string, projectRoot: string): Promise<string> {
  if (!source.startsWith('./') || source.includes('\0')) {
    throw new Error('Middleware file must be an explicit ./ project-relative path');
  }
  const root = resolve(projectRoot);
  const target = resolve(root, source);
  assertContained(root, target);
  if (!['.mjs', '.js'].includes(extname(target))) {
    throw new Error('Middleware entrypoint must have an explicit .mjs or ESM .js extension');
  }
  const canonicalRoot = await realpath(root);
  const canonicalTarget = await realpath(target);
  assertContained(canonicalRoot, canonicalTarget);
  if (!(await stat(canonicalTarget)).isFile()) {
    throw new Error('Middleware entrypoint must be a file');
  }
  await assertExplicitEsm(canonicalTarget, canonicalRoot);
  return pathToFileURL(canonicalTarget).href;
}

function assertPackageSpecifier(specifier: string): void {
  const segments = specifier.split('/');
  const name = specifier.startsWith('@') ? segments.splice(0, 2).join('/') : segments.shift();
  if (
    !name ||
    !/^(?:@[a-zA-Z0-9_~-]+\/)?[a-zA-Z0-9_~-][a-zA-Z0-9_.~-]*$/.test(name) ||
    isBuiltin(name) ||
    segments.some(
      (part) =>
        !/^[a-zA-Z0-9_.~-]+$/.test(part) ||
        '.' === part ||
        '..' === part ||
        'node_modules' === part,
    )
  ) {
    throw new Error('Invalid middleware package specifier');
  }
}

async function verifyAnchor(anchor: string): Promise<void> {
  const info = await lstat(anchor);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    anchorSource !== (await readFile(anchor, 'utf8'))
  ) {
    throw new Error('Project middleware resolver anchor has unexpected bytes or file type');
  }
}

/** Publish once without replacing any existing project file, including during concurrent first use. */
async function projectResolver(projectRoot: string): Promise<string> {
  const root = await realpath(projectRoot);
  const anchor = join(root, anchorName);
  try {
    await verifyAnchor(anchor);
  } catch (error) {
    if ('ENOENT' !== (error as NodeJS.ErrnoException).code) {
      throw error;
    }
    const temporary = join(root, `${anchorName}.${randomUUID()}.tmp`);
    await writeFile(temporary, anchorSource, { flag: 'wx', mode: 0o600 });
    try {
      try {
        // A hard link publishes complete bytes atomically. EEXIST means another invocation won.
        await link(temporary, anchor);
      } catch (publicationError) {
        if ('EEXIST' !== (publicationError as NodeJS.ErrnoException).code) {
          throw publicationError;
        }
      }
    } catch (publicationError) {
      try {
        await unlink(temporary);
      } catch (cleanupError) {
        throw new AggregateError(
          [publicationError, cleanupError],
          'Resolver publication and cleanup failed',
          { cause: publicationError },
        );
      }
      throw publicationError;
    }
    await unlink(temporary);
    await verifyAnchor(anchor);
  }
  return pathToFileURL(anchor).href;
}

export function assertMiddlewareProjectRoot(projectRoot: string): void {
  if (
    !isAbsolute(projectRoot) ||
    ('win32' === process.platform && 1 === parse(projectRoot).root.length)
  ) {
    throw new Error('External middleware requires an absolute trusted project root');
  }
}

export async function resolveMiddlewareSource(
  source: MiddlewareSource,
  projectRoot: string,
): Promise<string> {
  assertMiddlewareProjectRoot(projectRoot);
  if ('file' in source) {
    return resolveFile(source.file, projectRoot);
  }
  assertPackageSpecifier(source.package);
  const anchor = await projectResolver(projectRoot);
  // The fixed, verified project-owned anchor uses native import conditions, not require.resolve.
  const resolver = (await import(anchor)) as { resolvePackage: (specifier: string) => string };
  const url = resolver.resolvePackage(source.package);
  if (!url.startsWith('file:')) {
    throw new Error('Middleware packages must resolve to local files');
  }
  return url;
}
