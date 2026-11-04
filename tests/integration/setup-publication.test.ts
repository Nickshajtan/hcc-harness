import { afterEach, beforeEach, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectInstallation } from '../../src/lifecycle.js';
import { setup, stateFrom, checkFiles } from '../../src/setup.js';

let root: string;
const children: { child: ChildProcess; closed: Promise<number | null> }[] = [];
beforeEach(async () => {
  root = await mkdtemp(
    join(process.env.ARCH_PUBLICATION_TEST_ROOT ?? tmpdir(), 'arch-setup-publication-'),
  );
});
afterEach(async () => {
  for (const { child, closed } of children.splice(0)) {
    if (null === child.exitCode) {
      child.kill('SIGKILL');
    }
    await closed;
  }
  await rm(root, { recursive: true, force: true });
});

function start(boundary: string, command = 'tool') {
  // Real filesystem calls in an independent Node process. The IPC barrier surrounds
  // the actual syscall; it does not substitute a simulated publication result.
  const source = `
    import { registerHooks } from 'node:module';
    import fs from 'node:fs';
    const boundary = ${JSON.stringify(boundary)};
    const original = fs.promises;
    const exports = Object.keys(original).filter(name => name !== 'default');
    const injected = 'data:text/javascript,' + encodeURIComponent(
      'import fs from "node:fs"; const original = fs.promises; ' +
      'const barrier = async () => { process.send("ready"); await new Promise(resolve => process.once("message", resolve)); }; ' +
      exports.map(name => {
        if (name === 'mkdir' && boundary === 'claim') return 'export async function mkdir(path, options) { await original.mkdir(path, options); if (String(path).endsWith("setup-claim")) await barrier(); }';
        if (name === 'rmdir' && boundary === 'claim-released') return 'export async function rmdir(path, options) { await original.rmdir(path, options); if (String(path).endsWith("setup-claim")) await barrier(); }';
        if (name === 'rmdir' && boundary === 'claim-cleanup') return 'export async function rmdir(path, options) { if (String(path).endsWith("setup-claim")) await barrier(); return original.rmdir(path, options); }';
        if (name === 'link') return 'export async function link(stage, target) {' +
          (boundary === 'first' ? 'if (String(target).endsWith("arch.toml")) await barrier();' : '') +
          (boundary === 'before' ? 'if (String(target).endsWith("bootstrap.json")) await barrier();' : '') +
          'await original.link(stage, target);' +
          (boundary === 'after' ? 'if (String(target).endsWith("bootstrap.json")) await barrier();' : '') + '}';
        if (name === 'writeFile' && boundary === 'partial') return 'export async function writeFile(path, bytes, options) { await original.writeFile(path, "partial", options); await barrier(); }';
        return 'export const ' + name + ' = original.' + name + ';';
      }).join(' ')
    );
    const cp = process.getBuiltinModule('node:child_process');
    const injectedChild = 'data:text/javascript,' + encodeURIComponent(
      'const original = process.getBuiltinModule("node:child_process"); ' +
      'const barrier = async () => { process.send("ready"); await new Promise(resolve => process.once("message", resolve)); }; ' +
      Object.keys(cp).filter(name => name !== 'default').map(name => {
        if (name !== 'execFile') return 'export const ' + name + ' = original.' + name + ';';
        return 'export function execFile(file, args, options, callback) {' +
          'void (async () => {' +
          (boundary === 'late' ? 'if (String(args[1]).endsWith("tool.exe")) { await process.getBuiltinModule("node:fs").promises.writeFile(args[1], "foreign", {flag:"wx"}); process.send("ready"); }' : '') +
          (boundary === 'late-bootstrap' ? 'if (String(args[1]).endsWith("bootstrap.json")) { const fs=process.getBuiltinModule("node:fs").promises; await fs.writeFile(args[1], await fs.readFile(args[0]), {flag:"wx"}); process.send("ready"); }' : '') +
          (boundary === 'first' ? 'if (String(args[1]).endsWith("arch.toml")) await barrier();' : '') +
          (boundary === 'before' ? 'if (String(args[1]).endsWith("bootstrap.json")) await barrier();' : '') +
          'original.execFile(file, args, options, (error, stdout, stderr) => { void (async () => {' +
          (boundary === 'lost' ? 'process.send("ready"); callback(Object.assign(new Error("response lost after real publication"), {killed:true}), "", ""); return;' : '') +
          (boundary === 'after' ? 'if (String(args[1]).endsWith("bootstrap.json")) await barrier();' : '') +
          'callback(error, stdout, stderr); })(); }); })(); }';
      }).join(' ')
    );
    registerHooks({resolve(specifier, context, next) {
      if (specifier === 'node:fs/promises') return {url: injected, shortCircuit: true};
      if (specifier === 'node:child_process') return {url: injectedChild, shortCircuit: true};
      return next(specifier, context);
    }});
    const {setup} = await import(${JSON.stringify(pathToFileURL(resolve('dist/setup.js')).href)});
    try { await setup(${JSON.stringify(root)}, [${JSON.stringify(command)}]); process.exit(0); }
    catch(error) { console.error(error); process.exit(1); }
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr?.on('data', (bytes: Buffer) => {
    stderr += bytes.toString();
  });
  const closed = new Promise<number | null>((resolveClose, reject) => {
    child.once('error', reject);
    child.once('close', resolveClose);
  });
  const ready = new Promise<void>((resolveReady, reject) => {
    child.once('message', () => {
      resolveReady();
    });
    child.once('exit', () => {
      reject(new Error(`Setup exited before barrier: ${stderr}`));
    });
  });
  // A competing invocation can now be rejected by the guard before its barrier.
  void ready.catch(() => undefined);
  children.push({ child, closed });
  return { child, closed, ready };
}

it.skipIf('win32' !== process.platform)(
  'attributes real publications after helper responses are lost, including bootstrap',
  async () => {
    const running = start('lost');
    await running.ready;
    expect(await running.closed).toBe(0);
    expect((await inspectInstallation(root)).state).toBe('initialized');
    const manifest = stateFrom(await readFile(join(root, '.arch/bootstrap.json')));
    await checkFiles(root, manifest.files);
    await setup(root, ['tool']);
  },
);

it.skipIf('win32' !== process.platform).each(['late', 'late-bootstrap'])(
  'rolls back only attributed native publications after a real %s collision',
  async (boundary) => {
    const running = start(boundary);
    await running.ready;
    expect(await running.closed).toBe(1);
    await expect(readFile(join(root, '.config/mise/conf.d/arch.toml'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(join(root, '.arch/bin/.arch-router'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    if ('late' === boundary) {
      expect(await readFile(join(root, '.arch/bin/tool.exe'), 'utf8')).toBe('foreign');
      await expect(readFile(join(root, '.arch/bootstrap.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } else {
      expect(stateFrom(await readFile(join(root, '.arch/bootstrap.json'))).files).toHaveProperty(
        '.arch/bin/tool.exe',
      );
      expect((await inspectInstallation(root)).state).toBe('invalid_state');
    }
  },
);

it.each(['partial', 'before', 'after', 'claim', 'claim-cleanup', 'claim-released'])(
  'inspects real termination at %s bootstrap boundary',
  async (boundary) => {
    const running = start(boundary);
    await running.ready;
    running.child.kill('SIGKILL');
    await running.closed;
    const status = await inspectInstallation(root);
    if ('claim-released' === boundary) {
      expect(status.state).toBe('initialized');
      const manifest = stateFrom(await readFile(join(root, '.arch/bootstrap.json')));
      await checkFiles(root, manifest.files);
      await setup(root, ['tool']);
      return;
    }
    if ('after' === boundary || 'claim-cleanup' === boundary) {
      expect(status.state).toBe('invalid_state');
      const manifest = stateFrom(await readFile(join(root, '.arch/bootstrap.json')));
      await checkFiles(root, manifest.files);
      await expect(setup(root, ['tool'])).rejects.toThrow('Unresolved setup claim');
    } else {
      expect(status.state).toBe('invalid_state');
      await expect(readFile(join(root, '.arch/bootstrap.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      if ('before' === boundary) {
        const before = await readFile(join(root, '.config/mise/conf.d/arch.toml'));
        await expect(setup(root, ['tool'])).rejects.toThrow('Unresolved setup claim');
        expect(await readFile(join(root, '.config/mise/conf.d/arch.toml'))).toEqual(before);
      } else {
        await expect(readFile(join(root, '.config/mise/conf.d/arch.toml'))).rejects.toMatchObject({
          code: 'ENOENT',
        });
      }
    }
    const directory = (await readdir(join(root, '.arch'))).find((name) =>
      name.startsWith('.setup-'),
    );
    if ('claim' === boundary || 'claim-cleanup' === boundary) {
      expect(directory).toBeUndefined();
      await expect(setup(root, ['tool'])).rejects.toThrow('Unresolved setup claim');
      return;
    }
    expect(directory).toBeDefined();
    if (directory === undefined) {
      throw new Error('Expected retained stages');
    }
    if ('partial' === boundary) {
      expect(await readFile(join(root, '.arch', directory, '0'), 'utf8')).toBe('partial');
    }
    if ('before' === boundary) {
      const names = await readdir(join(root, '.arch', directory));
      const privateManifest = stateFrom(
        await readFile(
          join(root, '.arch', directory, names.sort((a, b) => Number(a) - Number(b)).at(-1)!),
        ),
      );
      await checkFiles(root, privateManifest.files);
    }
  },
);

it.each(['tool', 'other'])(
  'allows one independent competing setup owner with second route %s',
  async (command) => {
    const first = start('first');
    await first.ready;
    const second = start('first', command);
    expect(await second.closed).toBe(1);
    first.child.send('go');
    expect((await Promise.all([first.closed, second.closed])).sort()).toEqual([0, 1]);
    expect((await inspectInstallation(root)).state).toBe('initialized');
    const manifest = stateFrom(await readFile(join(root, '.arch/bootstrap.json')));
    await checkFiles(root, manifest.files);
  },
);
