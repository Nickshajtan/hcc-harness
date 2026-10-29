import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  realpath,
  rename,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { records, run, start, world } from '../support.js';

// Normal regression runs don't provision a second engine. The mandatory CI job
// sets this flag and fails setup (rather than skipping) if prerequisites are absent.
describe.skipIf(process.env.ARCH_RUNTIME_CONTRACT !== '1')('M2.2 shared runtime contract', () => {
  const windows = process.platform === 'win32';
  const executable = windows ? 'node.exe' : 'node';
  let f: Awaited<ReturnType<typeof world>>;
  let archNode: string, projectNode: string, replacement: string, app: string, entry: string;
  const args = ['', 'a"b', 'tail space\\', '%PATH% & | < > ^ !', '日本語 Україна', 'line\nbreak'];
  function env(node = projectNode): NodeJS.ProcessEnv {
    return {
      ...f.env,
      PATH: [f.native, dirname(node), '/usr/bin', '/bin'].join(delimiter),
      ARCH_NODE: archNode,
      CONTRACT_ENV: 'keep 日本語 & spaces',
    };
  }
  async function layout(directory: string) {
    await mkdir(directory);
    await cp(resolve('dist'), join(directory, 'dist'), { recursive: true });
    await cp(resolve('vendor'), join(directory, 'vendor'), { recursive: true });
    await copyFile(resolve('package.json'), join(directory, 'package.json'));
    await symlink(
      resolve('node_modules'),
      join(directory, 'node_modules'),
      windows ? 'junction' : 'dir',
    );
    const target = join(directory, windows ? 'arch-bootstrap.exe' : 'arch-bootstrap');
    await copyFile(
      windows ? process.env.ARCH_B1_BOOTSTRAP! : resolve('scripts/b1/arch-bootstrap.sh'),
      target,
    );
    if (!windows) await chmod(target, 0o755);
    return target;
  }
  beforeAll(async () => {
    expect(['win32', 'linux', 'darwin']).toContain(process.platform);
    expect(
      process.env.ARCH_B1_NODE22,
      'Real independently provisioned Node 22 is mandatory',
    ).toBeTruthy();
    if (windows)
      expect(process.env.ARCH_B1_BOOTSTRAP, 'Compiled Windows bootstrap is mandatory').toBeTruthy();
    f = await world(await realpath(tmpdir()));
    const paths = [];
    for (const [name, source] of [
      ['arch24', process.execPath],
      ['project22', process.env.ARCH_B1_NODE22!],
      ['replacement24', process.execPath],
    ]) {
      const dir = join(f.root, name!);
      await mkdir(dir);
      const target = join(dir, executable);
      await copyFile(source!, target);
      if (!windows) await chmod(target, 0o755);
      paths.push(target);
    }
    [archNode, projectNode, replacement] = paths as [string, string, string];
    expect((await run(archNode, ['--version'], f.C, env())).stdout).toMatch(/^v24\./);
    expect((await run(projectNode, ['--version'], f.C, env())).stdout).toMatch(/^v22\./);
    app = join(f.root, 'current Arch 日本語');
    entry = await layout(app);
    const script = join(f.native, 'runtime.cjs');
    await writeFile(
      script,
      '#!/usr/bin/env node\n' +
        'const fs=require("node:fs"); const record={node:process.version,exec:process.execPath,args:process.argv.slice(2),cwd:process.cwd(),path:process.env.PATH,override:process.env.ARCH_NODE,custom:process.env.CONTRACT_ENV,pid:process.pid};\n' +
        'console.log(JSON.stringify(record)); console.error("native stderr");\n' +
        'if(process.env.CONTRACT_WAIT){fs.appendFileSync(process.env.FAKE_LOG,JSON.stringify(record)+"\\n"); console.error("native ready");setInterval(()=>{},1000);}else{process.stdout.write(fs.readFileSync(0,"utf8"));process.exit(23);}\n',
    );
    // Standard npm package executable generation, not a hand-written approximation.
    const require = createRequire(process.env.npm_execpath!);
    const cmdShim = createRequire(require.resolve('bin-links'))('cmd-shim') as (
      from: string,
      to: string,
    ) => Promise<void>;
    await cmdShim(script, join(f.native, 'runtime'));
    expect(await run(entry, ['init', 'runtime'], f.A, env())).toMatchObject({ code: 0 });
    // Feasibility fixture only: production launcher/manifest formats stay unchanged.
    if (windows)
      await writeFile(
        join(f.A, '.arch/bin/runtime.shim'),
        `path = ${entry}\nargs = run runtime --\n`,
      );
    else {
      await writeFile(
        join(f.A, '.arch/bin/runtime'),
        `#!/bin/sh\nexec '${entry.replaceAll("'", "'\\''")}' run runtime -- "$@"\n`,
      );
      await chmod(join(f.A, '.arch/bin/runtime'), 0o755);
    }
  });
  afterAll(async () => {
    await f?.dispose();
  });
  function route() {
    return join(f.A, '.arch/bin/runtime' + (windows ? '.exe' : ''));
  }
  it('runs Arch on Node 24 while the selected project Node remains 22', async () => {
    // NODE_OPTIONS probe records the actual Arch process runtime, not just a version command.
    const log = join(f.root, 'arch-probe.jsonl'),
      probe = join(f.root, 'probe.cjs');
    await writeFile(
      probe,
      'require("node:fs").appendFileSync(process.env.CONTRACT_PROBE,JSON.stringify({version:process.version,exec:process.execPath})+"\\n");',
    );
    const result = await run(entry, ['--help'], f.C, {
      ...env(),
      NODE_OPTIONS: `--require ${JSON.stringify(probe)}`,
      CONTRACT_PROBE: log,
    });
    expect(result, result.stderr).toMatchObject({ code: 0 });
    const loaded = (await readFile(log, 'utf8'))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    expect(loaded.length).toBeGreaterThan(0);
    for (const record of loaded) {
      expect(record.version).toMatch(/^v24\./);
      expect(await realpath(record.exec)).toBe(await realpath(archNode));
    }
    expect((await run(projectNode, ['--version'], f.C, env())).stdout).toMatch(/^v22\./);
  });
  it('rejects incompatible Node 22 without changing the project or falling back silently', async () => {
    const environment = env();
    delete environment.ARCH_NODE;
    const result = await run(entry, ['init', 'runtime'], f.B, environment);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('requires >=24.15.0 <25');
    await expect(readFile(join(f.B, '.arch/bootstrap.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('preserves npm shim Node selection, args, environment, cwd, stdio and native exit through routing', async () => {
    const environment = env();
    const result = await run(route(), args, f.A, environment, 'input\nsecond line\n');
    expect(result, result.stderr).toMatchObject({ code: 23 });
    expect(JSON.parse(result.stdout.split(/\r?\n/)[0]!)).toMatchObject({
      node: expect.stringMatching(/^v22\./),
      exec: projectNode,
      args,
      cwd: f.A,
      path: environment.PATH,
      override: archNode,
      custom: environment.CONTRACT_ENV,
    });
    expect(result.stdout).toContain('input\nsecond line\n');
    expect(result.stderr).toContain('native stderr');
  });
  it('honors the standard npm shim adjacent Node independently of Arch runtime', async () => {
    const adjacent = join(f.native, executable);
    await copyFile(projectNode, adjacent);
    if (!windows) await chmod(adjacent, 0o755);
    try {
      const result = await run(route(), [], f.A, env(replacement));
      expect(result, result.stderr).toMatchObject({ code: 23 });
      expect(JSON.parse(result.stdout.split(/\r?\n/)[0]!).exec).toBe(adjacent);
    } finally {
      const { unlink } = await import('node:fs/promises');
      await unlink(adjacent);
    }
  });
  it('survives simulated PATH switching with independent Arch Node and concurrent native runtimes', async () => {
    const results = await Promise.all(
      [projectNode, replacement].map(async (node) => {
        const result = await run(route(), ['concurrent'], f.A, env(node));
        expect(result, result.stderr).toMatchObject({ code: 23 });
        expect(JSON.parse(result.stdout.split(/\r?\n/)[0]!).exec).toBe(node);
        return JSON.parse(result.stdout.split(/\r?\n/)[0]!).node;
      }),
    );
    expect(results[0]).toMatch(/^v22\./);
    expect(results[1]).toMatch(/^v24\./);
  });
  it('recovers legacy ownership with missing historical Node and relocated checkout; preserves edited middleware', async () => {
    const historical = join(f.root, 'historical checkout');
    await layout(historical);
    const historicalDir = join(f.root, 'historical Node');
    await mkdir(historicalDir);
    const historicalNode = join(historicalDir, executable);
    await copyFile(archNode, historicalNode);
    if (!windows) await chmod(historicalNode, 0o755);
    // Real init captures the historical executable + checkout in valid unchanged owned files.
    const init = await run(
      historicalNode,
      [join(historical, 'dist/cli.js'), 'init', 'runtime'],
      f.B,
      env(),
    );
    expect(init, init.stderr).toMatchObject({ code: 0 });
    const config = join(f.B, '.arch/harness.toml'),
      edited = 'schema=1\n# user middleware configuration\nmiddleware=[]\n';
    await writeFile(config, edited);
    await rename(historicalNode, historicalNode + '.removed');
    await rename(historical, historical + '.relocated');
    const environment = { ...env(), ARCH_NODE: replacement };
    const status = await run(entry, ['status', '--json'], f.B, environment);
    expect(status, status.stderr).toMatchObject({ code: 0 });
    expect(await readFile(config, 'utf8')).toBe(edited);
    for (let attempt = 0; attempt < 2; attempt++)
      expect(await run(entry, ['deinit', '--yes'], f.B, environment)).toMatchObject({ code: 0 });
    expect(await readFile(config, 'utf8')).toBe(edited);
    expect(await run(entry, ['init', 'runtime'], f.B, environment)).toMatchObject({ code: 0 });
    expect(await readFile(config, 'utf8')).toBe(edited);
    expect(await run(entry, ['deinit', '--yes'], f.B, environment)).toMatchObject({ code: 0 });
  });
  it('restores routing with replacement Arch Node after the historical runtime is removed', async () => {
    await rename(archNode, archNode + '.removed');
    try {
      expect((await run(entry, ['--help'], f.C, env())).code).toBe(1);
      const result = await run(route(), [], f.A, { ...env(), ARCH_NODE: replacement });
      expect(result, result.stderr).toMatchObject({ code: 23 });
      expect(JSON.parse(result.stdout.split(/\r?\n/)[0]!).exec).toBe(projectNode);
      expect(
        await run(entry, ['status', '--json'], f.B, { ...env(), ARCH_NODE: replacement }),
      ).toMatchObject({ code: 0 });
    } finally {
      await rename(archNode + '.removed', archNode);
    }
  });
  it('preserves supported console signals, cleanup and native child lifetime', async () => {
    for (const [signal, code, event] of [
      ['SIGINT', 130, '0'],
      [windows ? 'SIGBREAK' : 'SIGTERM', windows ? 149 : 143, '1'],
    ] as const) {
      const log = join(f.root, `shared-${signal}.jsonl`),
        environment = { ...env(), CONTRACT_WAIT: '1', FAKE_LOG: log };
      if (windows) {
        const result = await run(
          join(f.root, 'console-driver.exe'),
          [route(), '-', event],
          f.A,
          environment,
        );
        expect([code, 0xc000013a], result.stdout + result.stderr).toContain(result.code);
        expect(result.stderr).toContain('[arch:demo] cleanup');
      } else {
        const invocation = start(route(), [], f.A, environment);
        invocation.child.stdin.end();
        try {
          const deadline = Date.now() + 10_000;
          while (!invocation.output().stderr.includes('native ready')) {
            if (Date.now() > deadline)
              throw new Error('Native child did not become ready: ' + invocation.output().stderr);
            await new Promise((done) => setTimeout(done, 20));
          }
          invocation.child.kill(signal);
          const result = await invocation.result;
          expect(result.code).toBe(code);
          expect(result.stderr).toContain('[arch:demo] cleanup');
        } finally {
          invocation.child.kill('SIGKILL');
        }
      }
      const native = await records(log);
      expect(native).toHaveLength(1);
      expect(() => process.kill(native[0]!.pid, 0)).toThrow();
    }
  });
  it('switches real mise-linked project runtimes offline without altering Arch runtime', async () => {
    const mise = process.env.ARCH_B1_MISE;
    expect(mise, 'Real mise executable is mandatory for the portability gate').toBeTruthy();
    // Only isolated data/config/home are used. mise links pre-provisioned local
    // runtimes; no downloads and no changes to global runner installations.
    for (const [version, node] of [
      ['22.12.0', projectNode],
      ['24.19.0', replacement],
    ] as const) {
      const installation = windows ? dirname(node) : dirname(dirname(node));
      // POSIX mise expects bin/node in its linked installation.
      let root = installation;
      if (!windows) {
        root = join(f.root, 'mise-' + version);
        await mkdir(join(root, 'bin'), { recursive: true });
        await copyFile(node!, join(root, 'bin/node'));
        await chmod(join(root, 'bin/node'), 0o755);
      }
      const linked = await run(mise!, ['link', `node@${version}`, root], f.C, env());
      expect(linked, linked.stderr).toMatchObject({ code: 0 });
    }
    for (const version of ['22.12.0', '24.19.0', '22.12.0']) {
      const result = await run(
        mise!,
        ['exec', `node@${version}`, '--', entry, 'run', 'runtime', '--', 'mise-switch'],
        f.C,
        { ...env(), MISE_NODE_COREPACK: 'false' },
      );
      expect(result, result.stderr).toMatchObject({ code: 23 });
      expect(JSON.parse(result.stdout.split(/\r?\n/)[0]!).node).toBe('v' + version);
    }
  });
});
