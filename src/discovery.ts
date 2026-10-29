import { nativeEnvironment, resolveExecutable } from './process.js';

export const cliCatalogue = [
  { command: 'claude', label: 'Claude Code' },
  { command: 'codex', label: 'OpenAI Codex' },
  { command: 'gemini', label: 'Gemini CLI' },
  { command: 'opencode', label: 'OpenCode' },
  { command: 'aider', label: 'Aider' },
] as const;
export interface CliCandidate {
  command: string;
  label: string;
  available: boolean;
  executablePath?: string;
}
export async function discoverClis(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
  catalogue: readonly { command: string; label: string }[] = cliCatalogue,
): Promise<CliCandidate[]> {
  const native = await nativeEnvironment(env, root);
  return Promise.all(
    catalogue.map(async (candidate) => {
      try {
        return {
          ...candidate,
          available: true,
          executablePath: await resolveExecutable(candidate.command, root, native),
        };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Native executable not found:')) {
          return { ...candidate, available: false };
        }
        throw error;
      }
    }),
  );
}
export function defaultSelection(
  candidates: readonly CliCandidate[],
  current: readonly string[] = [],
): string[] {
  return current.length
    ? [...current]
    : candidates
        .filter((c) => c.available && ['claude', 'codex'].includes(c.command))
        .map((c) => c.command);
}
