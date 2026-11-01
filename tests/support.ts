import {
  mkdtemp,
  mkdir,
  copyFile,
  chmod,
  readFile,
  rm,
  writeFile,
  lstat,
  readdir,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, join, dirname, delimiter } from 'node:path';
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { inspectInstallation } from '../src/lifecycle/inspection.js';

export const cli = resolve('dist/cli.js');
const localMise = resolve('.tools/mise/bin/mise.exe');
export const mise = process.env.MISE_BIN || (existsSync(localMise) ? localMise : 'mise');
export function requiredEnvironment(
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`Missing test prerequisite: ${name}`);
  }
  return value;
}

export function runtimeOutput(stdout: string): { node: string; exec: string } {
  const value: unknown = JSON.parse(stdout.split(/\r?\n/)[0] ?? '');
  if (!isObject(value) || 'string' !== typeof value.node || 'string' !== typeof value.exec) {
    throw new Error('Malformed runtime fixture output');
  }
  return { node: value.node, exec: value.exec };
}
export interface Result {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export function diagnosticStreams(output: Pick<Result, 'stdout' | 'stderr'>) {
  const limit = 64 * 1024;
  return {
    stdout: output.stdout.slice(-limit),
    stderr: output.stderr.slice(-limit),
    stdoutTruncated: limit < output.stdout.length,
    stderrTruncated: limit < output.stderr.length,
  };
}

export async function recordBeforeDisposal(operations: {
  record: () => Promise<void>;
  dispose: () => Promise<void> | undefined;
}): Promise<void> {
  let recordingFailure: { error: unknown } | undefined;
  try {
    await operations.record();
  } catch (error) {
    recordingFailure = { error };
    throw error;
  } finally {
    try {
      await operations.dispose();
    } catch (cleanupError) {
      if (recordingFailure) {
        throw new AggregateError(
          [recordingFailure.error, cleanupError],
          'Test evidence recording and child teardown failed',
          { cause: recordingFailure.error },
        );
      }
      throw cleanupError;
    }
  }
}

export function start(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  return capture(child);
}

// Shared by direct processes and npm's explicit cmd invocation. Observe exit and
// close separately; recording a parent exit must never settle inherited streams.
export function capture(child: ChildProcessWithoutNullStreams) {
  let closed = false;
  const closure = new Promise<void>((done) => {
    child.once('close', () => {
      closed = true;
      done();
    });
  });
  const observations: { event: string; code?: number | null; signal?: NodeJS.Signals | null }[] =
    [];
  child.once('spawn', () => {
    observations.push({ event: 'spawn' });
  });
  child.once('exit', (code, signal) => {
    observations.push({ event: 'exit', code, signal });
  });
  child.stdout.once('end', () => {
    observations.push({ event: 'stdout-end' });
  });
  child.stderr.once('end', () => {
    observations.push({ event: 'stderr-end' });
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (data: Buffer) => {
    stdout += data.toString('utf8');
  });
  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString('utf8');
  });
  const result = new Promise<Result>((done, reject) => {
    child.once('error', (error) => {
      observations.push({ event: 'error' });
      reject(error);
    });
    child.once('close', (code, signal) => {
      observations.push({ event: 'close', code, signal });
      done({ code, signal, stdout, stderr });
    });
  });
  return {
    child,
    result,
    output: () => ({ stdout, stderr }),
    observations: () => observations.map((entry) => ({ ...entry })),
    async dispose() {
      if (closed) {
        return;
      }
      // Test-owned direct child only. A parent exit with open inherited pipes is
      // not completion; do not pretend this can contain unknown descendants.
      if (
        undefined !== child.pid &&
        null === child.exitCode &&
        null === child.signalCode &&
        !child.kill('SIGKILL')
      ) {
        throw new Error(`Unable to terminate test child ${String(child.pid)}`);
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          closure,
          new Promise<never>((_done, reject) => {
            timer = setTimeout(() => {
              reject(new Error(`Test child ${String(child.pid)} did not close during teardown`));
            }, 3000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
export async function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  stdin = '',
): Promise<Result> {
  const invocation = start(command, args, cwd, env);
  invocation.child.stdin.end(stdin);
  const result = await invocation.result;
  const operation = args[1];
  if (
    cli === args[0] &&
    ('uninstall' === operation || 'deinit' === operation) &&
    0 !== result.code
  ) {
    await recordRemovalFailure(cwd, result, {
      operation,
      child: { pid: invocation.child.pid ?? null, events: invocation.observations() },
    });
  }
  return result;
}

// Persist before assertions or fixture disposal can discard an unexpected
// removal result. Expected refusal tests also produce evidence; no retry occurs.
export async function recordRemovalFailure(
  project: string,
  result: Result,
  options: {
    directory?: string;
    operation?: 'uninstall' | 'deinit';
    child?: { pid: number | null; events: unknown };
  } = {},
): Promise<string> {
  const directory = options.directory ?? resolve('reports/removal-diagnostics');
  let resources: string[] | { inspectionError: string };
  try {
    const arch = join(project, '.arch');
    resources = (await lstat(arch)).isSymbolicLink()
      ? ['.arch is a symlink; not traversed']
      : (await readdir(arch)).sort();
  } catch (error) {
    // Preserve a failed observation alongside the original process result.
    resources = { inspectionError: String(error) };
  }
  const observation = {
    operation: options.operation ?? 'uninstall',
    stage: 'after child close, before fixture cleanup',
    project,
    platform: process.platform,
    node: process.version,
    workerPid: process.pid,
    ...result,
    ...diagnosticStreams(result),
    resources,
    child: options.child ?? null,
    ownership: await inspectInstallation(project, { PATH: '' }).catch((error: unknown) => ({
      inspectionError: String(error),
    })),
  };
  // Logs retain the process result even if persisting the artifact itself fails.
  console.error('[arch:test] nonzero removal:', JSON.stringify(observation));
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${randomUUID()}.json`);
  await writeFile(file, JSON.stringify(observation, null, 2));
  return file;
}
export function stop(child: ChildProcess) {
  child.kill('SIGTERM');
}

export async function world(temporary = resolve('.test-state/fixtures')) {
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'arch-fixture-'));
  try {
    const paths = {
      home: join(root, 'home'),
      data: join(root, 'data'),
      cache: join(root, 'cache'),
      config: join(root, 'config'),
      native: join(root, 'native'),
      A: join(root, 'A'),
      B: join(root, 'B'),
      C: join(root, 'C'),
    };
    // Let every owned setup operation settle before cleanup can remove their root.
    const directories = await Promise.allSettled(
      Object.values(paths).map((path) => mkdir(path, { recursive: true })),
    );
    const failures = directories.filter((result) => 'rejected' === result.status);
    const first = failures[0];
    if (first && 1 === failures.length) {
      throw first.reason;
    }
    if (first) {
      const errors = failures.map((failure): unknown => failure.reason);
      throw new AggregateError(errors, 'Fixture directory preparation failed', {
        cause: first.reason,
      });
    }
    const native = paths.native;
    // Extensionless Node fixtures must not inherit the repository's ESM package scope.
    await writeFile(join(root, 'package.json'), '{"type":"commonjs"}\n');
    if ('win32' === process.platform) {
      const csc = join(
        process.env.SystemRoot || 'C:/Windows',
        'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
      );
      const built = await run(
        csc,
        ['/nologo', `/out:${join(native, 'claude.exe')}`, resolve('tests/fixtures/native.cs')],
        root,
        process.env,
      );
      if (0 !== built.code) {
        throw new Error(`Fake executable compile failed: ${built.stdout} ${built.stderr}`);
      }
      await copyFile(join(native, 'claude.exe'), join(native, 'codex.exe'));
      const driver = await run(
        csc,
        [
          '/nologo',
          `/out:${join(root, 'console-driver.exe')}`,
          resolve('tests/fixtures/console-driver.cs'),
        ],
        root,
        process.env,
      );
      if (0 !== driver.code) {
        throw new Error(`Console driver compile failed: ${driver.stdout} ${driver.stderr}`);
      }
    } else {
      for (const name of ['claude', 'codex']) {
        await copyFile(resolve('tests/fixtures/native.cjs'), join(native, name));
        await chmod(join(native, name), 0o755);
      }
    }
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      'SystemRoot',
      'WINDIR',
      'ComSpec',
      'PATHEXT',
      'TEMP',
      'TMP',
      'TMPDIR',
      'LANG',
    ]) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }
    Object.assign(env, {
      HOME: paths.home,
      USERPROFILE: paths.home,
      XDG_CONFIG_HOME: paths.config,
      MISE_DATA_DIR: paths.data,
      MISE_CACHE_DIR: paths.cache,
      MISE_CONFIG_DIR: paths.config,
      MISE_GLOBAL_CONFIG_FILE: join(paths.config, 'config.toml'),
      MISE_SYSTEM_CONFIG_DIR: join(root, 'system'),
      MISE_CEILING_PATHS: root,
      MISE_TRUSTED_CONFIG_PATHS: root,
      MISE_OFFLINE: '1',
      MISE_NOT_FOUND_AUTO_INSTALL: 'false',
      MISE_NOT_FOUND_SYSTEM_FALLBACK: 'true',
      MISE_BIN: mise,
      PATH: [
        join(paths.A, '.arch/bin'),
        join(paths.B, '.arch/bin'),
        native,
        dirname(process.execPath),
        ...('mise' !== mise ? [dirname(mise)] : []),
        process.env.PATH ?? '',
      ].join(delimiter),
      ARCH_TRACE: '1',
    });
    return {
      root,
      A: paths.A,
      B: paths.B,
      C: paths.C,
      native,
      env,
      init: (cwd: string, commands = ['claude', 'codex']) =>
        run(process.execPath, [cli, 'init', ...commands], cwd, env),
      invoke: (
        cwd: string,
        command = 'claude',
        args: string[] = [],
        overrides: NodeJS.ProcessEnv = {},
        stdin = '',
      ) => run(command, args, cwd, { ...env, ...overrides }, stdin),
      // Preserve the pre-existing fixture-only cleanup policy. Its eventual
      // success does not identify a denying handle or resolve an incident.
      dispose: () => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
    };
  } catch (error) {
    try {
      await rm(root, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Fixture preparation and cleanup failed', {
        cause: error,
      });
    }
    throw error;
  }
}

export function events(result: Result): {
  id: string;
  type: string;
  executionId: string;
  timestamp: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
}[] {
  return result.stderr
    .split(/\r?\n/)
    .filter((line) => line.startsWith('[arch:event] '))
    .map((line) => {
      const value: unknown = JSON.parse(line.slice(13));
      if (
        !isObject(value) ||
        'string' !== typeof value.id ||
        'string' !== typeof value.type ||
        'string' !== typeof value.executionId ||
        'string' !== typeof value.timestamp ||
        1 !== value.schemaVersion ||
        !isObject(value.payload)
      ) {
        throw new Error('Malformed Arch event fixture output');
      }
      return {
        id: value.id,
        type: value.type,
        executionId: value.executionId,
        timestamp: value.timestamp,
        schemaVersion: value.schemaVersion,
        payload: value.payload,
      };
    });
}
interface NativeRecord {
  args: string[];
  cwd: string;
  demo: string;
  pid: number;
}
interface ProcessRecord {
  node: string;
  pid: number;
}
interface RuntimeRecord extends ProcessRecord {
  args: string[];
  cwd: string;
  exec: string;
  path: string;
}

export function records(file: string): Promise<NativeRecord[]>;
export function records(file: string, format: 'runtime'): Promise<RuntimeRecord[]>;
export function records(file: string, format: 'process'): Promise<ProcessRecord[]>;
export async function records(
  file: string,
  format: 'native' | 'runtime' | 'process' = 'native',
): Promise<(NativeRecord | RuntimeRecord | ProcessRecord)[]> {
  try {
    return (await readFile(file, 'utf8'))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const value: unknown = JSON.parse(line);
        if (
          !isObject(value) ||
          'number' !== typeof value.pid ||
          !Number.isInteger(value.pid) ||
          0 >= value.pid
        ) {
          throw new Error('Malformed native fixture record');
        }
        if ('process' === format) {
          if ('string' !== typeof value.node) {
            throw new Error('Malformed process fixture record');
          }
          return { node: value.node, pid: value.pid };
        }
        if (!isStringArray(value.args) || 'string' !== typeof value.cwd) {
          throw new Error('Malformed native fixture record');
        }
        const args: string[] = value.args;
        const record = { args, cwd: value.cwd, pid: value.pid };
        if ('native' === format) {
          if ('string' !== typeof value.demo) {
            throw new Error('Malformed native fixture record');
          }
          return { ...record, demo: value.demo };
        }
        if (
          'string' !== typeof value.node ||
          'string' !== typeof value.exec ||
          'string' !== typeof value.path
        ) {
          throw new Error('Malformed native fixture record');
        }
        return { ...record, node: value.node, exec: value.exec, path: value.path };
      });
  } catch (error) {
    if ('ENOENT' === (error as NodeJS.ErrnoException).code) {
      return [];
    }
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return null !== value && 'object' === typeof value && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((argument: unknown) => 'string' === typeof argument);
}
