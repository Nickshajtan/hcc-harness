import type { InstallationStatus } from '../lifecycle.js';

export function statusMessage(status: InstallationStatus): string {
  let miseStatus = 'unknown';
  if (true === status.activation.miseAvailable) {
    miseStatus = 'detected';
  } else if (false === status.activation.miseAvailable) {
    miseStatus = 'not detected';
  }
  return `Project: ${status.projectRoot}\nInstallation: ${status.state}\nConfigured routes: ${status.routes.join(', ') || '(none)'}\nIntegrity: ${status.integrity}\nPending recovery: ${String(status.recoveryPending)}\nActivation: shell unknown; mise ${miseStatus}; project bin ${status.activation.projectBinOnPath ? 'on PATH' : 'not on PATH'}\n${status.warnings.join('\n')}`;
}
