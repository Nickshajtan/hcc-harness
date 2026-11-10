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

async function hook(input: string, cwd: string) {
  const child = spawn(process.execPath, [entry], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
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
