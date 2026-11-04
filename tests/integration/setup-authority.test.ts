import { expect, it } from 'vitest';
import { execFile, type ExecFileException } from 'node:child_process';
import { resolve } from 'node:path';

// Deliberately blocks Windows CI until the documented authority amendment is
// implemented. Do not skip or invert this regression to make the draft green.
it.skipIf('win32' !== process.platform || 'x64' !== process.arch)(
  'does not adopt or delete foreign bootstrap metadata after an interrupted collision',
  async () => {
    const result = await new Promise<{
      error: ExecFileException | null;
      stdout: string;
      stderr: string;
    }>((done) => {
      execFile(
        process.execPath,
        [resolve('scripts/reproduce-setup-authority.mjs')],
        { timeout: 45000, killSignal: 'SIGKILL', windowsHide: true, maxBuffer: 65536 },
        (error, stdout, stderr) => {
          done({ error, stdout, stderr });
        },
      );
    });
    expect(result.error, `${result.stdout}\n${result.stderr}`).toBeNull();
    expect(JSON.parse(result.stdout)).toMatchObject({
      result: 'PASS',
      repeatedSetupAccepted: false,
      routingAccepted: false,
      managedResourcesPreserved: true,
      foreignBootstrapRemoved: false,
      foreignBootstrapChanged: false,
    });
  },
);
