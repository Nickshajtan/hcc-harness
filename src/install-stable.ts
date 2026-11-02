import { fileURLToPath } from 'node:url';
import { installStable, installationDestination } from './installation/stable-install.js';

try {
  const npm = process.env.npm_execpath;
  if (!npm) {
    throw new Error(
      'Run through npm run install:stable so npm can materialize production dependencies',
    );
  }
  const destination = installationDestination(process.argv.slice(2));
  await installStable({ source: fileURLToPath(new URL('../', import.meta.url)), destination, npm });
  console.log(
    `Arch installed at ${destination}. CLI installation does not initialize project routing or activate mise.`,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
