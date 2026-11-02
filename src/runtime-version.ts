// Deliberately conservative: this module can load before application imports on
// an unsupported Node. Keep the package engine and native bootstrap in agreement.
export function compatibleRuntime(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return null !== match && '24' === match[1] && 15 <= Number(match[2]);
}
