#!/usr/bin/env node
import { runCommand } from './cli/native-run.js';
import { publicCommand, UsageError } from './commands.js';

async function main(): Promise<void> {
  const [operation, command, ...rest] = process.argv.slice(2);
  if ('run' !== operation) {
    await publicCommand(process.argv.slice(2));
    return;
  }
  if (!command || '--' !== rest[0]) {
    throw new Error('Usage: arch run <command> -- [args...]');
  }
  await runCommand(command, rest.slice(1));
}

main().catch((error: unknown) => {
  console.error('[arch]', error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.cause instanceof Error) {
    console.error('[arch]', error.cause.message);
  }
  process.exitCode = error instanceof UsageError ? 2 : 1;
});
