// One Windows PTY per process. The process boundary owns node-pty's native
// handles and worker threads; onExit alone does not release them in 1.1.0.
import { spawn } from 'node-pty';

let terminal;
let finished = false;
const subscriptions = [];
function finish(result) {
  if (finished) {
    return;
  }
  finished = true;
  for (const subscription of subscriptions) {
    subscription.dispose();
  }
  // IPC send completion precedes process teardown. This is deliberate boundary
  // disposal, not proof of success: the parent checks the result AND OS state.
  process.send({ type: 'result', ...result });
}
process.on('message', (message) => {
  if ('start' === message.type) {
    try {
      terminal = spawn(message.file, message.args, message.options);
      process.send({ type: 'spawned', pid: terminal.pid });
      subscriptions.push(terminal.onData((data) => process.send({ type: 'data', data })));
      subscriptions.push(terminal.onExit((event) => finish({ event })));
    } catch (error) {
      finish({ error: String(error) });
    }
  } else if ('release' === message.type && finished) {
    process.exit(0);
  } else if ('write' === message.type && !finished) {
    terminal.write(message.data);
  } else if ('kill' === message.type && !finished) {
    // Failure/interruption only. Never invoke kill after normal shell exit:
    // 1.1.0 starts a console-list agent against an already dead shell PID.
    terminal.kill();
  }
});
process.on('disconnect', () => {
  // Lost owner is a failure. OS teardown releases this driver's PTY resources.
  process.exit(1);
});
