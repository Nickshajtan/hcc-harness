import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const entry = resolve('dist/mock-provider-cli.js');
const request = {
  type: 'agent.beforeSpawn',
  requestId: 'native-hook-1',
  provider: 'mock',
  parentAgentId: 'economy-main',
};

async function hook(input: string, cwd: string, scenario?: string) {
  const args = scenario ? [resolve('tests/fixtures/policy-hook.mjs'), scenario] : [entry];
  const child = spawn(process.execPath, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '',
    stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  // An oversized request may be rejected before the writer has drained.
  child.stdin.on('error', (error: NodeJS.ErrnoException) => {
    if ('EPIPE' !== error.code && 'EOF' !== error.code) {
      throw error;
    }
  });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  child.stdin.end(input);
  const code = await closed;
  return { code, stdout, stderr };
}

it.each([
  ['economy', 0, 'allow'],
  ['premium', 1, 'deny'],
] as const)(
  'the mock respects %s delegation with a single structured %s response',
  async (requestedModel, code, outcome) => {
    const root = await mkdtemp(join(tmpdir(), 'arch-hook-'));
    try {
      // Invalid project configuration proves the standalone hook does not discover/init it.
      await writeFile(join(root, 'harness.toml'), 'sentinel');
      const before = await readdir(root);
      const result = await hook(JSON.stringify({ ...request, requestedModel }), root);
      expect(result.code).toBe(code);
      expect(result.stdout.trim().split('\n')).toHaveLength(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        outcome,
        requestId: request.requestId,
        permitted: 0 === code,
      });
      if (0 === code) {
        expect(result.stderr).toBe('');
      } else {
        expect(result.stderr).toBe('[arch mock hook] deny\n');
      }
      expect(await readdir(root)).toEqual(before);
      expect(await readFile(join(root, 'harness.toml'), 'utf8')).toBe('sentinel');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

it.each([
  '{',
  '',
  '{}\n{}',
  JSON.stringify({ ...request, type: 'unknown' }),
  JSON.stringify({ ...request, requestedModel: 'x'.repeat(17 * 1024) }),
])('rejects invalid or oversized hook input without authorization', async (input) => {
  const result = await hook(input, tmpdir());
  expect(result.code).toBe(2);
  expect(JSON.parse(result.stdout)).toEqual({ outcome: 'invalid-request' });
  expect(result.stderr).toBe('[arch mock hook] invalid-request\n');
});

it.each([
  ['async-registration', 3, 'registration-contract'],
  ['missing-policy', 7, 'configuration-error'],
  ['handler-timeout', 6, 'timeout'],
] as const)('the real mock transport refuses %s', async (scenario, code, failureCode) => {
  const result = await hook(JSON.stringify(request), tmpdir(), scenario);
  expect(result.code).toBe(code);
  expect(result.stdout.trim().split('\n')).toHaveLength(1);
  const response: unknown = JSON.parse(result.stdout);
  expect(response).toMatchObject({
    outcome: 'policy-error',
    permitted: false,
    requestId: request.requestId,
  });
  const failures = (response as { failures: unknown[] }).failures;
  const primaryStage = 'async-registration' === scenario ? 'registration' : 'configuration';
  if ('handler-timeout' === scenario) {
    const primary = failures[0] as { stage: unknown };
    expect(['registration', 'handler']).toContain(primary.stage);
    expect(primary).toEqual({
      code: 'timeout',
      middlewareId: 'required',
      stage: primary.stage,
    });
    // Scheduler delay can exhaust the same grace before even synchronous cleanup settles.
    // Keep the exact primary refusal and validate any secondary diagnostic, without retries.
    expect(failures.length).toBeLessThanOrEqual(2);
    for (const secondary of failures.slice(1)) {
      expect(secondary).toEqual({ code: 'timeout', middlewareId: 'required', stage: 'cleanup' });
    }
  } else {
    expect(failures).toEqual([
      { code: failureCode, middlewareId: 'required', stage: primaryStage },
    ]);
  }
  expect(result.stderr).toBe('[arch mock hook] policy-error\n');
  expect(result.stdout + result.stderr).not.toContain('private');
});
