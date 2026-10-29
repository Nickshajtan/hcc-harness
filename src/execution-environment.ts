// Composition changes only the execution-local copy, never the caller's environment or PATH policy.
export function composeLaunchEnvironment(
  native: NodeJS.ProcessEnv,
  changes: Readonly<Record<string, string>>,
  executionId: string,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const retained = Object.entries(native).filter(
    ([key]) =>
      'win32' !== platform ||
      !Object.keys(changes).some((name) => name.toUpperCase() === key.toUpperCase()),
  );
  return { ...Object.fromEntries(retained), ...changes, ARCH_ACTIVE: executionId };
}
