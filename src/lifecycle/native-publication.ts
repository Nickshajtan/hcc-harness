import { execFile, type ExecFileException } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { toNamespacedPath } from 'node:path';
import { digest } from './manifest.js';
import { installationKind, snapshotRoot } from '../installation/stable-layout.js';

export const nativePublication = 'win32' === process.platform;

export type PublicationFailure =
  | 'collision'
  | 'missing-source'
  | 'permission'
  | 'sharing'
  | 'cross-volume'
  | 'unsupported'
  | 'invalid-input'
  | 'execution'
  | 'protocol'
  | 'unknown';

export class PublicationError extends Error {
  constructor(
    readonly kind: PublicationFailure,
    message: string,
    readonly outcome: 'not-published' | 'unknown',
    readonly win32?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function win32Failure(code: number): PublicationFailure {
  switch (code) {
    case 80:
    case 183:
      return 'collision';
    case 2:
    case 3:
      return 'missing-source';
    case 5:
      return 'permission';
    case 32:
    case 33:
      return 'sharing';
    case 17:
      return 'cross-volume';
    case 1:
    case 50:
    case 120:
      return 'unsupported';
    case 87:
    case 123:
    case 206:
      return 'invalid-input';
    default:
      return 'unknown';
  }
}

// Process success and OS success must agree. Lost/malformed output is never a
// definite syscall failure, even if a timeout/termination was requested.
export function verifyPublicationResponse(
  error: ExecFileException | null,
  stdout: string,
  stderr: string,
): void {
  let result: unknown;
  try {
    result = JSON.parse(stdout);
  } catch {
    /* Retain malformed output below. */
  }
  const evidence = { error, stdout, stderr };
  if (
    !result ||
    'object' !== typeof result ||
    !('protocol' in result) ||
    1 !== result.protocol ||
    !('win32' in result) ||
    'number' !== typeof result.win32 ||
    !Number.isInteger(result.win32) ||
    0 > result.win32 ||
    0xffffffff < result.win32 ||
    stderr.length ||
    (error && (error.killed || error.signal || 'number' !== typeof error.code)) ||
    (0 === result.win32 ? null !== error : 1 !== error?.code)
  ) {
    throw new PublicationError(
      error ? 'execution' : 'protocol',
      'Publication helper response invalid or lost; inspect publication state',
      'unknown',
      undefined,
      { cause: evidence },
    );
  }
  if (0 !== result.win32) {
    throw new PublicationError(
      win32Failure(result.win32),
      `Native exclusive publication failed (Win32 ${String(result.win32)})`,
      'not-published',
      result.win32,
      { cause: evidence },
    );
  }
}

// The binary is internal, absolute and checked before execution. Stable installs
// include it in their existing resource hash closure, never in user PATH.
export async function publicationHelper(): Promise<string> {
  if ('win32' !== process.platform || 'x64' !== process.arch) {
    throw new PublicationError(
      'unsupported',
      'Native publication requires Windows x64',
      'not-published',
    );
  }
  const metadata: unknown = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  const root = snapshotRoot(metadata, new URL(import.meta.url));
  const helper = root
    ? new URL('application/vendor/arch-publication-v1.exe', root)
    : new URL('../../.tools/publication/arch-publication-v1.exe', import.meta.url);
  const record: unknown = JSON.parse(
    await readFile(
      root
        ? new URL('installation.json', root)
        : new URL('../../.tools/publication/provenance.json', import.meta.url),
      'utf8',
    ),
  );
  let expected: unknown;
  if (root) {
    const ready = await lstat(new URL('.arch-ready', root));
    if (
      !ready.isDirectory() ||
      ready.isSymbolicLink() ||
      !record ||
      'object' !== typeof record ||
      !('kind' in record) ||
      installationKind !== record.kind ||
      !('platform' in record) ||
      process.platform !== record.platform
    ) {
      throw new Error('Incomplete stable installation');
    }
    if ('files' in record && record.files && 'object' === typeof record.files) {
      expected = Object.getOwnPropertyDescriptor(
        record.files,
        'application/vendor/arch-publication-v1.exe',
      )?.value;
    }
  } else if (
    record &&
    'object' === typeof record &&
    'protocol' in record &&
    1 === record.protocol &&
    'sha256' in record
  ) {
    expected = record.sha256;
  }
  const info = await lstat(helper);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    'string' !== typeof expected ||
    digest(await readFile(helper)) !== expected
  ) {
    throw new Error('Publication helper integrity failure; rebuild or reinstall Arch');
  }
  return fileURLToPath(helper);
}

export async function renameNoReplace(stage: string, target: string): Promise<void> {
  let helper: string;
  try {
    helper = await publicationHelper();
  } catch (cause) {
    if (cause instanceof PublicationError) {
      throw cause;
    }
    throw new PublicationError(
      'execution',
      'Publication helper unavailable or invalid; rebuild/install the packaged helper',
      'not-published',
      undefined,
      { cause },
    );
  }
  await new Promise<void>((resolve, reject) => {
    // execFile callback runs after close, including timeout termination. No retry:
    // a terminated helper may already have completed the namespace operation.
    execFile(
      helper,
      [toNamespacedPath(stage), toNamespacedPath(target)],
      {
        shell: false,
        windowsHide: true,
        timeout: 10_000,
        killSignal: 'SIGKILL',
        maxBuffer: 4096,
      },
      (error, stdout, stderr) => {
        try {
          verifyPublicationResponse(error, stdout, stderr);
          resolve();
        } catch (failure) {
          reject(
            failure instanceof Error
              ? failure
              : new Error('Publication response validation failed', { cause: failure }),
          );
        }
      },
    );
  });
}
