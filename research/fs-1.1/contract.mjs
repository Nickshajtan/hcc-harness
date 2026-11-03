// Standalone real-process contract suite; intentionally imports no Arch code.
import assert from 'node:assert/strict';
import { spawn, fork, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, stat, access, rm, copyFile, mkdir } from 'node:fs/promises';
import { openSync, writeSync, closeSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const children = new Map();
if ('writer' === process.argv[2]) {
  process.send('ready');
  process.once('message', () => {
    try {
      const file = openSync(process.argv[3], 'wx');
      writeSync(file, 'external-writer');
      closeSync(file);
      process.send({ error: 0 });
    } catch (error) {
      process.send({ error: error.code });
    }
    process.disconnect();
  });
} else if ('reader' === process.argv[2]) {
  const expected = readFileSync(process.argv[4]);
  let reads = 0;
  process.send('ready');
  process.on('message', () => {
    process.send({ reads });
    process.disconnect();
    process.exit(0);
  });
  function inspect() {
    try {
      assert.ok(readFileSync(process.argv[3]).equals(expected));
      reads++;
      if (1 === reads) {
        process.send('observed');
      }
    } catch (error) {
      if ('ENOENT' !== error.code) {
        process.send({ failure: error.message });
        process.exit(1);
      }
    }
    setImmediate(inspect);
  }
  inspect();
} else {
  await run();
}

function native(helper, args) {
  const child = spawn(helper, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const lines = createInterface({ input: child.stdout });
  const pending = [];
  const queue = [];
  lines.on('line', (line) => {
    const waiter = pending.shift();
    if (waiter) {
      waiter(line);
    } else {
      queue.push(line);
    }
  });
  const closed = once(child, 'close');
  children.set(child, closed);
  const deadline = setTimeout(() => child.kill(), 15000);
  child.once('close', () => {
    clearTimeout(deadline);
    children.delete(child);
  });
  let stderr = '';
  child.stderr.on('data', (part) => {
    stderr += part;
  });
  child.on('error', (error) => {
    stderr += error.message;
  });
  return {
    child,
    closed,
    line: () =>
      queue.length
        ? Promise.resolve(queue.shift())
        : Promise.race([
            new Promise((done) => pending.push(done)),
            closed.then(() => {
              throw new Error(`Helper closed before checkpoint: ${stderr}`);
            }),
          ]),
    stderr: () => stderr,
  };
}
async function finish(operation, terminate = false) {
  if (terminate) {
    assert.equal(operation.child.exitCode, null, 'must terminate a live process');
    operation.child.kill();
  } else {
    operation.child.stdin.end('\n');
  }
  return operation.closed;
}
async function start(helper, method, stage, target) {
  const operation = native(helper, [method, stage, target]);
  assert.equal(await operation.line(), 'ready');
  return operation;
}
async function publish(helper, method, stage, target) {
  const operation = await start(helper, method, stage, target);
  operation.child.stdin.write('g');
  const result = JSON.parse(await operation.line());
  await finish(operation);
  return result;
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ('ENOENT' !== error.code) {
      throw error;
    }
    return false;
  }
}
async function identity(path) {
  const value = await stat(path, { bigint: true });
  return [value.dev, value.ino, value.birthtimeNs, value.mode].map(String);
}
async function run() {
  const [helperArg, parentArg, label] = process.argv.slice(2);
  assert.ok(
    helperArg && parentArg && label,
    'helper, existing disposable parent, filesystem label required',
  );
  const helper = resolve(helperArg);
  const parent = resolve(parentArg);
  const root = await mkdtemp(join(parent, 'arch-fs11-'));
  const records = [];
  let index = 0;
  const fixture = async () => {
    const directory = join(root, `case ${index++} Україна`);
    await mkdir(directory);
    return { stage: join(directory, 'prepared.stage'), target: join(directory, 'final.json') };
  };
  const record = (method, test, details = {}) => records.push({ method, test, ...details });
  try {
    for (const method of 'win32' === process.platform ? ['move', 'handle'] : ['native']) {
      for (const extension of ['json', 'shim', 'exe']) {
        const files = await fixture();
        files.target += `.${extension}`;
        let bytes = Buffer.from('{"complete":true}\n');
        if ('exe' === extension) {
          bytes = await readFile(helper);
        } else if ('shim' === extension) {
          bytes = Buffer.from(`path = ${helper}\nargs = --version\n`);
        }
        await writeFile(files.stage, bytes, { flag: 'wx' });
        assert.equal((await publish(helper, method, files.stage, files.target)).error, 0);
        assert.ok((await readFile(files.target)).equals(bytes));
        assert.equal(await exists(files.stage), false);
        if ('exe' === extension && 'win32' === process.platform) {
          assert.equal(
            execFileSync(files.target, ['--version'], {
              encoding: 'utf8',
              windowsHide: true,
              timeout: 5000,
            }).trim(),
            'fs-1.1-prototype',
          );
        }
        const before = await identity(files.target);
        await writeFile(files.stage, 'foreign replacement attempt', { flag: 'wx' });
        const collision = await publish(helper, method, files.stage, files.target);
        assert.notEqual(collision.error, 0);
        assert.deepEqual(await identity(files.target), before);
        assert.ok((await readFile(files.target)).equals(bytes));
        assert.equal(await readFile(files.stage, 'utf8'), 'foreign replacement attempt');
        record(method, `publish-and-collision-${extension}`, collision);
      }
      for (const identical of [false, true]) {
        for (let repeat = 0; 12 > repeat; repeat++) {
          const { stage, target } = await fixture();
          const second = `${stage}.second`;
          await writeFile(stage, 'first');
          await writeFile(second, identical ? 'first' : 'second');
          const operations = await Promise.all([
            start(helper, method, stage, target),
            start(helper, method, second, target),
          ]);
          const results = operations.map((operation) => operation.line());
          operations.forEach((operation) => operation.child.stdin.write('g'));
          const values = (await Promise.all(results)).map(JSON.parse);
          await Promise.all(operations.map((operation) => finish(operation)));
          assert.equal(values.filter((value) => 0 === value.error).length, 1);
          const winner = 0 === values[0].error ? 0 : 1;
          assert.equal(
            await readFile(target, 'utf8'),
            0 === winner || identical ? 'first' : 'second',
          );
          assert.equal(await exists(stage), 1 === winner);
          assert.equal(await exists(second), 0 === winner);
          record(method, identical ? 'identical-race' : 'conflicting-race', {
            errors: values.map((value) => value.error),
          });
        }
      }
      for (let repeat = 0; 12 > repeat; repeat++) {
        const { stage, target } = await fixture();
        await writeFile(stage, 'prepared');
        const operation = await start(helper, method, stage, target);
        const writer = fork(self, ['writer', target], {
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
          windowsHide: true,
        });
        const closed = once(writer, 'close');
        children.set(writer, closed);
        writer.once('close', () => children.delete(writer));
        assert.equal((await once(writer, 'message'))[0], 'ready');
        const written = once(writer, 'message');
        const published = operation.line();
        writer.send('go');
        operation.child.stdin.write('g');
        const external = (await written)[0];
        const result = JSON.parse(await published);
        await finish(operation);
        await closed;
        assert.equal(Number(0 === external.error) + Number(0 === result.error), 1);
        assert.equal(
          await readFile(target, 'utf8'),
          0 === external.error ? 'external-writer' : 'prepared',
        );
        assert.equal(await exists(stage), 0 === external.error);
        record(method, 'external-writer-race', { native: result.error, writer: external.error });
      }
      for (const after of [false, true]) {
        const { stage, target } = await fixture();
        await writeFile(stage, 'complete');
        const operation = await start(helper, method, stage, target);
        if (after) {
          operation.child.stdin.write('g');
          assert.equal(JSON.parse(await operation.line()).error, 0);
        }
        await finish(operation, true);
        assert.equal(await exists(stage), !after);
        assert.equal(await exists(target), after);
        assert.equal(await readFile(after ? target : stage, 'utf8'), 'complete');
        record(method, after ? 'terminated-after' : 'terminated-before');
      }
      const missing = await fixture();
      const missingResult = await publish(helper, method, missing.stage, missing.target);
      assert.notEqual(missingResult.error, 0);
      assert.equal(await exists(missing.target), false);
      record(method, 'missing-stage', missingResult);
      const directory = await fixture();
      await writeFile(directory.stage, 'prepared');
      await mkdir(directory.target);
      const directoryResult = await publish(helper, method, directory.stage, directory.target);
      assert.notEqual(directoryResult.error, 0);
      assert.equal((await stat(directory.target)).isDirectory(), true);
      record(method, 'directory-collision', directoryResult);
      if ('win32' === process.platform) {
        const writerFirst = await fixture();
        await writeFile(writerFirst.stage, 'prepared');
        const paused = await start(helper, method, writerFirst.stage, writerFirst.target);
        const writer = fork(self, ['writer', writerFirst.target], {
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
          windowsHide: true,
        });
        const closed = once(writer, 'close');
        children.set(writer, closed);
        writer.once('close', () => children.delete(writer));
        assert.equal((await once(writer, 'message'))[0], 'ready');
        const written = once(writer, 'message');
        writer.send('go');
        assert.equal((await written)[0].error, 0);
        await closed;
        const before = await identity(writerFirst.target);
        paused.child.stdin.write('g');
        const collision = JSON.parse(await paused.line());
        assert.notEqual(collision.error, 0);
        await finish(paused);
        assert.deepEqual(await identity(writerFirst.target), before);
        assert.equal(await readFile(writerFirst.target, 'utf8'), 'external-writer');
        record(method, 'external-writer-before-publication', collision);
        for (const sharing of ['shared', 'locked']) {
          const { stage, target } = await fixture();
          await writeFile(stage, 'complete');
          const holder = native(helper, ['hold', stage, sharing]);
          assert.equal(await holder.line(), 'ready');
          const result = await publish(helper, method, stage, target);
          await finish(holder);
          assert.equal(0 === result.error, 'shared' === sharing);
          assert.equal(await readFile('shared' === sharing ? target : stage, 'utf8'), 'complete');
          record(method, `open-stage-${sharing}`, result);
          const targetFixture = await fixture();
          await writeFile(targetFixture.stage, 'prepared');
          await writeFile(targetFixture.target, 'foreign');
          const before = await identity(targetFixture.target);
          const targetHolder = native(helper, ['hold', targetFixture.target, sharing]);
          assert.equal(await targetHolder.line(), 'ready');
          const targetResult = await publish(
            helper,
            method,
            targetFixture.stage,
            targetFixture.target,
          );
          await finish(targetHolder);
          assert.notEqual(targetResult.error, 0);
          assert.deepEqual(await identity(targetFixture.target), before);
          assert.equal(await readFile(targetFixture.target, 'utf8'), 'foreign');
          record(method, `open-target-${sharing}`, targetResult);
        }
        const { stage, target } = await fixture();
        await copyFile(helper, stage + '.exe');
        await writeFile(stage, 'held bytes');
        const executing = native(stage + '.exe', ['hold', stage, 'shared']);
        assert.equal(await executing.line(), 'ready');
        const result = await publish(helper, method, stage + '.exe', target);
        record(method, 'executing-source', result);
        assert.equal(await exists(stage + '.exe'), 0 !== result.error);
        const runningPath = 0 === result.error ? target : stage + '.exe';
        const runningBefore = await identity(runningPath);
        const replacement = `${stage}.replacement`;
        await writeFile(replacement, 'must not replace running executable');
        const runningCollision = await publish(helper, method, replacement, runningPath);
        assert.notEqual(runningCollision.error, 0);
        assert.deepEqual(await identity(runningPath), runningBefore);
        assert.ok((await readFile(runningPath)).equals(await readFile(helper)));
        await finish(executing);
        record(method, 'executing-target-collision', runningCollision);
      }
      const { stage, target } = await fixture();
      const payload = Buffer.alloc(4 * 1024 * 1024, 0x65);
      await writeFile(stage, payload);
      const expected = `${stage}.expected`;
      await writeFile(expected, payload);
      const reader = fork(self, ['reader', target, expected], {
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        windowsHide: true,
      });
      const closed = once(reader, 'close');
      children.set(reader, closed);
      reader.once('close', () => children.delete(reader));
      assert.equal((await once(reader, 'message'))[0], 'ready');
      const observed = once(reader, 'message');
      assert.equal((await publish(helper, method, stage, target)).error, 0);
      assert.equal((await observed)[0], 'observed');
      const stopped = once(reader, 'message');
      reader.send('stop');
      const observation = (await stopped)[0];
      assert.equal(observation.failure, undefined);
      assert.ok(0 < observation.reads);
      await closed;
      record(method, 'independent-reader-4MiB', observation);
    }
    console.log(
      JSON.stringify(
        { label, platform: process.platform, arch: process.arch, node: process.version, records },
        null,
        2,
      ),
    );
    assert.ok(root.startsWith(join(parent, 'arch-fs11-')));
    await rm(root, { recursive: true });
  } catch (error) {
    console.error('FAILED; preserving owned fixture:', root, error);
    process.exitCode = 1;
  } finally {
    const outstanding = [...children.entries()];
    outstanding.forEach(([child]) => child.kill());
    await Promise.allSettled(outstanding.map(([, closed]) => closed));
  }
}
