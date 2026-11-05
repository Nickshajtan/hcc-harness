import type { InstallationStatus } from '../lifecycle.js';

export function statusMessage(status: InstallationStatus): string {
  let setupMessage = '';
  if (status.setup) {
    const setup = status.setup;
    setupMessage = `Setup claim: ${setup.claimPresent ? 'present' : 'absent'}\nBootstrap manifest: ${setup.bootstrapPresent ? 'present' : 'absent'}\nSetup stages: ${setup.stagingPaths.join(', ') || '(none)'}\nManual setup recovery: ${String(setup.manualRecoveryRequired)}\nSetup recovery documentation: ${setup.documentation}\n`;
  }
  let miseStatus = 'unknown';
  if (true === status.activation.miseAvailable) {
    miseStatus = 'detected';
  } else if (false === status.activation.miseAvailable) {
    miseStatus = 'not detected';
  }
  return `Project: ${status.projectRoot}\nInstallation: ${status.state}\nConfigured routes: ${status.routes.join(', ') || '(none)'}\nIntegrity: ${status.integrity}\nPending recovery: ${String(status.recoveryPending)}\n${setupMessage}Activation: shell unknown; mise ${miseStatus}; project bin ${status.activation.projectBinOnPath ? 'on PATH' : 'not on PATH'}\n${status.warnings.join('\n')}`;
}
