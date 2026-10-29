import { mkdtemp, mkdir, copyFile, chmod, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, dirname, delimiter } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

export const cli = resolve('dist/cli.js');
const localMise = resolve('.tools/mise/bin/mise.exe');
export const mise = process.env.MISE_BIN || (existsSync(localMise) ? localMise : 'mise');
export interface Result {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export function start(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (data: Buffer) => {
    stdout += data.toString('utf8');
  });
  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString('utf8');
  });
  const result = new Promise<Result>((done, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      done({ code, signal, stdout, stderr });
    });
  });
  return { child, result, output: () => ({ stdout, stderr }) };
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
  return invocation.result;
}
export function stop(child: ChildProcess) {
  child.kill('SIGTERM');
}

export async function world(temporary = resolve('.test-state/fixtures')) {
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'arch-fixture-'));
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
  await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true })));
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
      process.env.PATH || '',
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
    // Windows may retain an executable's file handle briefly after process exit.
    // Bounded retries tolerate that release delay; persistent locks still fail.
    dispose: () => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
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
export async function records(
  file: string,
): Promise<{ args: string[]; cwd: string; demo?: string; pid: number }[]> {
  try {
    return (await readFile(file, 'utf8'))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const value: unknown = JSON.parse(line);
        if (
          !isObject(value) ||
          !isStringArray(value.args) ||
          'string' !== typeof value.cwd ||
          'number' !== typeof value.pid ||
          !Number.isInteger(value.pid) ||
          0 >= value.pid
        ) {
          throw new Error('Malformed native fixture record');
        }
        const args: string[] = value.args;
        const record = { args, cwd: value.cwd, pid: value.pid };
        if ('demo' in value) {
          if ('string' !== typeof value.demo) {
            throw new Error('Malformed native fixture record');
          }
          return { ...record, demo: value.demo };
        }
        // The active B1 native runtime fixture has runtime identity instead of demo.
        if (
          'string' !== typeof value.node ||
          'string' !== typeof value.exec ||
          'string' !== typeof value.path
        ) {
          throw new Error('Malformed native fixture record');
        }
        return record;
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
