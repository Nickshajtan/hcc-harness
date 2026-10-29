// Test driver: IPC acknowledges an actual persisted checkpoint, then pauses until
// the parent terminates this process. Production has no test environment switches.
const [moduleUrl, root, commands, stop] = process.argv.slice(2);
const { reconcileRoutes } = await import(moduleUrl);
await reconcileRoutes(root, JSON.parse(commands), {
  async checkpoint(phase) {
    if (phase === stop) {
      process.send({ checkpoint: phase });
      await new Promise((resolve) => process.once('message', resolve));
    }
  },
});
