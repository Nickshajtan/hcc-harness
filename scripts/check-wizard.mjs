import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
  chmod,
  access,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, delimiter } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { pathToFileURL } from 'node:url';
import * as pty from 'node-pty';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Standalone rather than a Vitest worker: node-pty's native bindings are not
// thread-safe. All sessions below run serially in this process, without a shell.
const evidence = resolve('.test-state/wizard');
const temporary = await realpath(tmpdir());
const sandbox = await realpath(await mkdtemp(join(temporary, 'arch-wizard-ci-')));
const project = join(sandbox, 'project'),
  native = join(sandbox, 'native');
const prefix = join(sandbox, 'npm-prefix');
const linkedCli = join(prefix, 'win32' === process.platform ? 'arch.cmd' : 'bin/arch');
const npmEnv = {
  ...process.env,
  npm_config_prefix: prefix,
  npm_config_cache: join(sandbox, 'npm-cache'),
  npm_config_userconfig: join(sandbox, 'npmrc'),
  npm_config_globalconfig: join(sandbox, 'global-npmrc'),
  npm_config_offline: 'true',
  npm_config_ignore_scripts: 'true',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
};
const { inspectInstallation } = await import(pathToFileURL(resolve('dist/lifecycle.js')).href);
const results = [],
  sessions = [];
const ptyPreparation = [];
const env = {};
for (const name of ['SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP', 'TMPDIR', 'LANG']) {
  if (process.env[name]) {
    env[name] = process.env[name];
  }
}
Object.assign(env, {
  HOME: join(sandbox, 'home'),
  USERPROFILE: join(sandbox, 'home'),
  PATH: [native, dirname(process.execPath)].join(delimiter),
  TERM: 'xterm-256color',
  NO_COLOR: '1',
});

function terminal(label, args, command = process.execPath) {
  const child = pty.spawn(command, args, {
    name: 'xterm-256color',
    cols: 240,
    rows: 60,
    cwd: project,
    env,
  });
  let raw = '',
    cursor = 0,
    exit;
  const changed = new Set();
  const text = () => stripVTControlCharacters(raw).replaceAll('\r', '');
  const signal = () => {
    for (const notify of changed) {
      notify();
    }
  };
  const data = child.onData((value) => {
    raw += value;
    signal();
  });
  let done;
  const closed = new Promise((resolve) => {
    done = resolve;
  });
  const ended = child.onExit((value) => {
    exit = value;
    signal();
    done(value);
  });
  const session = {
    label,
    text,
    child,
    closed,
    async expect(needle) {
      await new Promise((accept, reject) => {
        const timer = setTimeout(
          () => finish(new Error(`Timed out waiting for ${JSON.stringify(needle)} in ${label}`)),
          15000,
        );
        function finish(error) {
          clearTimeout(timer);
          changed.delete(check);
          if (error) {
            reject(error);
          } else {
            accept();
          }
        }
        function check() {
          const at = text().indexOf(needle, cursor);
          if (0 <= at) {
            cursor = at + needle.length;
            finish();
          } else if (exit) {
            finish(
              new Error(
                `${label} exited before ${JSON.stringify(needle)}: ${JSON.stringify(exit)}`,
              ),
            );
          }
        }
        changed.add(check);
        check();
      });
    },
    answer(value) {
      child.write(value + '\r');
    },
    async finish(expected = 0) {
      let timer;
      try {
        const result = await Promise.race([
          closed,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Exit timeout: ${label}`)), 15000);
          }),
        ]);
        assert.equal(
          result.exitCode,
          expected,
          `${label} exit: ${JSON.stringify(result)}\n${text()}`,
        );
      } finally {
        clearTimeout(timer);
      }
    },
    async dispose() {
      if (!exit) {
        child.kill();
        let timer;
        try {
          await Promise.race([
            closed,
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error(`PTY cleanup timeout: ${label}`)), 10000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
      data.dispose();
      ended.dispose();
    },
  };
  sessions.push(session);
  return session;
}
const wizard = (label, operation) =>
  'win32' === process.platform
    ? terminal(label, `/d /s /c ""${linkedCli}" ${operation}"`, process.env.ComSpec)
    : terminal(label, [operation], linkedCli);
async function snapshot(root = project) {
  const entries = [];
  async function walk(directory, prefix = '') {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) {
        entries.push([relative + '/', 'directory']);
        await walk(join(directory, entry.name), relative + '/');
      } else {
        assert.ok(entry.isFile(), `Unexpected non-file: ${relative}`);
        entries.push([
          relative,
          createHash('sha256')
            .update(await readFile(join(directory, entry.name)))
            .digest('hex'),
        ]);
      }
    }
  }
  await walk(root);
  return entries;
}
async function check(name, action) {
  try {
    await action();
    results.push({ name, result: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, result: 'FAIL', error: error.stack ?? String(error) });
    throw error;
  }
}
async function state(expected, routes) {
  const status = await inspectInstallation(project, env);
  assert.equal(status.state, expected);
  if (routes) {
    assert.deepEqual(status.routes, routes);
  }
}

let failure;
try {
  assert.ok(
    process.env.npm_execpath,
    'Run through npm run test:wizard or npm run test:wizard:terminal',
  );
  await promisify(execFile)(process.execPath, [process.env.npm_execpath, 'link'], { env: npmEnv });
  if ('darwin' === process.platform) {
    const packageRoot = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
    // node-pty 1.1's packaged Darwin helper can lack its executable bit. Repair
    // only known files within this pinned development dependency, not PATH tools.
    for (const relative of [
      'build/Release/spawn-helper',
      'build/Debug/spawn-helper',
      `prebuilds/darwin-${process.arch}/spawn-helper`,
    ]) {
      const helper = join(packageRoot, relative);
      try {
        await access(helper, constants.F_OK);
      } catch (error) {
        if ('ENOENT' === error.code) {
          continue;
        }
        throw error;
      }
      let restored = false;
      try {
        await access(helper, constants.X_OK);
      } catch (error) {
        if ('EACCES' !== error.code) {
          throw error;
        }
        await chmod(helper, 0o755);
        restored = true;
      }
      ptyPreparation.push({ helper: `node-pty/${relative}`, executableBitRestored: restored });
      if (restored) {
        console.log(`Restored execute permission: node-pty/${relative}`);
      }
    }
  }
  await Promise.all([project, native, env.HOME].map((path) => mkdir(path)));
  for (const command of ['claude', 'codex']) {
    const path = join(native, command + ('win32' === process.platform ? '.exe' : ''));
    // Presence-only fixtures: these are intentionally not executable programs.
    await writeFile(path, 'discovery fixture; must never execute\n');
    await chmod(path, 0o755);
  }
  const nativeBefore = await snapshot(native);
  await check('real stdin and stdout are TTYs', async () => {
    const session = terminal('tty-probe', [
      '-e',
      'console.log(JSON.stringify({stdin:process.stdin.isTTY,stdout:process.stdout.isTTY}))',
    ]);
    await session.expect('{"stdin":true,"stdout":true}');
    await session.finish();
  });
  for (const [label, input, code] of [
    ['selection-cancel', 'cancel', 0],
    ['selection-eof', '\x04', 0],
    ['selection-interrupt', '\x03', 130],
  ]) {
    await check(`${label} leaves project unchanged`, async () => {
      const before = await snapshot(),
        session = wizard(label, 'init');
      await session.expect('Routed commands:');
      if (130 === code || 'selection-eof' === label) {
        session.child.write(input);
      } else {
        session.answer(input);
      }
      await session.finish(code);
      assert.deepEqual(await snapshot(), before);
    });
  }
  await check('installed defaults and final-summary cancellation', async () => {
    const before = await snapshot(),
      session = wizard('summary-cancel', 'init');
    await session.expect('Default: claude, codex');
    await session.expect('Routed commands:');
    session.answer('');
    await session.expect('Desired routes: claude, codex');
    await session.expect('Proceed?');
    session.answer('n');
    await session.finish();
    assert.deepEqual(await snapshot(), before);
  });
  await check(
    'custom init rejects reserved/duplicate names and confirms installation',
    async () => {
      const session = wizard('custom-init', 'init');
      await session.expect('Routed commands:');
      session.answer('node');
      await session.expect('reserved');
      await session.expect('Routed commands:');
      session.answer('mytool mytool');
      await session.expect('unique executable names');
      await session.expect('Routed commands:');
      session.answer('mytool');
      await session.expect('Desired routes: mytool');
      await session.expect('Proceed?');
      session.answer('yes');
      await session.expect('Shell activation has not been verified');
      await session.finish();
      await state('initialized', ['mytool']);
    },
  );
  const harness = join(project, '.arch/harness.toml'),
    config = 'schema=1\n# wizard test user configuration\nmiddleware=[]\n';
  await writeFile(harness, config);
  await check('configuration inspection is read-only', async () => {
    const before = await snapshot(),
      session = wizard('configure-inspect', 'configure');
    await session.expect('Action [1-4]:');
    session.answer('2');
    await session.expect('"state": "initialized"');
    await session.finish();
    assert.deepEqual(await snapshot(), before);
  });
  await check('configuration menu cancellation is read-only', async () => {
    const before = await snapshot(),
      session = wizard('configure-cancel', 'configure');
    await session.expect('Action [1-4]:');
    session.answer('4');
    await session.finish();
    assert.deepEqual(await snapshot(), before);
  });
  await check('configuration updates routes and preserves middleware', async () => {
    const session = wizard('configure-update', 'configure');
    await session.expect('Action [1-4]:');
    session.answer('1');
    await session.expect('Default: mytool');
    await session.expect('Routed commands:');
    session.answer('mytool another');
    await session.expect('Desired routes: mytool, another');
    await session.expect('Proceed?');
    session.answer('yes');
    await session.finish();
    await state('initialized', ['mytool', 'another']);
    assert.equal(await readFile(harness, 'utf8'), config);
  });
  await check('deinit defaults to No without mutation', async () => {
    const before = await snapshot(),
      session = wizard('deinit-default-no', 'deinit');
    await session.expect('Managed resources:');
    await session.expect('[y/N]');
    session.answer('');
    await session.finish();
    assert.deepEqual(await snapshot(), before);
  });
  await check('configuration removal cancellation is read-only', async () => {
    const before = await snapshot(),
      session = wizard('configure-deinit-cancel', 'configure');
    await session.expect('Action [1-4]:');
    session.answer('3');
    await session.expect('[y/N]');
    session.answer('n');
    await session.finish();
    assert.deepEqual(await snapshot(), before);
  });
  await check('confirmed deinit removes routing and preserves user configuration', async () => {
    const session = wizard('deinit-confirmed', 'deinit');
    await session.expect('[y/N]');
    session.answer('yes');
    await session.expect('Refresh the shell prompt');
    await session.finish();
    await state('uninitialized');
    assert.equal(await readFile(harness, 'utf8'), config);
  });
  await check('configuration menu can confirm removal after reinitialization', async () => {
    const init = wizard('reinitialize', 'init');
    await init.expect('Routed commands:');
    init.answer('mytool');
    await init.expect('Proceed?');
    init.answer('yes');
    await init.finish();
    const session = wizard('configure-deinit-confirmed', 'configure');
    await session.expect('Action [1-4]:');
    session.answer('3');
    await session.expect('[y/N]');
    session.answer('yes');
    await session.finish();
    await state('uninitialized');
    assert.equal(await readFile(harness, 'utf8'), config);
  });
  assert.deepEqual(await snapshot(native), nativeBefore, 'Discovery/native fixtures changed');
} catch (error) {
  failure = error;
  console.error(error.stack ?? error);
} finally {
  for (const session of sessions) {
    try {
      await session.dispose();
    } catch (error) {
      failure ??= error;
      results.push({
        name: `cleanup ${session.label}`,
        result: 'FAIL',
        error: error.stack ?? String(error),
      });
    }
  }
  await mkdir(evidence, { recursive: true });
  const normalize = (text) =>
    text
      .replaceAll(JSON.stringify(sandbox).slice(1, -1), '<sandbox>')
      .replaceAll(sandbox, '<sandbox>');
  for (const session of sessions) {
    await writeFile(join(evidence, `${session.label}.txt`), normalize(session.text()));
  }
  await writeFile(
    join(evidence, 'results.json'),
    JSON.stringify(
      {
        schema: 1,
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        invocation: 'npm-linked arch',
        result: failure ? 'FAIL' : 'PASS',
        ptyPreparation,
        checks: results.map((result) => ({
          ...result,
          ...(result.error ? { error: normalize(result.error) } : {}),
        })),
      },
      null,
      2,
    ) + '\n',
  );
  // Delete only this verified, generated child of the OS temporary directory.
  assert.equal(dirname(sandbox), temporary);
  assert.ok(basename(sandbox).startsWith('arch-wizard-ci-'));
  await rm(sandbox, { recursive: true, force: true });
}
// Every CLI exit has been awaited, all evidence is saved, and scratch files are
// removed. node-pty 1.1 can retain Windows worker handles after child exit; end
// this standalone runner explicitly (its own test suite likewise uses --exit).
await Promise.all(
  [process.stdout, process.stderr].map((stream) => new Promise((done) => stream.write('', done))),
);
process.exit(failure ? 1 : 0);
