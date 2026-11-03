import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './build-publication.mjs';

if ('win32' === process.platform) {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-File',
      fileURLToPath(new URL('./b1/build-bootstrap.ps1', import.meta.url)),
      '-Stable',
      ...(process.env.ARCH_WINDOWS_SDK ? ['-WindowsSdk', process.env.ARCH_WINDOWS_SDK] : []),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
}
