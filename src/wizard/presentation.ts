import { resolve } from 'node:path';

export function installedMessage(root: string) {
  return `Arch installed for this project: ${resolve(root)}\nManaged paths: .arch/bin/*, .arch/bootstrap.json, .config/mise/conf.d/arch.toml\nShell activation has not been verified. Activate mise, refresh the shell prompt, and trust the project when prompted.\nFor explicit activation: mise exec -- <command>`;
}
export const removedMessage =
  'Arch project routing removed. Refresh the shell prompt to refresh command resolution.';
