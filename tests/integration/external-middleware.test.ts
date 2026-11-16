import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

const run = promisify(execFile);
const cli = resolve('dist/cli.js');
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hcc-external-cli-'));
  await mkdir(join(root, '.arch'));
  await mkdir(join(root, 'nested'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function configure(source: string, fields = '', enabled = true) {
  await writeFile(
    join(root, '.arch/harness.toml'),
    `schema=1\n[[middleware]]\nid="external"\nenabled=${String(enabled)}\nsource=${source}\n${fields}`,
  );
}
function invoke() {
  return run(
    process.execPath,
    [
      cli,
      'run',
      basename(process.execPath),
      '--',
      '-e',
      'console.log(process.env.HCC_EXTERNAL ?? "absent")',
    ],
    { cwd: join(root, 'nested'), timeout: 15_000 },
  );
}

it('arch run loads a local standalone module from nested cwd with URL-sensitive characters', async () => {
  const name = 'project #100% ü.mjs';
  await copyFile(resolve('tests/fixtures/external-middleware/process.mjs'), join(root, name));
  const source = `{file=${JSON.stringify('./' + name)}}`;
  await configure(source, 'options={value="configured"}');
  expect((await invoke()).stdout.trim()).toBe('configured');
  await configure(source, '', false);
  expect((await invoke()).stdout.trim()).toBe('absent');
  await rm(join(root, name));
  await configure(source, 'required=false');
  const optional = await invoke();
  expect(optional.stdout.trim()).toBe('absent');
  expect(optional.stderr).toContain('"disposition":"skip"');
  await configure(source);
  await expect(invoke()).rejects.toMatchObject({ code: 1 });
});

it('arch run resolves an import-only ESM package through the project anchor', async () => {
  const pkg = join(root, 'node_modules/@fixture/external');
  await mkdir(pkg, { recursive: true });
  await writeFile(
    join(pkg, 'package.json'),
    '{"type":"module","exports":{"import":"./index.mjs","require":"./wrong.cjs"}}',
  );
  await copyFile(resolve('tests/fixtures/external-middleware/process.mjs'), join(pkg, 'index.mjs'));
  await writeFile(join(pkg, 'wrong.cjs'), 'throw Error("wrong export condition")');
  await configure('{package="@fixture/external"}');
  expect((await invoke()).stdout.trim()).toBe('loaded');
  expect(await readFile(join(root, '.arch-middleware-resolver-v1.mjs'), 'utf8')).toContain(
    'import.meta.resolve',
  );
});

it('public authoring types compile from a standalone installed package layout', async () => {
  const pkg = join(root, 'node_modules/arch-harness');
  await mkdir(pkg, { recursive: true });
  await copyFile(resolve('package.json'), join(pkg, 'package.json'));
  await cp(resolve('dist'), join(pkg, 'dist'), {
    recursive: true,
    filter: (path) => !path.endsWith('.js'),
  });
  await cp(resolve('node_modules/emittery'), join(root, 'node_modules/emittery'), {
    recursive: true,
  });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(
    join(root, 'author.ts'),
    `import type {ArchMiddleware, MiddlewareAPI, PolicyAPI, MiddlewareFactoryInput, MiddlewareModule} from 'arch-harness/middleware';
export const abi = 1;
export const createMiddleware: MiddlewareModule['createMiddleware'] = ({id,options}: MiddlewareFactoryInput): ArchMiddleware => ({
  id, register(api: MiddlewareAPI) { api.on('preflight', () => { String(options.mode); }); },
  registerPolicy(api: PolicyAPI) { api.on('agent.beforeSpawn', () => ({action:'allow'})); }
});`,
  );
  await run(
    process.execPath,
    [
      resolve('node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--module',
      'NodeNext',
      '--target',
      'es2023',
      join(root, 'author.ts'),
    ],
    { cwd: root, timeout: 15_000 },
  );
});
