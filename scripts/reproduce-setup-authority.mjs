// Safety regression driver, also used by the Windows integration suite. Uses
// only a fresh disposable project and retains evidence without deleting its parent.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, lstat, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';

async function publisher(root, lifecycleUrl) {
  const { createRequire, syncBuiltinESMExports } = await import('node:module');
  const { writeFileSync, lstatSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { promisify } = await import('node:util');
  const cp = createRequire(lifecycleUrl)('node:child_process');
  const original = cp.execFile;
  let injected = false;
  cp.execFile = function (...parameters) {
    const [file, args, options, callback] = parameters;
    if (
      !injected &&
      'string' === typeof file &&
      Array.isArray(args) &&
      'string' === typeof args[1] &&
      'function' === typeof callback &&
      file.endsWith('arch-publication-v1.exe') &&
      args[1].endsWith('bootstrap.json')
    ) {
      injected = true;
      const writer = cp.spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import {readFile,writeFile,lstat} from 'node:fs/promises';
          await writeFile(process.argv[2],await readFile(process.argv[1]),{flag:'wx'});
          const s=await lstat(process.argv[2],{bigint:true});
          console.log(JSON.stringify({dev:String(s.dev),ino:String(s.ino)}));`,
          ...args,
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 10000 },
      );
      if (0 !== writer.status) {
        throw new Error(`Independent writer failed: ${writer.stderr}`, { cause: writer.error });
      }
      return original(file, args, options, (error, stdout, stderr) => {
        if (1 !== error?.code || 183 !== JSON.parse(stdout).win32) {
          callback(error, stdout, stderr);
          return;
        }
        const stage = lstatSync(args[0], { bigint: true });
        writeFileSync(
          join(root, 'publication-proof.json'),
          JSON.stringify({
            writer: JSON.parse(writer.stdout),
            nativeExit: error.code,
            nativeStdout: stdout,
            nativeStderr: stderr,
            stage: { path: args[0], dev: String(stage.dev), ino: String(stage.ino) },
          }),
          { flag: 'wx' },
        );
        // The real helper has closed after a real collision. Withhold its reply
        // until the parent physically terminates this publisher at the IPC barrier.
        process.once('message', () => {
          throw new Error('Publisher must be terminated, not resumed');
        });
        process.send('collision-before-response');
      });
    }
    return original.apply(this, parameters);
  };
  const custom = Object.getOwnPropertyDescriptor(original, promisify.custom);
  if (custom) {
    Object.defineProperty(cp.execFile, promisify.custom, custom);
  }
  syncBuiltinESMExports();
  const { setup } = await import(lifecycleUrl);
  await setup(root, ['tool']);
  throw new Error('Publisher unexpectedly completed instead of awaiting the withheld reply');
}

async function interruptPublisher(root, lifecycleUrl) {
  const source = `(${publisher.toString()})(${JSON.stringify(root)},${JSON.stringify(lifecycleUrl)})
    .catch(error=>{console.error(error);process.exitCode=2;});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', (bytes) => {
    stderr = (stderr + bytes.toString()).slice(-4096);
  });
  const closed = new Promise((done, fail) => {
    child.once('error', fail);
    child.once('close', (code, signal) => {
      done({ code, signal });
    });
  });
  let timer;
  let primaryFailure, publisherExit;
  try {
    await Promise.race([
      new Promise((done, fail) => {
        timer = setTimeout(() => {
          fail(new Error(`Publisher checkpoint deadline exceeded: ${stderr}`));
        }, 30000);
        child.once('message', (message) => {
          if ('collision-before-response' === message) {
            done();
          } else {
            fail(new Error('Unexpected publisher checkpoint', { cause: message }));
          }
        });
      }),
      closed.then(() => {
        throw new Error(`Publisher closed before checkpoint: ${stderr}`);
      }),
    ]);
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    clearTimeout(timer);
    child.kill('SIGKILL');
    try {
      publisherExit = await Promise.race([
        closed,
        new Promise((_done, fail) => {
          timer = setTimeout(() => {
            fail(new Error('Owned publisher did not close after termination'));
          }, 3000);
        }),
      ]);
    } catch (cleanupError) {
      if (primaryFailure) {
        throw new AggregateError([primaryFailure, cleanupError], 'Publisher and teardown failed', {
          cause: primaryFailure,
        });
      }
      throw cleanupError;
    } finally {
      clearTimeout(timer);
    }
  }
  if ('SIGKILL' !== publisherExit.signal) {
    throw new Error('Publisher was not physically terminated at the checkpoint', {
      cause: publisherExit,
    });
  }
  return publisherExit;
}

async function main() {
  if ('win32' !== process.platform || 'x64' !== process.arch) {
    throw new Error('NOT TESTED: this reproducer requires Windows x64 and the built helper');
  }
  const parent = await realpath(process.env.ARCH_PUBLICATION_TEST_ROOT ?? tmpdir());
  const root = await mkdtemp(join(parent, 'arch-setup-authority-'));
  console.error(`Retaining uniquely owned reproducer directory: ${root}`);
  const lifecycleUrl = new URL('../dist/lifecycle.js', import.meta.url).href;
  const publisherExit = await interruptPublisher(root, lifecycleUrl);
  // This process has never had the fault hook. All authority decisions below
  // use the original production implementation, after publisher termination.
  const lifecycle = await import(lifecycleUrl);
  const proof = JSON.parse(await readFile(join(root, 'publication-proof.json'), 'utf8'));
  const bootstrap = join(root, '.arch/bootstrap.json');
  const foreign = await lstat(bootstrap, { bigint: true });
  const originalBytes = await readFile(bootstrap);
  if (
    String(foreign.dev) !== proof.writer.dev ||
    String(foreign.ino) !== proof.writer.ino ||
    (String(foreign.dev) === proof.stage.dev && String(foreign.ino) === proof.stage.ino) ||
    !originalBytes.equals(await readFile(proof.stage.path))
  ) {
    throw new Error('Reproducer did not preserve the independent foreign file identity');
  }
  const managed = new Map();
  for (const path of Object.keys(JSON.parse(originalBytes).files)) {
    managed.set(path, await readFile(join(root, path)));
  }
  const status = await lifecycle.inspectInstallation(root, {});
  let repeatedSetupAccepted = false,
    repeatError,
    routingError,
    deinitError;
  let routingAccepted = false;
  try {
    await lifecycle.setup(root, ['tool']);
    repeatedSetupAccepted = true;
  } catch (error) {
    repeatError = inspect(error, { depth: 4 });
  }
  try {
    await lifecycle.reconcileRoutes(root, ['tool', 'other']);
    routingAccepted = true;
  } catch (error) {
    routingError = inspect(error, { depth: 4 });
  }
  try {
    await lifecycle.deinitialize(root);
  } catch (error) {
    deinitError = inspect(error, { depth: 4 });
  }
  let foreignBootstrapRemoved = false;
  let foreignBootstrapChanged = false;
  try {
    const final = await lstat(bootstrap, { bigint: true });
    foreignBootstrapChanged =
      !originalBytes.equals(await readFile(bootstrap)) ||
      ['dev', 'ino', 'mode', 'uid', 'gid', 'birthtimeNs', 'mtimeNs', 'ctimeNs'].some(
        (field) => final[field] !== foreign[field],
      );
  } catch (error) {
    if ('ENOENT' !== error.code) {
      throw error;
    }
    foreignBootstrapRemoved = true;
  }
  let managedResourcesPreserved = true;
  for (const [path, bytes] of managed) {
    try {
      if (!bytes.equals(await readFile(join(root, path)))) {
        managedResourcesPreserved = false;
      }
    } catch (error) {
      if ('ENOENT' !== error.code) {
        throw error;
      }
      managedResourcesPreserved = false;
    }
  }
  const failed =
    'initialized' === status.state ||
    repeatedSetupAccepted ||
    routingAccepted ||
    !managedResourcesPreserved ||
    foreignBootstrapRemoved ||
    foreignBootstrapChanged;
  const result = {
    result: failed ? 'FAIL: bootstrap authority contract' : 'PASS',
    commit: process.env.GITHUB_SHA ?? 'NOT_RECORDED',
    node: process.version,
    publisherExit,
    root,
    status: status.state,
    integrity: status.integrity,
    repeatedSetupAccepted,
    routingAccepted,
    managedResourcesPreserved,
    foreignBootstrapRemoved,
    foreignBootstrapChanged,
    repeatError,
    routingError,
    deinitError,
    proof,
  };
  await writeFile(join(root, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = failed ? 1 : 0;
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 2;
}
