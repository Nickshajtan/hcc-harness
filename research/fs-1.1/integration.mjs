// Packaging feasibility: a copied helper runs from NTFS against an exFAT consumer.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { mkdtemp, copyFile, writeFile, readFile, access, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const execute = promisify(execFile);
assert.equal(process.argv.length, 5, 'binary, NTFS parent and exFAT parent required');
const [binary, ntfsParent, exfatParent] = process.argv.slice(2).map((path) => resolve(path));
const installed = await mkdtemp(join(ntfsParent, 'arch-fs11-helper-'));
const consumer = await mkdtemp(join(exfatParent, 'arch-fs11-consumer-'));
const helper = join(installed, 'publication-helper.exe');
const records = [];
try {
  await copyFile(binary, helper);
  for (const method of ['move', 'handle']) {
    const latencies = [];
    for (let index = 0; 20 > index; index++) {
      const stage = join(consumer, `stage-${method}-${index}`);
      const target = `${stage}.json`;
      await writeFile(stage, '{"complete":true}\n', { flag: 'wx' });
      const started = performance.now();
      const result = await execute(helper, [method, stage, target, '--immediate'], {
        cwd: consumer,
        windowsHide: true,
        timeout: 5000,
      });
      latencies.push(performance.now() - started);
      assert.equal(JSON.parse(result.stdout).error, 0);
      assert.equal(await readFile(target, 'utf8'), '{"complete":true}\n');
      await assert.rejects(access(stage), { code: 'ENOENT' });
    }
    latencies.sort((a, b) => a - b);
    const stage = join(installed, `${method}.stage`);
    const target = join(consumer, `${method}.cross-volume`);
    await writeFile(stage, 'same-volume-only');
    let original;
    try {
      await execute(helper, [method, stage, target, '--immediate'], {
        windowsHide: true,
        timeout: 5000,
      });
      assert.fail('Cross-volume publication unexpectedly succeeded');
    } catch (error) {
      assert.equal(error.code, 1);
      original = JSON.parse(error.stdout);
      assert.equal(original.error, 17);
    }
    assert.equal(await readFile(stage, 'utf8'), 'same-volume-only');
    await assert.rejects(access(target), { code: 'ENOENT' });
    records.push({
      method,
      calls: 20,
      medianMs: latencies[10],
      maxMs: latencies[19],
      crossVolume: original,
    });
  }
  console.log(JSON.stringify({ records }, null, 2));
  assert.ok(installed.startsWith(join(ntfsParent, 'arch-fs11-helper-')));
  assert.ok(consumer.startsWith(join(exfatParent, 'arch-fs11-consumer-')));
  await rm(consumer, { recursive: true });
  await rm(installed, { recursive: true });
} catch (error) {
  console.error('FAILED; retaining owned helper and consumer:', installed, consumer, error);
  process.exitCode = 1;
}
