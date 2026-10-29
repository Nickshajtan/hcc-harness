import assert from 'node:assert/strict';
import { copyFile, cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import * as pty from 'node-pty';

// Like the wizard checker, keep node-pty outside Vitest worker threads.
assert.equal(process.platform, 'win32', 'B1 bootstrap PTY check is Windows-only');
assert.ok(
  process.env.ARCH_B1_BOOTSTRAP && process.env.ARCH_B1_NODE20,
  'Provide the compiled prototype and real Node 20',
);
const root = await mkdtemp(join(await realpath(tmpdir()), 'arch-b1-terminal-'));
let term,
  ended = false;
try {
  const app = join(root, 'Arch app'),
    native = join(root, 'native'),
    runtime = join(root, 'project Node');
  await Promise.all([app, native, runtime].map((path) => mkdir(path)));
  await cp(resolve('dist'), join(app, 'dist'), { recursive: true });
  await copyFile(resolve('package.json'), join(app, 'package.json'));
  await symlink(resolve('node_modules'), join(app, 'node_modules'), 'junction');
  await copyFile(process.env.ARCH_B1_BOOTSTRAP, join(app, 'arch-bootstrap.exe'));
  await copyFile(process.env.ARCH_B1_NODE20, join(runtime, 'node.exe'));
  await writeFile(
    join(native, 'terminal.cjs'),
    '#!/usr/bin/env node\nconsole.log(JSON.stringify({stdin:process.stdin.isTTY,stdout:process.stdout.isTTY,stderr:process.stderr.isTTY,node:process.version})); process.stdin.once("data",data=>{console.log("received:"+data.toString().trim());process.exit(9);});\n',
  );
  await writeFile(join(native, 'terminal.cmd'), '@echo off\r\nnode "%~dp0\\terminal.cjs" %*\r\n');
  // Plain JS objects are case-sensitive; Windows environment keys are not.
  // Avoid a second inherited Path overriding this fixture's isolated PATH.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => 'PATH' !== key.toUpperCase()),
  );
  Object.assign(env, { PATH: [native, runtime].join(';'), ARCH_NODE: process.execPath });
  term = pty.spawn(join(app, 'arch-bootstrap.exe'), ['run', 'terminal', '--'], {
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
      () => reject(new Error('B1 terminal bootstrap timeout: ' + output)),
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
  assert.match(text, /"stdin":true,"stdout":true,"stderr":true,"node":"v20\./);
  assert.ok(text.includes('received:terminal-input'), text);
  assert.equal(exitCode, 9);
  await mkdir('.test-state', { recursive: true });
  await writeFile(
    '.test-state/m22-b1-tty.json',
    JSON.stringify(
      { status: 'PASS', archNode: process.version, nativeNode: '20.19.0', exitCode, output: text },
      null,
      2,
    ),
  );
  console.log('PASS B1 real Node 20 terminal handles, keyboard input and exit 9');
} finally {
  if (term && !ended) {
    term.kill();
  }
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
// All child exits and cleanup are awaited. Like check-wizard.mjs, explicitly end
// the standalone runner because node-pty 1.1 retains Windows worker handles.
await Promise.all(
  [process.stdout, process.stderr].map((stream) => new Promise((done) => stream.write('', done))),
);
process.exit(0);
