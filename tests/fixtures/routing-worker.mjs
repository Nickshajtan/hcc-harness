// Test driver: IPC acknowledges an actual persisted checkpoint, then pauses until
// the parent terminates this process. Production has no test environment switches.
const [moduleUrl, root, commands, stop] = process.argv.slice(2);
// Test-only filesystem boundaries cover interruption points without adding production checkpoints.
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const pause = async (checkpoint) => {
  process.send({ checkpoint });
  await new Promise((resolve) => process.once('message', resolve));
};
for (const operation of ['link', 'writeFile', 'unlink']) {
  const original = fs[operation];
  fs[operation] = async (...args) => {
    const path = String('link' === operation ? args[1] : args[0]).replaceAll('\\', '/');
    if (
      'fs:before-journal' === stop &&
      'link' === operation &&
      path.endsWith('/.arch/routing.json')
    ) {
      await pause(stop);
    }
    if (
      'fs:partial-stage' === stop &&
      'writeFile' === operation &&
      /\/\.routing-.*-0\.stage$/.test(path)
    ) {
      await original(args[0], Buffer.from(args[1]).subarray(0, 3), args[2]);
      await pause(stop);
    }
    if (
      'fs:before-removals' === stop &&
      'unlink' === operation &&
      /\/codex(?:\.exe)?$/.test(path)
    ) {
      await pause(stop);
    }
    if (
      'fs:stage-cleanup' === stop &&
      'unlink' === operation &&
      /\/\.routing-.*-0\.stage$/.test(path)
    ) {
      await pause(stop);
    }
    const result = await original(...args);
    if (
      'fs:after-journal-removal' === stop &&
      'unlink' === operation &&
      path.endsWith('/.arch/routing.json')
    ) {
      await pause(stop);
    }
    return result;
  };
}
syncBuiltinESMExports();
const { reconcileRoutes } = await import(moduleUrl);
await reconcileRoutes(root, JSON.parse(commands), {
  async checkpoint(phase) {
    if (phase === stop) {
      await pause(phase);
    }
  },
});
