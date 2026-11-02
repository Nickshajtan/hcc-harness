import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  copyFile,
  cp,
  link,
  mkdir,
  readFile,
  realpath,
  rename,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join, resolve, dirname, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { world, run, records } from '../support.js';
import { requiredEnvironment, runtimeOutput } from '../support.js';

const bootstrap = process.env.ARCH_B1_BOOTSTRAP;
const node20 = process.env.ARCH_B1_NODE20;
const node22 = process.env.ARCH_B1_NODE22;
const enabled = 'win32' === process.platform && !!bootstrap && !!node20 && !!node22;
describe.skipIf(!enabled)(
  'B1 Windows executable feasibility (explicit bootstrap + real Node 20/22 required)',
  () => {
    let f: Awaited<ReturnType<typeof world>>;
    let app: string,
      entry: string,
      cli: string,
      route: string,
      path24: string,
      path20: string,
      path22: string;
    const hostile = [
      '',
      'a"b',
      'a\\"b',
      'tail space\\',
      '\\\\server\\share\\',
      '%PATH% & | < > ^ !',
      '日本語 Україна',
      'line\nbreak',
    ];
    beforeAll(async () => {
      f = await world(await realpath(tmpdir()));
      app = join(f.root, 'Arch bootstrap 空間');
      await mkdir(app);
      await cp(resolve('dist'), join(app, 'dist'), { recursive: true });
      await copyFile(resolve('package.json'), join(app, 'package.json'));
      await symlink(resolve('node_modules'), join(app, 'node_modules'), 'junction');
      await cp(resolve('vendor'), join(app, 'vendor'), { recursive: true });
      entry = join(app, 'arch-bootstrap.exe');
      cli = join(app, 'dist/cli.js');
      await copyFile(requiredEnvironment('ARCH_B1_BOOTSTRAP'), entry);
      for (const [name, source] of [
        ['24', process.execPath],
        ['20', requiredEnvironment('ARCH_B1_NODE20')],
        ['22', requiredEnvironment('ARCH_B1_NODE22')],
      ] as const) {
        const dir = join(f.root, 'Node ' + name);
        await mkdir(dir);
        await copyFile(source, join(dir, 'node.exe'));
      }
      path24 = join(f.root, 'Node 24/node.exe');
      path20 = join(f.root, 'Node 20/node.exe');
      path22 = join(f.root, 'Node 22/node.exe');
      expect((await run(path20, ['--version'], f.C, f.env)).stdout).toMatch(/^v20\./);
      expect((await run(path22, ['--version'], f.C, f.env)).stdout).toMatch(/^v22\./);
      expect(await run(entry, ['init', 'claude'], f.A, environment())).toMatchObject({ code: 0 });
      route = join(f.A, '.arch/bin/claude.exe');
      // Opt-in feasibility route: do not modify renderer/ownership formats yet.
      await copyFile(resolve('vendor/shim-x64.exe'), route);
      await writeFile(
        join(f.A, '.arch/bin/claude.shim'),
        `path = ${entry}\nargs = run claude --\n`,
      );
    });
    afterAll(async () => {
      await f?.dispose();
    });
    function environment(nativeNode = path24): NodeJS.ProcessEnv {
      const env: NodeJS.ProcessEnv = {
        ...f.env,
        PATH: [f.native, dirname(nativeNode)].join(delimiter),
      };
      delete env.ARCH_NODE;
      return env;
    }
    it('runs help and dispatch through compatible PATH and explicit override', async () => {
      expect(await run(entry, ['--help'], f.C, environment())).toMatchObject({ code: 0 });
      const result = await run(entry, ['status', '--json'], f.C, {
        ...environment(path20),
        ARCH_NODE: path24,
      });
      expect(result, result.stderr).toMatchObject({ code: 0 });
      const status: unknown = JSON.parse(result.stdout);
      expect(status).toMatchObject({ state: 'uninitialized' });
    });
    it('preserves Scoop route arguments, cwd, stdin/out/err and nonzero exit', async () => {
      const env = { ...environment(path20), ARCH_NODE: path24, FAKE_STDIN: '1', FAKE_EXIT: '23' };
      const result = await run(route, hostile, f.A, env, 'input\nsecond line\n');
      expect(result, result.stderr).toMatchObject({ code: 23 });
      expect(JSON.parse(result.stdout.split(/\r?\n/)[0] ?? '')).toMatchObject({
        args: hostile,
        cwd: f.A,
      });
      expect(result.stdout).toContain('input\nsecond line\n');
      expect(result.stderr).toContain('native stderr');
    });
    it.each(['20', '22'])(
      'rejects incompatible PATH Node %s before executing harness code',
      async (version) => {
        const result = await run(
          entry,
          ['init', 'claude'],
          f.B,
          environment('20' === version ? path20 : path22),
        );
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('requires >=24.15.0 <25');
        await expect(readFile(join(f.B, '.arch/bootstrap.json'))).rejects.toMatchObject({
          code: 'ENOENT',
        });
      },
    );
    it('diagnoses missing runtime, invalid override, and refuses incompatible override without fallback', async () => {
      for (const override of ['node.exe', join(f.root, 'gone/node.exe'), path20, '']) {
        const result = await run(entry, ['--help'], f.C, { ...environment(), ARCH_NODE: override });
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('[arch bootstrap]');
        expect(result.stdout).toBe('');
      }
      const missing = await run(entry, ['--help'], f.C, { ...environment(), PATH: f.native });
      expect(missing.code).toBe(1);
      expect(missing.stderr).toContain('No node.exe on PATH');
    });
    it('survives removal of the original compatible Node when a second PATH runtime replaces it', async () => {
      const dir = join(f.root, 'replacement24');
      await mkdir(dir);
      await copyFile(path24, join(dir, 'node.exe'));
      await rename(path24, path24 + '.removed');
      try {
        const result = await run(entry, ['--help'], f.C, environment(join(dir, 'node.exe')));
        expect(result, result.stderr).toMatchObject({ code: 0 });
        expect((await run(entry, ['--help'], f.C, environment())).stderr).toContain(
          'No node.exe on PATH',
        );
      } finally {
        await rename(path24 + '.removed', path24);
      }
      expect(await run(entry, ['--help'], f.C, environment())).toMatchObject({ code: 0 });
    });
    it('refuses self aliases and marked router runtime candidates', async () => {
      for (const target of [entry, route]) {
        const result = await run(entry, ['--help'], f.C, { ...environment(), ARCH_NODE: target });
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('Recursive Arch Node');
      }
      const alias = join(f.root, 'self-alias.exe');
      await link(entry, alias);
      expect(
        (await run(entry, ['--help'], f.C, { ...environment(), ARCH_NODE: alias })).stderr,
      ).toContain('Recursive Arch Node');
      const aliasDir = join(f.root, 'alias-directory');
      await symlink(app, aliasDir, 'junction');
      expect(
        (
          await run(entry, ['--help'], f.C, {
            ...environment(),
            ARCH_NODE: join(aliasDir, 'arch-bootstrap.exe'),
          })
        ).stderr,
      ).toContain('Recursive Arch Node');
    });
    it('uses real native Node 20/22 concurrently, independently from Arch Node 24 and ARCH_NODE', async () => {
      await writeFile(
        join(f.native, 'runtime.cjs'),
        '#!/usr/bin/env node\nconst fs=require("node:fs"); console.log(JSON.stringify({node:process.version,exec:process.execPath,path:process.env.PATH,cwd:process.cwd(),args:process.argv.slice(2),override:process.env.ARCH_NODE})); console.error("runtime stderr"); process.stdout.write(fs.readFileSync(0,"utf8")); process.exit(7);\n',
      );
      await writeFile(
        join(f.native, 'runtime.cmd'),
        '@echo off\r\nnode "%~dp0\\runtime.cjs" %*\r\n',
      );
      const results = await Promise.all(
        [path20, path22].map(async (native, index) => {
          const env: NodeJS.ProcessEnv = { ...environment(native), ARCH_NODE: path24 };
          const project = index ? f.B : f.C; // no Arch config: native passthrough
          const result = await run(
            entry,
            ['run', 'runtime', '--', ...hostile],
            project,
            env,
            'native input',
          );
          expect(result, result.stderr).toMatchObject({ code: 7 });
          expect(result.stderr).toContain('runtime stderr');
          const record: unknown = JSON.parse(result.stdout.split(/\r?\n/)[0] ?? '');
          expect(record).toMatchObject({
            exec: native,
            path: env.PATH,
            override: path24,
            cwd: project,
            args: hostile,
          });
          expect(result.stdout).toContain('native input');
          return runtimeOutput(result.stdout).node;
        }),
      );
      expect(results[0]).toMatch(/^v20\./);
      expect(results[1]).toMatch(/^v22\./);
    });
    it.each([
      ['0', 130],
      ['1', 149],
    ] as const)(
      'handles real console event %s through Scoop/bootstrap with cleanup and no native survivor',
      async (type, code) => {
        const log = join(f.root, `bootstrap-console-${type}.jsonl`);
        const result = await run(join(f.root, 'console-driver.exe'), [route, '-', type], f.A, {
          ...environment(path22),
          ARCH_NODE: path24,
          FAKE_LOG: log,
          FAKE_WAIT: '1',
        });
        expect([code, 0xc000013a], result.stdout + result.stderr).toContain(result.code);
        expect(result.stderr).toContain('[arch:demo] cleanup');
        const native = await records(log);
        expect(native).toHaveLength(1);
        const child = native[0];
        if (!child) {
          throw new Error('Missing native process record');
        }
        expect(() => process.kill(child.pid, 0)).toThrow();
      },
    );
    it.each([
      ['0', 130],
      ['1', 149],
    ] as const)(
      'preserves console event %s for a real npm CLI running Node 20',
      async (type, code) => {
        const npmRoute = join(f.A, '.arch/bin/npm-console.exe');
        await copyFile(resolve('vendor/shim-x64.exe'), npmRoute);
        await writeFile(
          join(f.A, '.arch/bin/npm-console.shim'),
          `path = ${entry}\nargs = run npm-console --\n`,
        );
        await writeFile(
          join(f.native, 'npm-console.cjs'),
          '#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.FAKE_LOG,JSON.stringify({pid:process.pid,node:process.version})+"\\n"); setInterval(()=>{},1000);\n',
        );
        await writeFile(
          join(f.native, 'npm-console.cmd'),
          '@echo off\r\nnode "%~dp0\\npm-console.cjs" %*\r\n',
        );
        const log = join(f.root, `npm-console-${type}.jsonl`);
        const result = await run(join(f.root, 'console-driver.exe'), [npmRoute, '-', type], f.A, {
          ...environment(path20),
          ARCH_NODE: path24,
          FAKE_LOG: log,
        });
        expect([code, 0xc000013a], result.stdout + result.stderr).toContain(result.code);
        expect(result.stderr).toContain('[arch:demo] cleanup');
        const native = await records(log, 'process');
        expect(native).toHaveLength(1);
        expect(native[0]?.node).toMatch(/^v20\./);
        const child = native[0];
        if (!child) {
          throw new Error('Missing native process record');
        }
        expect(() => process.kill(child.pid, 0)).toThrow();
      },
    );
    it('retains user-edited middleware through explicit deinit/init rebind', async () => {
      // Use a separate owned installation; the opt-in route above intentionally
      // does not rewrite ownership hashes and must not be used for mutation tests.
      expect(await run(entry, ['init', 'claude'], f.B, environment())).toMatchObject({ code: 0 });
      const config = join(f.B, '.arch/harness.toml');
      const edited = 'schema=1\n# keep my configuration\nmiddleware=[]\n';
      await writeFile(config, edited);
      expect(await run(entry, ['deinit', '--yes'], f.B, environment())).toMatchObject({ code: 0 });
      expect(await readFile(config, 'utf8')).toBe(edited);
      expect(await run(entry, ['init', 'claude'], f.B, environment())).toMatchObject({ code: 0 });
      expect(await readFile(config, 'utf8')).toBe(edited);
      expect(await run(entry, ['deinit', '--yes'], f.B, environment())).toMatchObject({ code: 0 });
    });
    it('investigates existing Scoop ARCH_NODE expansion and demonstrates absent version validation', async () => {
      const scoop = join(f.root, 'scoop.exe');
      await copyFile(resolve('vendor/shim-x64.exe'), scoop);
      const probe = join(f.root, 'version-probe.cjs');
      await writeFile(probe, 'console.log(process.version);');
      await writeFile(join(f.root, 'scoop.shim'), `path = %ARCH_NODE%\nargs = "${probe}"\n`);
      const supported = await run(scoop, [], f.C, { ...environment(), ARCH_NODE: path24 });
      expect(supported.code).toBe(0);
      expect(supported.stdout).toMatch(/^v24\./);
      const incompatible = await run(scoop, [], f.C, { ...environment(), ARCH_NODE: path20 });
      expect(incompatible.code).toBe(0);
      expect(incompatible.stdout).toMatch(/^v20\./);
    });
    it('reports missing application without executing old checkout paths', async () => {
      await rename(cli, cli + '.gone');
      try {
        expect((await run(entry, ['--help'], f.C, environment())).stderr).toContain(
          'Arch application missing',
        );
      } finally {
        await rename(cli + '.gone', cli);
      }
    });
    it('uses PATH order, never a compatible later Node behind an incompatible first Node', async () => {
      const env = {
        ...environment(),
        PATH: [dirname(path20), dirname(path24), f.native].join(delimiter),
      };
      const result = await run(entry, ['--help'], f.C, env);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('requires >=24.15.0 <25');
      expect(await run(entry, ['--help'], f.C, { ...env, ARCH_NODE: path24 })).toMatchObject({
        code: 0,
      });
    });
    it('bounds a stalled version probe and rejects malformed version output before harness dispatch', async () => {
      // Native fixture with no --version branch: wrong output or intentional wait.
      const candidate = join(f.native, 'claude.exe');
      const malformed = await run(entry, ['init', 'claude'], f.C, {
        ...environment(),
        ARCH_NODE: candidate,
      });
      expect(malformed.code).toBe(1);
      expect(malformed.stderr).toContain('Invalid Node version probe');
      const waiting = await run(entry, ['init', 'claude'], f.C, {
        ...environment(),
        ARCH_NODE: candidate,
        FAKE_WAIT: '1',
      });
      expect(waiting.code).toBe(1);
      expect(waiting.stderr).toContain('probe timed out');
      await expect(readFile(join(f.C, '.arch/bootstrap.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });
  },
);
