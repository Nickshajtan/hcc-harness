import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, lstat, rm, mkdir, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, toNamespacedPath } from 'node:path';
import { publicationHelper, renameNoReplace } from '../../src/lifecycle/native-publication.js';
import { publishExclusive } from '../../src/lifecycle/routing-files.js';
import { digest } from '../../src/lifecycle/manifest.js';
import { start, recordBeforeDisposal } from '../support.js';

const execute = promisify(execFile);
describe.skipIf('win32' !== process.platform || 'x64' !== process.arch)(
  'packaged native publication',
  () => {
    let root: string;
    beforeEach(async () => {
      root = await mkdtemp(
        join(process.env.ARCH_PUBLICATION_TEST_ROOT ?? tmpdir(), 'arch-native-ユニコード spaces-'),
      );
    });
    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it.each(['json', 'shim', 'exe'])(
      'publishes complete %s bytes and consumes the verified stage',
      async (kind) => {
        const bytes =
          'exe' === kind
            ? await readFile(resolve('vendor/shim-x64.exe'))
            : Buffer.from('json' === kind ? '{"complete":true}\n' : 'path = C:\\native.exe\n');
        await mkdir(join(root, 'private'));
        await mkdir(join(root, 'destination'));
        await writeFile(join(root, 'private/stage'), bytes);
        const held = await open(join(root, 'private/stage'), 'r');
        try {
          const result = await publishExclusive(
            root,
            'private/stage',
            'destination/target',
            digest(bytes),
          );
          expect(await readFile(join(root, 'destination/target'))).toEqual(bytes);
          const moved = await held.stat({ bigint: true });
          expect(result).toEqual({ dev: moved.dev, ino: moved.ino });
          expect((await lstat(join(root, 'destination/target'), { bigint: true })).ino).toBe(
            moved.ino,
          );
          await expect(lstat(join(root, 'private/stage'))).rejects.toMatchObject({
            code: 'ENOENT',
          });
        } finally {
          await held.close();
        }
      },
    );
    it.each(['same', 'different', 'directory'])(
      'refuses existing %s target without changing bytes or identity',
      async (kind) => {
        await writeFile(join(root, 'stage'), 'complete');
        if ('directory' === kind) {
          await mkdir(join(root, 'target'));
        } else {
          await writeFile(join(root, 'target'), 'same' === kind ? 'complete' : 'foreign');
        }
        const before = await lstat(join(root, 'target'), { bigint: true });
        await expect(
          renameNoReplace(join(root, 'stage'), join(root, 'target')),
        ).rejects.toMatchObject({ kind: 'collision', outcome: 'not-published', win32: 183 });
        expect(await readFile(join(root, 'stage'), 'utf8')).toBe('complete');
        expect(await lstat(join(root, 'target'), { bigint: true })).toMatchObject({
          dev: before.dev,
          ino: before.ino,
          mode: before.mode,
          uid: before.uid,
          gid: before.gid,
          birthtimeNs: before.birthtimeNs,
          mtimeNs: before.mtimeNs,
          ctimeNs: before.ctimeNs,
        });
        if ('directory' !== kind) {
          expect(await readFile(join(root, 'target'), 'utf8')).toBe(
            'same' === kind ? 'complete' : 'foreign',
          );
        }
      },
    );
    it('retains original missing-source and invalid-input errors', async () => {
      await mkdir(join(root, 'source-directory'));
      await expect(
        renameNoReplace(join(root, 'source-directory'), join(root, 'target')),
      ).rejects.toMatchObject({ kind: 'invalid-input', outcome: 'not-published', win32: 87 });
      await expect(renameNoReplace('relative', join(root, 'target'))).rejects.toMatchObject({
        kind: 'invalid-input',
        outcome: 'not-published',
      });
      await expect(renameNoReplace(join(root, 'stage'), join(root, 'stage'))).rejects.toMatchObject(
        { kind: 'invalid-input', outcome: 'not-published' },
      );
      await expect(
        renameNoReplace(join(root, 'missing'), join(root, 'target')),
      ).rejects.toMatchObject({ kind: 'missing-source', win32: 2 });
      const helper = await publicationHelper();
      await expect(execute(helper, ['relative', 'relative'])).rejects.toMatchObject({
        code: 1,
        stdout: '{"protocol":1,"win32":87}\r\n',
      });
    });
    it.skipIf(!process.env.ARCH_PUBLICATION_OTHER_VOLUME)(
      'refuses a real cross-volume request without copying',
      async () => {
        const other = await mkdtemp(
          join(process.env.ARCH_PUBLICATION_OTHER_VOLUME!, 'arch-native-other-'),
        );
        try {
          await writeFile(join(root, 'stage'), 'complete');
          await expect(
            renameNoReplace(join(root, 'stage'), join(other, 'target')),
          ).rejects.toMatchObject({ kind: 'cross-volume', outcome: 'not-published', win32: 17 });
          expect(await readFile(join(root, 'stage'), 'utf8')).toBe('complete');
          await expect(lstat(join(other, 'target'))).rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
          await rm(other, { recursive: true, force: true });
        }
      },
    );
    it('preserves a source held without delete sharing and its original Win32 error', async () => {
      const holder = join(root, 'holder.exe');
      await execute(
        join(
          process.env.SystemRoot ?? 'C:/Windows',
          'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
        ),
        ['/nologo', `/out:${holder}`, resolve('tests/fixtures/publication-holder.cs')],
      );
      await writeFile(join(root, 'stage'), 'complete');
      const holding = start(holder, [join(root, 'stage')], root, process.env);
      let inputError: Error | undefined;
      const inputFailure = new Promise<never>((_done, fail) => {
        holding.child.stdin.on('error', (error) => {
          inputError = error;
          fail(error);
        });
      });
      async function phase(name: string) {
        const signal = AbortSignal.timeout(15000);
        await Promise.race([
          inputFailure,
          (async () => {
            while (!holding.output().stdout.split(/\r?\n/).includes(name)) {
              await once(holding.child.stdout, 'data', { signal });
            }
          })(),
          holding.result.then((result) => {
            throw new Error(
              `Holder exited before ${name}: ${JSON.stringify({ pid: holding.child.pid, ...result, events: holding.observations() })}`,
            );
          }),
        ]);
      }
      await recordBeforeDisposal({
        record: async () => {
          await phase('ready');
          let assertionFailure: { error: unknown } | undefined;
          try {
            await expect(
              publishExclusive(root, 'stage', 'target', digest('complete')),
            ).rejects.toMatchObject({ kind: 'sharing', win32: 32, outcome: 'not-published' });
            expect(await readFile(join(root, 'stage'), 'utf8')).toBe('complete');
            await expect(lstat(join(root, 'target'))).rejects.toMatchObject({ code: 'ENOENT' });
          } catch (error) {
            assertionFailure = { error };
          }
          try {
            const released = phase('released');
            holding.child.stdin.write('release\n');
            await released;
            await expect(lstat(join(root, 'stage'))).rejects.toMatchObject({ code: 'ENOENT' });
            holding.child.stdin.end('exit\n');
            const result = await holding.result;
            if (inputError) {
              throw inputError;
            }
            expect(result, result.stderr).toMatchObject({ code: 0, signal: null });
          } catch (cleanupError) {
            if (assertionFailure) {
              throw new AggregateError(
                [assertionFailure.error, cleanupError],
                'Publication assertion and holder release failed',
                { cause: assertionFailure.error },
              );
            }
            throw cleanupError;
          }
          if (assertionFailure) {
            throw assertionFailure.error;
          }
        },
        dispose: () => holding.dispose(),
      });
    });
    it('never exposes partial bytes to an independent reader', async () => {
      const bytes = Buffer.alloc(4 * 1024 * 1024, 0x5a);
      await writeFile(join(root, 'stage'), bytes);
      const source = `import {readFile} from 'node:fs/promises';
        const path=process.argv[1];
        setTimeout(()=>{console.error('Publication reader deadline exceeded');process.exit(2);},15000).unref();
        try{await readFile(path);throw new Error('Target already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
        process.send('ready');process.once('message',async()=>{
          for(;;){try{const bytes=await readFile(path);if(bytes.length!==4*1024*1024 || bytes.some(b=>b!==0x5a))throw new Error('Partial target');process.exit(0);}catch(e){if(e.code!=='ENOENT')throw e;}}
        });`;
      const reader = spawn(
        process.execPath,
        ['--input-type=module', '-e', source, join(root, 'target')],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      const closed = new Promise<number | null>((done, fail) => {
        reader.once('error', fail);
        reader.once('close', done);
      });
      try {
        await new Promise<void>((done, fail) => {
          reader.once('message', () => {
            done();
          });
          reader.once('exit', () => {
            fail(new Error('Reader exited before ready'));
          });
        });
        reader.send('go');
        await publishExclusive(root, 'stage', 'target', digest(bytes));
        expect(await closed).toBe(0);
      } finally {
        if (null === reader.exitCode) {
          reader.kill();
        }
        await closed;
      }
    });
    it.each(['identical', 'conflicting', 'external'])(
      'permits exactly one independent %s publisher',
      async (kind) => {
        const helper = await publicationHelper();
        const first = join(root, 'first'),
          second = join(root, 'second'),
          target = join(root, 'target');
        await writeFile(first, 'first');
        await writeFile(second, 'identical' === kind ? 'first' : 'second');
        const source = `
      import {execFile} from 'node:child_process';
      import {writeFile} from 'node:fs/promises';
      process.send('ready');
      process.once('message', async () => {
        if (process.argv[1] === 'external') {
          try {await writeFile(process.argv[4],'external',{flag:'wx'});process.exit(0);}catch(e){if(e.code==='EEXIST')process.exit(1);throw e;}
        }
        execFile(process.argv[2],[process.argv[3],process.argv[4]],(error,stdout)=>{
          const result=JSON.parse(stdout); if(result.protocol!==1 || ![0,183].includes(result.win32))throw new Error(stdout);
          process.exit(error?1:0);
        });
      });`;
        const children = [
          ['native', first],
          ['external' === kind ? 'external' : 'native', second],
        ].map(([mode, stage]) => {
          const child = spawn(
            process.execPath,
            [
              '--input-type=module',
              '-e',
              source,
              mode!,
              helper,
              toNamespacedPath(stage!),
              toNamespacedPath(target),
            ],
            { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
          );
          const closed = new Promise<number | null>((done, fail) => {
            child.once('error', fail);
            child.once('close', done);
          });
          const ready = new Promise<void>((done, fail) => {
            child.once('message', () => {
              done();
            });
            child.once('exit', () => {
              fail(new Error('Publisher exited before barrier'));
            });
          });
          return { child, closed, ready };
        });
        try {
          await Promise.all(children.map((c) => c.ready));
          children.forEach((c) => c.child.send('go'));
          const results = await Promise.all(children.map((c) => c.closed));
          expect([...results].sort()).toEqual([0, 1]);
          let winner = 'first';
          if (0 !== results[0] && 'identical' !== kind) {
            winner = 'external' === kind ? 'external' : 'second';
          }
          expect(await readFile(target, 'utf8')).toBe(winner);
          if (0 === results[0]) {
            await expect(lstat(first)).rejects.toMatchObject({ code: 'ENOENT' });
            expect(await readFile(second, 'utf8')).toBe('identical' === kind ? 'first' : 'second');
          } else {
            expect(await readFile(first, 'utf8')).toBe('first');
            if ('external' !== kind) {
              await expect(lstat(second)).rejects.toMatchObject({ code: 'ENOENT' });
            }
          }
        } finally {
          for (const c of children) {
            if (null === c.child.exitCode) {
              c.child.kill();
            }
            await c.closed;
          }
        }
      },
    );
  },
);
