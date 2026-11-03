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
  root = await mkdtemp(join(tmpdir(), 'arch-setup-publication-'));
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
        if (name === 'link') return 'export async function link(stage, target) {' +
          (boundary === 'first' ? 'if (String(target).endsWith("arch.toml")) await barrier();' : '') +
          (boundary === 'before' ? 'if (String(target).endsWith("bootstrap.json")) await barrier();' : '') +
          'await original.link(stage, target);' +
          (boundary === 'after' ? 'if (String(target).endsWith("bootstrap.json")) await barrier();' : '') + '}';
        if (name === 'writeFile' && boundary === 'partial') return 'export async function writeFile(path, bytes, options) { await original.writeFile(path, "partial", options); await barrier(); }';
        return 'export const ' + name + ' = original.' + name + ';';
      }).join(' ')
    );
    registerHooks({resolve(specifier, context, next) {
      if (specifier === 'node:fs/promises') return {url: injected, shortCircuit: true};
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
  children.push({ child, closed });
  return { child, closed, ready };
}

it.each(['partial', 'before', 'after'])(
  'inspects real termination at %s bootstrap boundary',
  async (boundary) => {
    const running = start(boundary);
    await running.ready;
    running.child.kill('SIGKILL');
    await running.closed;
    const status = await inspectInstallation(root);
    if ('after' === boundary) {
      expect(status.state).toBe('initialized');
      const manifest = stateFrom(await readFile(join(root, '.arch/bootstrap.json')));
      await checkFiles(root, manifest.files);
      await setup(root, ['tool']);
    } else {
      expect(status.state).toBe('uninitialized');
      await expect(readFile(join(root, '.arch/bootstrap.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      if ('before' === boundary) {
        const before = await readFile(join(root, '.config/mise/conf.d/arch.toml'));
        await expect(setup(root, ['tool'])).rejects.toThrow('Refusing to overwrite');
        expect(await readFile(join(root, '.config/mise/conf.d/arch.toml'))).toEqual(before);
      } else {
        await expect(readFile(join(root, '.config/mise/conf.d/arch.toml'))).rejects.toMatchObject({
          code: 'ENOENT',
        });
      }
    }
    expect((await readdir(join(root, '.arch'))).some((name) => name.startsWith('.setup-'))).toBe(
      true,
    );
  },
);

it.each(['tool', 'other'])(
  'allows one independent competing setup owner with second route %s',
  async (command) => {
    const first = start('first');
    const second = start('first', command);
    await Promise.all([first.ready, second.ready]);
    first.child.send('go');
    second.child.send('go');
    expect((await Promise.all([first.closed, second.closed])).sort()).toEqual([0, 1]);
    expect((await inspectInstallation(root)).state).toBe('initialized');
    const manifest = stateFrom(await readFile(join(root, '.arch/bootstrap.json')));
    await checkFiles(root, manifest.files);
  },
);
