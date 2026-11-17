import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as filesystem from 'node:fs/promises';
import { parseConfiguration } from '../../src/config.js';
import {
  loadMiddleware,
  instantiateMiddleware,
  MiddlewareLoadError,
} from '../../src/middleware-loader.js';
import { dispatchPolicy } from '../../src/policy.js';
import { execute } from '../../src/core.js';
import type { MiddlewareDiagnostic } from '../../src/middleware-contract.js';
import { resolveMiddlewareSource } from '../../src/middleware-resolution.js';
import { assertSynchronousRegistration } from '../../src/synchronous-registration.js';

// Keep real filesystem behavior, with a configurable facade for the compound-failure test.
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}));

let root: string;
let diagnostics: MiddlewareDiagnostic[];
const request = { type: 'agent.beforeSpawn', requestId: 'external-1', provider: 'mock' };
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hcc-modules-'));
  diagnostics = [];
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
const report = (diagnostic: MiddlewareDiagnostic) => {
  diagnostics.push(diagnostic);
};
function configuration(source = '{file="./entry.mjs"}', extra = '', id = 'external') {
  return parseConfiguration(
    `schema=1\n[[middleware]]\nid="${id}"\nenabled=true\nsource=${source}\n${extra}`,
    root,
  );
}
async function moduleFile(body: string) {
  await writeFile(join(root, 'entry.mjs'), body);
}
const valid = 'export const abi=1; export const createMiddleware=({id})=>({id,register(){}});';

it('prepares factories without constructing, leaves base registry intact and freezes options', async () => {
  await moduleFile(`export const abi=1; export function createMiddleware({id,options}) {
    if (!Object.isFrozen(options.nested) || !Object.isFrozen(options.list)) throw Error('not frozen');
    return { id, register(){} };
  }`);
  const config = configuration(undefined, 'options={nested={mode="strict"},list=[1,true,"x"]}');
  const base = new Map();
  const prepared = await loadMiddleware(config, base, report);
  expect(base.size).toBe(0);
  expect(prepared.registry.get('external')!()).toMatchObject({ id: 'external' });
  expect(diagnostics).toEqual([]);
});

it('does not resolve, import, instantiate or provision an anchor for disabled entries', async () => {
  await moduleFile('throw Error("must not import")');
  const config = parseConfiguration(
    'schema=1\nmiddleware=[{id="off",enabled=false,source={package="missing"}},{id="local",enabled=false,source={file="./entry.mjs"}}]',
    root,
  );
  const result = await loadMiddleware(config, new Map(), report);
  expect(result.registry.size).toBe(0);
  expect(diagnostics).toEqual([]);
  await expect(lstat(join(root, '.arch/.internal/resolver-v1.mjs'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

it.each([false, true])(
  'rejects registry collisions before imports, even enabled=%s',
  async (enabled) => {
    await moduleFile('throw Error("imported")');
    const config = parseConfiguration(
      `schema=1\nmiddleware=[{id="demo",enabled=${String(enabled)},source={file="./entry.mjs"}}]`,
      root,
    );
    await expect(
      loadMiddleware(
        config,
        new Map([['demo', () => ({ id: 'demo', register: () => undefined })]]),
        report,
      ),
    ).rejects.toThrow('collision');
    expect(diagnostics).toEqual([]);
  },
);

it.each([
  ['missing', undefined, 'resolve'],
  ['evaluation', 'throw Error("secret options")', 'import'],
  ['abi', 'export const abi=2; export function createMiddleware(){}', 'contract'],
  ['factory export', 'export const abi=1;', 'contract'],
  ['noncallable factory', 'export const abi=1; export const createMiddleware=1;', 'contract'],
  ['default export', 'export default {abi:1,createMiddleware(){}}', 'contract'],
] as const)(
  'handles optional and required %s failures deterministically',
  async (_name, body, stage) => {
    if (body) {
      await moduleFile(body);
    }
    const optional = await loadMiddleware(
      configuration(undefined, 'required=false\noptions={secret="hidden"}'),
      new Map(),
      report,
    );
    expect(optional.configuration.middleware).toEqual([]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ middlewareId: 'external', stage, disposition: 'skip' }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('hidden');
    await expect(loadMiddleware(configuration(), new Map(), report)).rejects.toBeInstanceOf(
      MiddlewareLoadError,
    );
    expect(diagnostics[1]).toMatchObject({ stage, disposition: 'failure' });
  },
);

it.each([
  'throw Error("factory")',
  'return null',
  'return 1',
  'return {id:"wrong",register(){}}',
  'return {id}',
  'return {id,register:1}',
  'return {id,register(){},registerPolicy:1}',
  'return Promise.resolve(null)',
  'return {get then(){throw Error("must not inspect")},id,register(){}}',
])('validates factory returns before optional registration: %s', async (body) => {
  await moduleFile(`export const abi=1; export function createMiddleware({id}){${body}}`);
  const optional = await loadMiddleware(
    configuration(undefined, 'required=false'),
    new Map(),
    report,
  );
  expect(
    instantiateMiddleware(optional.configuration.middleware[0]!, optional.registry),
  ).toBeUndefined();
  const required = await loadMiddleware(configuration(), new Map(), report);
  expect(() =>
    instantiateMiddleware(required.configuration.middleware[0]!, required.registry),
  ).toThrow(MiddlewareLoadError);
  expect(diagnostics.map((item) => item.stage)).toEqual(['factory', 'factory']);
});

it.each([
  './../outside.mjs',
  '../entry.mjs',
  'file:///entry.mjs',
  './entry',
  './directory',
  './entry.cjs',
])('rejects invalid local targets %s', async (file) => {
  await moduleFile(valid);
  await mkdir(join(root, 'directory'));
  const loaded = await loadMiddleware(
    configuration(`{file=${JSON.stringify(file)}}`, 'required=false'),
    new Map(),
    report,
  );
  expect(loaded.configuration.middleware).toEqual([]);
  expect(diagnostics[0]).toMatchObject({ stage: 'resolve' });
});

it('resolves literal spaces and URL characters and supports explicit ESM .js scopes', async () => {
  const name = 'space # percent% ü.mjs';
  await writeFile(join(root, name), valid);
  const url = await resolveMiddlewareSource({ file: './' + name }, root);
  expect(await readFile(fileURLToPath(url), 'utf8')).toBe(valid);
  await writeFile(join(root, 'entry.js'), valid);
  await expect(
    loadMiddleware(configuration('{file="./entry.js"}'), new Map(), report),
  ).rejects.toThrow();
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  expect(
    (await loadMiddleware(configuration('{file="./entry.js"}'), new Map(), report)).registry.get(
      'external',
    )!().id,
  ).toBe('external');
});

it('rejects a canonical symlink escape (junction on Windows)', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'hcc-outside-'));
  try {
    await writeFile(join(outside, 'entry.mjs'), valid);
    await symlink(
      outside,
      join(root, 'escaped'),
      'win32' === process.platform ? 'junction' : 'dir',
    );
    await expect(
      loadMiddleware(configuration('{file="./escaped/entry.mjs"}'), new Map(), report),
    ).rejects.toThrow();
    expect(diagnostics[0]).toMatchObject({ stage: 'resolve' });
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

it.each([
  'node:fs',
  'fs',
  'fs/promises',
  '#alias',
  '@scope',
  '@scope/',
  './entry.mjs',
  'https://host/pkg',
  'git+https://host/pkg',
  'pkg//sub',
  'pkg/../sub',
  'pkg%20',
  '!pkg',
  'pkg!',
  'pkg/sub!',
  'pkg/!sub',
  'pkg/.',
  'pkg/node_modules',
])('rejects package specifier %s', async (name) => {
  await expect(
    loadMiddleware(configuration(`{package=${JSON.stringify(name)}}`), new Map(), report),
  ).rejects.toThrow();
  expect(diagnostics[0]).toMatchObject({ stage: 'resolve' });
  await expect(lstat(join(root, '.arch/.internal/resolver-v1.mjs'))).rejects.toHaveProperty(
    'code',
    'ENOENT',
  );
});

it('uses native project import-only/conditional exports and subpaths, concurrently provisions once', async () => {
  const pkg = join(root, 'node_modules/@fixture/only');
  await mkdir(pkg, { recursive: true });
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({
      type: 'module',
      exports: {
        '.': { import: './entry.mjs', require: './wrong.cjs' },
        './policy': { import: './entry.mjs' },
      },
    }),
  );
  await writeFile(join(pkg, 'entry.mjs'), valid);
  await writeFile(join(pkg, 'wrong.cjs'), 'throw Error("require condition selected")');
  const loaded = await Promise.all([
    loadMiddleware(configuration('{package="@fixture/only"}'), new Map(), report),
    loadMiddleware(configuration('{package="@fixture/only/policy"}'), new Map(), report),
  ]);
  expect(loaded.map((item) => item.registry.get('external')!().id)).toEqual([
    'external',
    'external',
  ]);
  const anchor = join(root, '.arch/.internal/resolver-v1.mjs');
  const before = await lstat(anchor);
  const mkdirSpy = vi
    .spyOn(filesystem, 'mkdir')
    .mockRejectedValue(Object.assign(new Error('read-only'), { code: 'EROFS' }));
  const writeSpy = vi
    .spyOn(filesystem, 'writeFile')
    .mockRejectedValue(Object.assign(new Error('read-only'), { code: 'EROFS' }));
  await loadMiddleware(configuration('{package="@fixture/only"}'), new Map(), report);
  expect(mkdirSpy).not.toHaveBeenCalled();
  expect(writeSpy).not.toHaveBeenCalled();
  mkdirSpy.mockRestore();
  writeSpy.mockRestore();
  expect((await lstat(anchor)).mtimeMs).toBe(before.mtimeMs);
  await writeFile(anchor, 'throw Error("must not execute edited anchor")');
  await expect(
    loadMiddleware(configuration('{package="@fixture/only"}'), new Map(), report),
  ).rejects.toThrow();
  expect(diagnostics.at(-1)).toMatchObject({ stage: 'resolve' });
});

it('resolves under a selected .ai configuration without creating project-root infrastructure', async () => {
  const directory = join(root, '.ai/arch');
  await mkdir(join(root, 'node_modules/only'), { recursive: true });
  await writeFile(
    join(root, 'node_modules/only/package.json'),
    '{"type":"module","exports":{"import":"./index.mjs"}}',
  );
  await writeFile(join(root, 'node_modules/only/index.mjs'), valid);
  await Promise.all([
    loadMiddleware(
      { ...configuration('{package="only"}'), configurationDirectory: directory },
      new Map(),
      report,
    ),
    loadMiddleware(
      { ...configuration('{package="only"}'), configurationDirectory: directory },
      new Map(),
      report,
    ),
  ]);
  expect((await readdir(root)).sort()).toEqual(['.ai', 'node_modules']);
  expect(await readdir(join(directory, '.internal'))).toEqual(['resolver-v1.mjs']);
  for (const name of ['node_modules', 'package.json']) {
    const shadow = join(directory, name);
    if ('node_modules' === name) {
      await mkdir(shadow);
    } else {
      await writeFile(shadow, '{}');
    }
    await expect(resolveMiddlewareSource({ package: 'only' }, root, directory)).rejects.toThrow(
      'must not shadow',
    );
    await rm(shadow, { recursive: true });
  }
});

it('rejects helper symlink escapes before creating infrastructure outside the project', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'hcc-helper-outside-'));
  try {
    await symlink(outside, join(root, '.arch'), 'win32' === process.platform ? 'junction' : 'dir');
    await expect(resolveMiddlewareSource({ package: 'only' }, root)).rejects.toThrow(
      'escapes the project root',
    );
    expect(await readdir(outside)).toEqual([]);
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

it('preserves process identity and explicit configuration selection below .ai', async () => {
  await mkdir(join(root, '.ai/arch'), { recursive: true });
  await mkdir(join(root, 'nested'));
  await moduleFile(
    `export const abi=1; export const createMiddleware=({id,options})=>({id,register(api){if(api.context.projectRoot!==options.root) throw Error('identity changed')}});`,
  );
  // TOML receives the platform path through JSON escaping; identity remains the discovered root.
  await writeFile(
    join(root, '.ai/arch/harness.toml'),
    `schema=1\nmiddleware=[{id="external",enabled=true,source={file="./entry.mjs"},options={root=${JSON.stringify(root)}}}]`,
  );
  expect(
    (
      await execute({
        command: basename(process.execPath),
        args: ['-e', ''],
        cwd: join(root, 'nested'),
        configurationDirectory: '.ai/arch',
        preparationTimeoutMs: 1000,
      })
    ).exitCode,
  ).toBe(0);
  expect(await readdir(join(root, '.ai/arch'))).toEqual(['harness.toml']);
});

it.each(['required', 'optional', 'policy-required'])(
  'bounds resolution waiting and never starts a later optional module after the shared budget (%s)',
  async (mode) => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    let notifyStarted: () => void = () => undefined;
    let rejectBlocked: (reason: unknown) => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const blocked = new Promise<string>((_resolve, reject) => {
      rejectBlocked = reject;
    });
    const realpath = vi.spyOn(filesystem, 'realpath').mockImplementationOnce(() => {
      notifyStarted();
      return blocked;
    });
    const config = parseConfiguration(
      `schema=1\nmiddleware=[{id="first",enabled=true,required=${String('required' === mode)},source={file="./entry.mjs"}},{id="second",enabled=true,required=false,source={file="./entry.mjs"}}]`,
      root,
    );
    const pending = loadMiddleware(config, new Map(), report, {
      preparationTimeoutMs: 20,
      requiredPolicies: 'policy-required' === mode ? ['first'] : [],
    });
    const observed = pending.catch((error: unknown) => error);
    try {
      await started;
      await vi.advanceTimersByTimeAsync(20);
      const result: unknown = await observed;
      if ('optional' !== mode) {
        expect(result).toBeInstanceOf(MiddlewareLoadError);
        expect(diagnostics).toEqual([
          expect.objectContaining({ code: 'preparation-timeout', disposition: 'failure' }),
        ]);
      } else {
        expect(result).toMatchObject({ configuration: { middleware: [] } });
        expect(diagnostics.map(({ code, disposition }) => [code, disposition])).toEqual([
          ['preparation-timeout', 'skip'],
          ['preparation-timeout', 'skip'],
        ]);
      }
      expect(realpath).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      rejectBlocked(new Error('late resolution rejection'));
      await Promise.resolve();
      vi.useRealTimers();
    }
  },
);

it.each(['fulfill', 'reject'])(
  'never admits a late import %s and observes its rejection',
  async (mode) => {
    await moduleFile(`await new Promise(resolve=>setTimeout(resolve,100));
    ${'reject' === mode ? 'throw Error("late import");' : ''}
    export const abi=1; export const createMiddleware=()=>{throw Error('must not construct')};`);
    const prepared = await loadMiddleware(
      configuration(undefined, 'required=false'),
      new Map(),
      report,
      { preparationTimeoutMs: 20 },
    );
    expect(prepared.registry.has('external')).toBe(false);
    expect(prepared.configuration.middleware).toEqual([]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ stage: 'import', code: 'preparation-timeout' }),
    ]);
    const settled: unknown = await import(
      await resolveMiddlewareSource({ file: './entry.mjs' }, root)
    ).catch((error: unknown) => error);
    if ('reject' === mode) {
      expect(settled).toBeInstanceOf(Error);
    }
    expect(prepared.registry.has('external')).toBe(false);
  },
);

it.each([0, -1, Infinity, NaN, 60_001, 1.5])(
  'rejects invalid preparation budget %s before resolution',
  async (preparationTimeoutMs) => {
    await expect(
      loadMiddleware(configuration(), new Map(), report, { preparationTimeoutMs }),
    ).rejects.toThrow('Preparation timeout');
    expect(diagnostics).toEqual([]);
  },
);

it('rejects a preparation result at its monotonic deadline even before timer delivery', async () => {
  await moduleFile(valid);
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(20);
  try {
    const prepared = await loadMiddleware(
      configuration(undefined, 'required=false'),
      new Map(),
      report,
      { preparationTimeoutMs: 20 },
    );
    expect(prepared.registry.has('external')).toBe(false);
    expect(diagnostics).toEqual([
      expect.objectContaining({ stage: 'resolve', code: 'preparation-timeout' }),
    ]);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it.each([1, 60_000])(
  'accepts the documented preparation budget endpoint %s',
  async (preparationTimeoutMs) => {
    const prepared = await loadMiddleware({ middleware: [] }, new Map(), report, {
      preparationTimeoutMs,
    });
    expect(prepared.configuration.middleware).toEqual([]);
  },
);

it('preserves legacy cleanup registration during process hooks', async () => {
  await mkdir(join(root, '.arch'));
  await writeFile(
    join(root, '.arch/harness.toml'),
    'schema=1\nmiddleware=[{id="legacy",enabled=true}]',
  );
  const cleanup = vi.fn();
  const registry = new Map([
    [
      'legacy',
      () => ({
        id: 'legacy',
        register(api: import('../../src/middleware.js').MiddlewareAPI) {
          api.on('preflight', () => {
            api.cleanup(cleanup);
          });
        },
      }),
    ],
  ]);
  expect(
    (await execute({ command: basename(process.execPath), args: ['-e', ''], cwd: root, registry }))
      .exitCode,
  ).toBe(0);
  expect(cleanup).toHaveBeenCalledOnce();
});

it.each(['relative', '..'])(
  'rejects invalid trusted helper context %s before provisioning',
  async (mode) => {
    const directory = 'relative' === mode ? 'relative' : join(root, '..');
    await expect(resolveMiddlewareSource({ package: 'only' }, root, directory)).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  },
);

it('closes external hook and cleanup admission synchronously, preserving earlier cleanup', async () => {
  await mkdir(join(root, '.arch'));
  const log = join(root, 'admission.log').replaceAll('\\', '/');
  await moduleFile(`import {appendFileSync} from 'node:fs'; export const abi=1;
    export const createMiddleware=({id,options})=>({id,async register(api){
      api.cleanup(()=>appendFileSync(options.log,'early-cleanup\\n'));
      await Promise.resolve();
      for (const kind of ['hook','cleanup']) {
        try {
          if(kind==='hook') api.on('finalize',()=>appendFileSync(options.log,'late-hook\\n'));
          else api.cleanup(()=>appendFileSync(options.log,'late-cleanup\\n'));
        } catch { appendFileSync(options.log,'rejected:'+kind+'\\n'); }
      }
    }});`);
  await writeFile(
    join(root, '.arch/harness.toml'),
    `schema=1\nmiddleware=[{id="external",enabled=true,source={file="./entry.mjs"},options={log=${JSON.stringify(log)}}}]`,
  );
  const spawned = vi.fn();
  await expect(
    execute({ command: basename(process.execPath), args: ['-e', ''], cwd: root, onSpawn: spawned }),
  ).rejects.toHaveProperty(
    'cause.message',
    'External process registration must return undefined synchronously',
  );
  expect(spawned).not.toHaveBeenCalled();
  expect((await readFile(log, 'utf8')).trim().split('\n')).toEqual([
    'rejected:hook',
    'rejected:cleanup',
    'early-cleanup',
  ]);
});

it('does not fall back to Arch dependencies or substitute packages for missing local files', async () => {
  await expect(
    loadMiddleware(configuration('{package="hookable"}'), new Map(), report),
  ).rejects.toThrow();
  const pkg = join(root, 'node_modules/entry.mjs');
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, 'package.json'), '{"type":"module","exports":"./index.mjs"}');
  await writeFile(join(pkg, 'index.mjs'), valid);
  await expect(loadMiddleware(configuration(), new Map(), report)).rejects.toThrow();
});

it('shares module evaluation but creates fresh instances on concurrent policy dispatches and executions', async () => {
  await copyFile(resolve('tests/fixtures/external-middleware/dual.mjs'), join(root, 'entry.mjs'));
  const log = join(root, 'calls.log');
  const config = configuration(
    undefined,
    `options={log=${JSON.stringify(log.replaceAll('\\', '/'))}}`,
  );
  const options = { requiredPolicies: ['external'], reportMiddlewareDiagnostic: report };
  const outcomes = await Promise.all([
    dispatchPolicy(request, config, new Map(), options),
    dispatchPolicy(request, config, new Map(), options),
  ]);
  expect(outcomes.map((item) => item.outcome)).toEqual(['allow', 'allow']);
  await mkdir(join(root, '.arch'));
  await writeFile(
    join(root, '.arch/harness.toml'),
    `schema=1\nmiddleware=[{id="external",enabled=true,source={file="./entry.mjs"},options={log=${JSON.stringify(log.replaceAll('\\', '/'))}}}]`,
  );
  for (let run = 0; 2 > run; run++) {
    expect(
      (
        await execute({
          command: basename(process.execPath),
          args: ['-e', ''],
          cwd: root,
          registry: new Map(),
          reportMiddlewareDiagnostic: report,
        })
      ).exitCode,
    ).toBe(0);
  }
  const calls = (await readFile(log, 'utf8')).trim().split('\n');
  expect(calls.filter((call) => call.startsWith('policy:'))).toEqual([
    'policy:external:1',
    'policy:external:2',
  ]);
  expect(calls.filter((call) => call.startsWith('process:'))).toEqual([
    'process:external:3',
    'process:external:4',
  ]);
});

it.each(['missing', 'factory', 'no-handler', 'disabled'])(
  'required policy cannot authorize through optional %s',
  async (mode) => {
    if ('factory' === mode) {
      await moduleFile(
        'export const abi=1; export function createMiddleware(){throw Error("failed")}',
      );
    }
    if ('no-handler' === mode || 'disabled' === mode) {
      await moduleFile(valid);
    }
    const parsed = configuration(undefined, 'required=false');
    const config =
      'disabled' === mode
        ? {
            ...parsed,
            middleware: parsed.middleware.map((entry) => ({ ...entry, enabled: false })),
          }
        : parsed;
    const result = await dispatchPolicy(request, config, new Map(), {
      requiredPolicies: ['external'],
      reportMiddlewareDiagnostic: report,
    });
    expect(result).toMatchObject({
      outcome: 'policy-error',
      failures: [
        expect.objectContaining({ code: 'configuration-error', middlewareId: 'external' }),
      ],
    });
  },
);

it('never imports for invalid requests/options and never lets optional registration errors be skipped', async () => {
  await moduleFile('throw Error("must not import")');
  expect(
    await dispatchPolicy({}, configuration(), new Map(), { reportMiddlewareDiagnostic: report }),
  ).toEqual({ outcome: 'invalid-request' });
  expect(
    await dispatchPolicy(request, configuration(), new Map(), {
      timeoutMs: 0,
      reportMiddlewareDiagnostic: report,
    }),
  ).toMatchObject({ outcome: 'policy-error' });
  expect(diagnostics).toEqual([]);
  await writeFile(
    join(root, 'registration.mjs'),
    'export const abi=1; export const createMiddleware=({id})=>({id,register(){},registerPolicy(api){api.cleanup(()=>{throw Error("cleanup")});throw Error("registration")}})',
  );
  const result = await dispatchPolicy(
    request,
    configuration('{file="./registration.mjs"}', 'required=false'),
    new Map(),
    { reportMiddlewareDiagnostic: report },
  );
  expect(result).toMatchObject({
    outcome: 'policy-error',
    failures: [
      expect.objectContaining({ stage: 'registration' }),
      expect.objectContaining({ stage: 'cleanup' }),
    ],
  });
  expect(diagnostics).toEqual([]);
});

it('keeps process failure/finalization and reverse cleanup after optional registration begins', async () => {
  await mkdir(join(root, '.arch'));
  const log = join(root, 'order.log').replaceAll('\\', '/');
  await moduleFile(`import {appendFileSync} from 'node:fs'; export const abi=1;
    export const createMiddleware=({id,options})=>({id,register(api){
      api.on('finalize',()=>appendFileSync(options.log,'finalize:'+id+'\\n'));
      api.cleanup(()=>appendFileSync(options.log,'cleanup:'+id+'\\n'));
      if(id==='second') throw Error('partial registration');
    }});`);
  await writeFile(
    join(root, '.arch/harness.toml'),
    `schema=1\nmiddleware=[${['first', 'second'].map((id) => `{id="${id}",enabled=true,required=false,source={file="./entry.mjs"},options={log=${JSON.stringify(log)}}}`).join(',')}]`,
  );
  const events: string[] = [];
  await expect(
    execute({
      command: basename(process.execPath),
      args: ['-e', ''],
      cwd: root,
      reportMiddlewareDiagnostic: report,
      observe(bus) {
        bus.subscribe('execution.started', () => {
          events.push('started');
        });
        bus.subscribe('execution.failed', (event) => {
          events.push(event.payload.stage);
        });
      },
    }),
  ).rejects.toHaveProperty('cause.message', 'partial registration');
  expect(events).toEqual(['started', 'registration']);
  expect((await readFile(log, 'utf8')).trim().split('\n')).toEqual([
    'finalize:first',
    'finalize:second',
    'cleanup:second',
    'cleanup:first',
  ]);
  expect(diagnostics).toEqual([]);
});

it('reports required preparation failures within the allocated process session', async () => {
  await mkdir(join(root, '.arch'));
  await writeFile(
    join(root, '.arch/harness.toml'),
    'schema=1\nmiddleware=[{id="external",enabled=true,source={file="./missing.mjs"}}]',
  );
  const events: string[] = [];
  await expect(
    execute({
      command: basename(process.execPath),
      args: [],
      cwd: root,
      reportMiddlewareDiagnostic: report,
      observe(bus) {
        bus.subscribe('execution.started', () => {
          events.push('started');
        });
        bus.subscribe('execution.failed', (event) => {
          events.push(event.payload.stage);
        });
      },
    }),
  ).rejects.toHaveProperty('cause.diagnostic.code', 'resolution-error');
  expect(events).toEqual(['started', 'registration']);
});

it('skips an optional factory failure and still launches the native process', async () => {
  await mkdir(join(root, '.arch'));
  await moduleFile(
    'export const abi=1; export function createMiddleware(){throw Error("optional construction failed")}',
  );
  await writeFile(
    join(root, '.arch/harness.toml'),
    'schema=1\nmiddleware=[{id="external",enabled=true,required=false,source={file="./entry.mjs"}}]',
  );
  const spawned = vi.fn();
  const result = await execute({
    command: basename(process.execPath),
    args: ['-e', ''],
    cwd: root,
    onSpawn: spawned,
    reportMiddlewareDiagnostic: report,
  });
  expect(result.exitCode).toBe(0);
  expect(spawned).toHaveBeenCalledOnce();
  expect(diagnostics).toEqual([expect.objectContaining({ stage: 'factory', disposition: 'skip' })]);
});

it('loads a policy-only fixture and keeps optional skips observable on successful dispatch', async () => {
  await copyFile(resolve('tests/fixtures/external-middleware/policy.mjs'), join(root, 'entry.mjs'));
  expect(
    await dispatchPolicy(request, configuration(), new Map(), {
      reportMiddlewareDiagnostic: report,
    }),
  ).toMatchObject({
    outcome: 'deny',
    denials: [{ middlewareId: 'external', reason: 'external-policy' }],
  });
  expect(
    await dispatchPolicy(
      request,
      configuration('{file="./missing.mjs"}', 'required=false'),
      new Map(),
      { reportMiddlewareDiagnostic: report },
    ),
  ).toMatchObject({ outcome: 'allow' });
  expect(diagnostics).toEqual([expect.objectContaining({ disposition: 'skip', stage: 'resolve' })]);
});

it('rejects missing/nonabsolute project context and duplicate explicit configs before imports', async () => {
  const config = configuration();
  await expect(
    loadMiddleware({ middleware: config.middleware }, new Map(), report),
  ).rejects.toThrow();
  const optional = configuration(undefined, 'required=false');
  await expect(
    loadMiddleware({ middleware: optional.middleware }, new Map(), report),
  ).rejects.toThrow('absolute trusted project root');
  await expect(
    loadMiddleware({ ...config, projectRoot: 'relative' }, new Map(), report),
  ).rejects.toThrow();
  await expect(
    loadMiddleware(
      { ...config, middleware: [...config.middleware, ...config.middleware] },
      new Map(),
      report,
    ),
  ).rejects.toThrow('unique id');
  await expect(
    loadMiddleware(
      { middleware: [{ id: 'legacy', enabled: false }, ...optional.middleware] },
      new Map(),
      report,
    ),
  ).rejects.toThrow('absolute trusted project root');
  expect(await dispatchPolicy(request, { middleware: [] }, new Map())).toMatchObject({
    outcome: 'allow',
  });
  expect(
    (
      await loadMiddleware(
        { middleware: optional.middleware.map((entry) => ({ ...entry, enabled: false })) },
        new Map(),
        report,
      )
    ).configuration.middleware[0]?.enabled,
  ).toBe(false);
});

it('preserves resolver publication failure ahead of temporary-file cleanup failure', async () => {
  const primary = Object.assign(new Error('publication refused'), { code: 'EACCES' });
  const secondary = new Error('temporary cleanup refused');
  vi.spyOn(filesystem, 'link').mockRejectedValueOnce(primary);
  vi.spyOn(filesystem, 'unlink').mockRejectedValueOnce(secondary);
  const failure: unknown = await resolveMiddlewareSource({ package: 'fixture' }, root).catch(
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) {
    throw new Error('Expected compound resolver failure');
  }
  expect(failure.cause).toBe(primary);
  expect(failure.errors).toEqual([primary, secondary]);
});

it('does not let a failing diagnostic sink silently authorize an optional skip', async () => {
  const failure = new Error('local diagnostics unavailable');
  const result = await dispatchPolicy(
    request,
    configuration(undefined, 'required=false'),
    new Map(),
    {
      reportMiddlewareDiagnostic() {
        throw failure;
      },
    },
  );
  expect(result).toMatchObject({ outcome: 'policy-error' });
  if ('invalid-request' === result.outcome) {
    throw new Error('Expected correlated failure');
  }
  const cause = result.failures[0]?.cause;
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) {
    throw new Error('Expected diagnostic reporting failure');
  }
  expect(cause.cause).toBe(failure);
});

it('does not mistake a diagnostic sink load-error throw for an optional factory skip', async () => {
  await moduleFile(
    'export const abi=1; export function createMiddleware(){throw Error("factory failed")}',
  );
  const sinkFailure = new MiddlewareLoadError(
    {
      middlewareId: 'other',
      source: { file: './other.mjs' },
      stage: 'factory',
      code: 'factory-error',
      disposition: 'skip',
    },
    new Error('old failure'),
  );
  const result = await dispatchPolicy(
    request,
    configuration(undefined, 'required=false'),
    new Map(),
    {
      reportMiddlewareDiagnostic() {
        throw sinkFailure;
      },
    },
  );
  expect(result.outcome).toBe('policy-error');
  if ('invalid-request' === result.outcome) {
    throw new Error('Expected policy failure');
  }
  const cause = result.failures[0]?.cause;
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) {
    throw new Error('Expected reporter failure');
  }
  expect(cause.cause).toBe(sinkFailure);
});

it('refuses optional async process registration and still cleans resources before any native spawn', async () => {
  await mkdir(join(root, '.arch'));
  const log = join(root, 'cleanup.log').replaceAll('\\', '/');
  await moduleFile(`import {appendFileSync} from 'node:fs'; export const abi=1;
    export const createMiddleware=({id,options})=>({id,async register(api){
      api.cleanup(()=>appendFileSync(options.log,'cleanup'));
      await Promise.resolve();
    }});`);
  await writeFile(
    join(root, '.arch/harness.toml'),
    `schema=1\nmiddleware=[{id="external",enabled=true,required=false,source={file="./entry.mjs"},options={log=${JSON.stringify(log)}}}]`,
  );
  const spawned = vi.fn();
  await expect(
    execute({
      command: basename(process.execPath),
      args: ['-e', ''],
      cwd: root,
      onSpawn: spawned,
      reportMiddlewareDiagnostic: report,
    }),
  ).rejects.toHaveProperty(
    'cause.message',
    'External process registration must return undefined synchronously',
  );
  expect(spawned).not.toHaveBeenCalled();
  expect(await readFile(log, 'utf8')).toBe('cleanup');
  expect(diagnostics).toEqual([]);
});

it('observes rejected registration Promises without inspecting arbitrary thenables', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Promise.prototype, 'then');
  if (!descriptor) {
    throw new Error('Missing intrinsic Promise.then');
  }
  const nativeThen: unknown = descriptor.value;
  if ('function' !== typeof nativeThen) {
    throw new Error('Expected intrinsic Promise.then');
  }
  const rejected = Promise.reject(new Error('registration rejection'));
  const getter = vi.fn(() => {
    throw new Error('Do not read then');
  });
  const thenable = Object.defineProperty({}, 'then', { get: getter });
  let observed = 0;
  void Object.defineProperty(Promise.prototype, 'then', {
    ...descriptor,
    value: function (this: Promise<unknown>, ...args: unknown[]) {
      if (this === rejected) {
        observed++;
      }
      return Reflect.apply(nativeThen, this, args) as Promise<unknown>;
    },
  });
  try {
    expect(() => {
      assertSynchronousRegistration(rejected, 'registration contract');
    }).toThrow('registration contract');
    expect(observed).toBe(1);
    expect(() => {
      assertSynchronousRegistration(thenable, 'registration contract');
    }).toThrow('registration contract');
    expect(getter).not.toHaveBeenCalled();
  } finally {
    void Object.defineProperty(Promise.prototype, 'then', descriptor);
    void Promise.prototype.then.call(
      rejected,
      () => undefined,
      () => undefined,
    );
  }
});

it('reports the complete sanitized default diagnostic and retains required construction causes locally', async () => {
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const optional = await loadMiddleware(configuration(undefined, 'required=false'), new Map());
  expect(optional.diagnostics).toEqual([
    {
      middlewareId: 'external',
      source: { file: './entry.mjs' },
      stage: 'resolve',
      code: 'resolution-error',
      disposition: 'skip',
    },
  ]);
  expect(stderr).toHaveBeenCalledWith('[arch:middleware]', JSON.stringify(optional.diagnostics[0]));
  await moduleFile(
    'export const abi=1; export function createMiddleware(){throw "local-only-cause"}',
  );
  const prepared = await loadMiddleware(configuration(), new Map(), report);
  try {
    instantiateMiddleware(prepared.configuration.middleware[0]!, prepared.registry);
    throw new Error('Expected required construction failure');
  } catch (error) {
    expect(error).toBeInstanceOf(MiddlewareLoadError);
    if (!(error instanceof MiddlewareLoadError)) {
      throw error;
    }
    expect(error.cause).toBe('local-only-cause');
    expect(error.diagnostic).toEqual({
      middlewareId: 'external',
      source: { file: './entry.mjs' },
      resolvedUrl: await resolveMiddlewareSource({ file: './entry.mjs' }, root),
      stage: 'factory',
      code: 'factory-error',
      disposition: 'failure',
    });
  }
  expect(JSON.stringify(diagnostics)).not.toContain('local-only-cause');
});

it('observes rejected factory Promises with the intrinsic method', async () => {
  await moduleFile(`export const abi=1; let returned;
    export const getReturned=()=>returned;
    export function createMiddleware(){returned=Promise.reject(Error('factory rejection'));return returned;}`);
  const prepared = await loadMiddleware(
    configuration(undefined, 'required=false'),
    new Map(),
    report,
  );
  const namespace = (await import(
    await resolveMiddlewareSource({ file: './entry.mjs' }, root)
  )) as {
    getReturned: () => Promise<unknown>;
  };
  const then = vi.spyOn(Promise.prototype, 'then');
  try {
    expect(
      instantiateMiddleware(prepared.configuration.middleware[0]!, prepared.registry),
    ).toBeUndefined();
    expect(
      then.mock.contexts.filter((context) => context === namespace.getReturned()),
    ).toHaveLength(1);
  } finally {
    then.mockRestore();
    // A test-owned observer prevents a broken mutant from crashing the runner itself.
    void Promise.prototype.then.call(
      namespace.getReturned(),
      () => undefined,
      () => undefined,
    );
  }
});

it('rejects lexical escape even when a symlink brings the canonical target back inside', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'hcc-alias-'));
  try {
    await moduleFile(valid);
    await symlink(root, join(outside, 'back'), 'win32' === process.platform ? 'junction' : 'dir');
    await expect(
      resolveMiddlewareSource({ file: `./../${basename(outside)}/back/entry.mjs` }, root),
    ).rejects.toThrow('escapes the project root');
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

it('requires explicit file extensions, rejects directories, and inherits only explicit ESM scopes', async () => {
  await mkdir(join(root, 'nested'));
  await writeFile(join(root, 'nested/entry.js'), valid);
  for (const metadata of ['null', '1', '{}', '{"type":"commonjs"}']) {
    await writeFile(join(root, 'package.json'), metadata);
    await expect(resolveMiddlewareSource({ file: './nested/entry.js' }, root)).rejects.toThrow(
      'type = module',
    );
  }
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  expect(await resolveMiddlewareSource({ file: './nested/entry.js' }, root)).toContain('entry.js');
  await mkdir(join(root, 'directory.mjs'));
  await expect(resolveMiddlewareSource({ file: './directory.mjs' }, root)).rejects.toThrow(
    'must be a file',
  );
  await expect(resolveMiddlewareSource({ file: './entry\0.mjs' }, root)).rejects.toThrow(
    'explicit ./',
  );
  await expect(resolveMiddlewareSource({ file: './implicit' }, root)).rejects.toThrow(
    'explicit .mjs',
  );
  if ('win32' === process.platform) {
    await expect(
      resolveMiddlewareSource({ file: './entry.mjs' }, '\\root-relative'),
    ).rejects.toThrow('absolute trusted project root');
  }
});
