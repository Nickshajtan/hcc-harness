import { expect, it, onTestFinished } from 'vitest';
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requiredEnvironment, run, start, world } from '../support.js';

// Kill the installer itself at real boundaries. Partial snapshots are retained,
// cannot be executed, and cannot be implicitly overwritten on the next attempt.
it.each(['reserved', 'materialized', 'verified', 'published'])(
  'preserves safe installation state after actual process interruption at %s',
  async (stage) => {
    const f = await world(await realpath(tmpdir()));
    const source = join(f.root, 'source');
    const destination = join(f.root, 'destination');
    try {
      await mkdir(source);
      await mkdir(join(source, 'dist'));
      await mkdir(join(source, 'vendor'));
      await mkdir(join(source, 'runtime'));
      await writeFile(join(source, 'LICENSE'), 'Controlled fixture license');
      await writeFile(
        join(source, 'package.json'),
        '{"name":"controlled-installation-fixture","version":"1.0.0","type":"module","dependencies":{}}',
      );
      await writeFile(
        join(source, 'package-lock.json'),
        '{"name":"controlled-installation-fixture","version":"1.0.0","lockfileVersion":3,"packages":{"":{"name":"controlled-installation-fixture","version":"1.0.0","dependencies":{}}}}',
      );
      await writeFile(join(source, 'dist/cli.js'), 'console.log("controlled fixture");\n');
      for (const name of ['shim-x64.exe', 'shim-arm64.exe']) {
        await copyFile(resolve('vendor', name), join(source, 'vendor', name));
      }
      await copyFile(resolve('runtime/arch'), join(source, 'runtime/arch'));
      if ('win32' === process.platform) {
        await mkdir(join(source, '.tools/stable-bootstrap'), { recursive: true });
        await copyFile(
          resolve('.tools/stable-bootstrap/arch-bootstrap.exe'),
          join(source, '.tools/stable-bootstrap/arch-bootstrap.exe'),
        );
      }
      const driver = join(f.root, 'install-driver.mjs');
      await writeFile(
        driver,
        `import { installStable } from ${JSON.stringify(pathToFileURL(resolve('dist/installation/stable-install.js')).href)};
        await installStable({ source:process.argv[2], destination:process.argv[3], npm:process.argv[4],
          checkpoint:async stage => { if (stage === process.argv[5]) { console.log(stage); await new Promise(() => {setInterval(() => {}, 1000);}); } }
        });`,
      );
      const invocation = start(
        process.execPath,
        [driver, source, destination, requiredEnvironment('npm_execpath'), stage],
        f.root,
        process.env,
      );
      onTestFinished(() => invocation.dispose());
      invocation.child.stdin.end();
      try {
        await Promise.race([
          new Promise<void>((done, reject) => {
            let output = '';
            invocation.child.stdout.on('data', (chunk: Buffer) => {
              output += chunk.toString();
              if (output.includes(stage)) {
                done();
              }
            });
            invocation.child.once('error', reject);
            invocation.child.once('exit', () => {
              reject(new Error('Installer exited before requested barrier'));
            });
          }),
          invocation.result.then((result) => {
            throw new Error(
              `Installer exited before barrier (${String(result.code)}): ${result.stderr.slice(-4000)}`,
            );
          }),
        ]);
        invocation.child.kill('SIGKILL');
        const result = await invocation.result;
        expect(0 === result.code && null === result.signal).toBe(false);
      } finally {
        await invocation.dispose();
      }
      const entry = join(destination, 'win32' === process.platform ? 'arch.exe' : 'arch');
      if ('reserved' !== stage) {
        const result = await run(entry, ['--help'], f.root, {
          ...f.env,
          ARCH_NODE: process.execPath,
        });
        expect(result.code, result.stderr).toBe('published' === stage ? 0 : 1);
        if ('published' !== stage) {
          expect(result.stderr).toContain('Incomplete installation');
        }
      }
      if ('published' === stage) {
        expect(await readFile(join(destination, 'installation.json'), 'utf8')).toContain(
          'arch-stable-installation-v1',
        );
      }
      const { installStable } = await import('../../src/installation/stable-install.js');
      await expect(
        installStable({ source, destination, npm: requiredEnvironment('npm_execpath') }),
      ).rejects.toMatchObject({ code: 'EEXIST' });
    } finally {
      await f.dispose();
    }
  },
);
