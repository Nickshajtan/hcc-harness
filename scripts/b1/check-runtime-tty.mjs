import assert from 'node:assert/strict';
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import * as pty from 'node-pty';
import { createRequire } from 'node:module';

assert.ok(['win32', 'darwin', 'linux'].includes(process.platform), 'Unsupported contract platform');
const windows = 'win32' === process.platform;
if ('darwin' === process.platform) {
  // npm's packaged node-pty helper can lose its executable bit. Match the
  // existing wizard fixture preparation; never suppress a spawn failure.
  const require = createRequire(import.meta.url);
  const directory = resolve(require.resolve('node-pty/package.json'), '..');
  const { access } = await import('node:fs/promises');
  const { constants } = await import('node:fs');
  for (const relative of [
    'build/Release/spawn-helper',
    'build/Debug/spawn-helper',
    `prebuilds/darwin-${process.arch}/spawn-helper`,
  ]) {
    const helper = join(directory, relative);
    try {
      await access(helper);
    } catch (error) {
      if ('ENOENT' === error.code) {
        continue;
      }
      throw error;
    }
    try {
      await access(helper, constants.X_OK);
    } catch (error) {
      if ('EACCES' !== error.code) {
        throw error;
      }
      await chmod(helper, 0o755);
    }
  }
}
assert.ok(process.env.ARCH_B1_NODE22, 'Real Node 22 is mandatory');
if (windows) {
  assert.ok(process.env.ARCH_B1_BOOTSTRAP, 'Compiled bootstrap is mandatory');
}
const root = await mkdtemp(join(await realpath(tmpdir()), 'arch-runtime-terminal-'));
let term,
  ended = false,
  evidence;
try {
  const app = join(root, 'app'),
    native = join(root, 'native'),
    runtime = join(root, 'runtime');
  await Promise.all([app, native, runtime].map((path) => mkdir(path)));
  await cp(resolve('dist'), join(app, 'dist'), { recursive: true });
  await copyFile(resolve('package.json'), join(app, 'package.json'));
  await symlink(resolve('node_modules'), join(app, 'node_modules'), windows ? 'junction' : 'dir');
  const entry = join(app, windows ? 'arch-bootstrap.exe' : 'arch-bootstrap');
  await copyFile(
    windows ? process.env.ARCH_B1_BOOTSTRAP : resolve('scripts/b1/arch-bootstrap.sh'),
    entry,
  );
  const node = join(runtime, windows ? 'node.exe' : 'node');
  await copyFile(process.env.ARCH_B1_NODE22, node);
  if (!windows) {
    await chmod(entry, 0o755);
    await chmod(node, 0o755);
  }
  const script = join(native, 'terminal.cjs');
  await writeFile(
    script,
    '#!/usr/bin/env node\nconsole.log(JSON.stringify({stdin:process.stdin.isTTY,stdout:process.stdout.isTTY,stderr:process.stderr.isTTY,node:process.version}));process.stdin.once("data",data=>{console.log("received:"+data.toString().trim());process.exit(9);});\n',
  );
  if (windows) {
    await writeFile(join(native, 'terminal.cmd'), '@echo off\r\nnode "%~dp0\\terminal.cjs" %*\r\n');
  } else {
    await copyFile(script, join(native, 'terminal'));
    await chmod(join(native, 'terminal'), 0o755);
  }
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => 'PATH' !== key.toUpperCase()),
  );
  Object.assign(env, {
    PATH: [native, runtime, '/usr/bin', '/bin'].join(delimiter),
    ARCH_NODE: process.execPath,
  });
  term = pty.spawn(entry, ['run', 'terminal', '--'], {
    name: 'xterm-color',
    cols: 100,
    rows: 25,
    cwd: root,
    env,
  });
  let output = '',
    sent = false;
  const exitCode = await new Promise((done, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Runtime terminal timeout: ' + output)),
      15_000,
    );
    term.onData((data) => {
      output += data;
      if (!sent && output.includes('"stdin":true')) {
        sent = true;
        term.write('terminal-input\r');
      }
    });
    term.onExit((event) => {
      ended = true;
      clearTimeout(timer);
      done(event.exitCode);
    });
  });
  const text = stripVTControlCharacters(output);
  assert.match(text, /"stdin":true,"stdout":true,"stderr":true,"node":"v22\./);
  assert.ok(text.includes('received:terminal-input'), text);
  assert.equal(exitCode, 9);
  evidence = {
    status: 'PASS',
    platform: process.platform,
    archNode: process.version,
    exitCode,
    output: text,
  };
} catch (error) {
  evidence = { status: 'FAIL', platform: process.platform, error: String(error) };
  throw error;
} finally {
  if (term && !ended) {
    term.kill();
  }
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await mkdir('.test-state', { recursive: true });
  await writeFile('.test-state/m22-runtime-tty.json', JSON.stringify(evidence, null, 2));
}
console.log('PASS runtime TTY, keyboard input, independent Node 22 and native exit 9');
await Promise.all(
  [process.stdout, process.stderr].map((stream) => new Promise((done) => stream.write('', done))),
);
process.exit(0);
