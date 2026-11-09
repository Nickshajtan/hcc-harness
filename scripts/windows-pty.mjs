import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);

// Read-only documented CIM data. Never identify or terminate a process by PID
// alone. No process-tree killing is used, including when settlement fails.
export async function processSnapshot() {
  const { stdout } = await execute(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate,ExecutablePath,Name | ConvertTo-Json -Compress",
    ],
    { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

function identity(process) {
  return JSON.stringify([process.ProcessId, process.CreationDate, process.ExecutablePath]);
}

function created(process) {
  return Number(process.CreationDate.match(/\d+/)?.[0]);
}

// driverFile is a test seam for premature-exit and hang protocol regressions.
export function spawn(
  file,
  args,
  options,
  driverFile = new URL('./pty-driver.mjs', import.meta.url),
) {
  const driver = fork(driverFile, [], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    windowsHide: true,
  });
  const dataListeners = new Set();
  const exitListeners = new Set();
  let stderr = '',
    result,
    spawned,
    failure;
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const evidence = { driverPid: driver.pid, processes: [], residual: [] };
  let captured = Promise.resolve();
  driver.stderr.on('data', (chunk) => {
    evidence.stderrTruncated ||= 65536 < stderr.length + chunk.length;
    stderr = (stderr + chunk).slice(-65536);
  });
  driver.on('error', (error) => {
    failure = error;
  });
  driver.on('message', (message) => {
    if ('spawned' === message.type || 'result' === message.type) {
      if ('spawned' === message.type) {
        spawned = message.pid;
        evidence.terminalPid = spawned;
      }
      captured = captured
        .then(processSnapshot)
        .then((snapshot) => {
          const owner = snapshot.find((entry) => entry.ProcessId === driver.pid);
          if (!owner || !owner.ExecutablePath || !owner.CreationDate) {
            throw new Error('PTY driver identity unavailable before settlement');
          }
          evidence.driver = owner;
          const owned = new Map([[driver.pid, owner]]);
          for (let size = 0; size !== owned.size;) {
            size = owned.size;
            for (const entry of snapshot) {
              const parent = owned.get(entry.ParentProcessId);
              if (parent && created(entry) >= created(parent)) {
                owned.set(entry.ProcessId, entry);
              }
            }
          }
          const known = new Map(evidence.processes.map((entry) => [identity(entry), entry]));
          for (const entry of snapshot.filter((entry) => owned.has(entry.ProcessId))) {
            known.set(identity(entry), entry);
          }
          evidence.processes = [...known.values()];
        })
        .catch((error) => {
          failure = error;
        });
      if ('result' === message.type) {
        result = message;
        if (message.event) {
          for (const listener of exitListeners) {
            listener(message.event);
          }
        }
        void captured.then(() => {
          if (driver.connected) {
            driver.send({ type: 'release' });
          }
        });
      }
    } else if ('data' === message.type) {
      for (const listener of dataListeners) {
        listener(message.data);
      }
    }
  });
  driver.on('close', (code, signal) => resolveClosed({ code, signal }));
  const deadline = setTimeout(() => {
    failure = new Error('PTY driver settlement deadline exceeded');
    // Direct captured child only; this is failure recovery and cannot pass.
    driver.kill();
    // An inherited stderr writer must not keep ChildProcess 'close' pending
    // after the driver has been terminated. Retained diagnostics remain above.
    driver.stderr.destroy();
  }, 30000);
  const settled = (async () => {
    try {
      const status = await closed;
      await captured;
      evidence.status = status;
      evidence.result = result;
      evidence.stderr = stderr;
      const until = Date.now() + 10000;
      const identities = new Set(evidence.processes.map(identity));
      do {
        evidence.residual = (await processSnapshot()).filter((entry) =>
          identities.has(identity(entry)),
        );
        if (0 === evidence.residual.length) {
          break;
        }
        await delay(100); // bounded condition polling, not a fixed settlement sleep
      } while (Date.now() < until);
      if (evidence.residual.length) {
        throw new Error('Test-owned PTY processes did not settle');
      }
      if (failure) {
        throw failure;
      }
      if (0 !== status.code || status.signal || !result) {
        throw new Error('PTY driver exited before reporting a complete result');
      }
      if (result.error) {
        throw new Error(result.error);
      }
      if (!spawned || !evidence.driver) {
        throw new Error('Missing PTY ownership evidence');
      }
      return { ...result.event, evidence };
    } catch (error) {
      const diagnostic = new Error(`${error.message}\n${JSON.stringify(evidence)}`, {
        cause: error,
      });
      diagnostic.evidence = evidence;
      throw diagnostic;
    } finally {
      clearTimeout(deadline);
    }
  })();
  // Callers may await settlement after their own output/exit assertions.
  void settled.catch(() => {});
  driver.send({ type: 'start', file, args, options });
  function subscribe(listeners, listener) {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  }
  return {
    settled,
    onData: (listener) => subscribe(dataListeners, listener),
    onExit: (listener) => subscribe(exitListeners, listener),
    write: (data) => {
      void captured.then(() => {
        if (!result && driver.connected) {
          driver.send({ type: 'write', data });
        }
      });
    },
    kill: () => {
      void captured.then(() => {
        if (!result && driver.connected) {
          driver.send({ type: 'kill' });
        }
      });
    },
  };
}
