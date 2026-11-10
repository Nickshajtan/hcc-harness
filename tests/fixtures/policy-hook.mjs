import { runMockHook, mockProviderCapabilities } from '../../dist/mock-provider.js';

// Scenarios are chosen by trusted test code, never by the untrusted stdin request.
const scenario = process.argv[2];
const policy = () => ({
  id: 'required',
  register: () => undefined,
  registerPolicy(api) {
    api.cleanup(() => undefined);
    if ('async-registration' === scenario) {
      return Promise.reject(new Error('private registration detail'));
    }
    api.on('agent.beforeSpawn', () => new Promise(() => undefined));
  },
});

process.exitCode = await runMockHook({
  input: process.stdin,
  output: process.stdout,
  diagnostics: process.stderr,
  capabilities: mockProviderCapabilities,
  configuration: {
    middleware: 'missing-policy' === scenario ? [] : [{ id: 'required', enabled: true }],
  },
  registry: new Map([['required', policy]]),
  policyOptions: { requiredPolicies: ['required'], timeoutMs: 25, cleanupGraceMs: 10 },
});
