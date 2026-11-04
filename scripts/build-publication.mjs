import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

if ('win32' === process.platform) {
  if ('x64' !== process.arch) {
    throw new Error('Native publication currently supports Windows x64 only');
  }
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-File',
      fileURLToPath(new URL('./build-publication.ps1', import.meta.url)),
      ...(process.env.ARCH_WINDOWS_SDK ? ['-WindowsSdk', process.env.ARCH_WINDOWS_SDK] : []),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  const toolchain = JSON.parse(
    await readFile(new URL('../.tools/publication/toolchain.json', import.meta.url), 'utf8'),
  );
  if (
    !toolchain ||
    'x64' !== toolchain.architecture ||
    'string' !== typeof toolchain.msvc ||
    !/^\d+\.\d+\.\d+$/.test(toolchain.msvc) ||
    'string' !== typeof toolchain.sdk ||
    !/^\d+\.\d+\.\d+\.\d+$/.test(toolchain.sdk)
  ) {
    throw new Error('Native compiler did not report an explicit x64 toolset and Windows SDK');
  }
  if (process.env.ARCH_WINDOWS_SDK && toolchain.sdk !== process.env.ARCH_WINDOWS_SDK) {
    throw new Error('Native compiler selected a different Windows SDK than requested');
  }
  const hash = async (path) =>
    createHash('sha256')
      .update(await readFile(new URL(path, import.meta.url)))
      .digest('hex');
  await writeFile(
    new URL('../.tools/publication/provenance.json', import.meta.url),
    JSON.stringify(
      {
        protocol: 1,
        sha256: await hash('../.tools/publication/arch-publication-v1.exe'),
        source: await hash('../native/publication/rename-no-replace.cpp'),
        toolchain: 'MSVC x64 /MT /W4 /WX /O2 /Brepro',
        msvc: toolchain.msvc,
        sdk: toolchain.sdk,
      },
      null,
      2,
    ) + '\n',
  );
}
